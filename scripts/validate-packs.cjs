#!/usr/bin/env node
'use strict';

// Command-line pack validator: the same checks as "Pack validation" in the
// collector (utils/pack-validator.js), without a browser and without npm.
// Run `node scripts/validate-packs.cjs --help` for the options.

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const usage = `Usage: node scripts/validate-packs.cjs [options] [pack.json ...]

Without pack files, checks the app's configuration as the collector does:
config/config.yaml, or config/config-default.yaml if there is none.

  pack.json ...          Check these pack files on their own. Packs of the
                         publication form are checked together with
                         packs/core-meta.json and packs/core-pub.json, other
                         packs together with packs/core-meta.json.
  --all                  Check the configuration and every pack in packs/
                         (packs/archive/ is only checked for valid JSON).
  --config <file>        Configuration file to check.
  --with <pack.json>     Also load this pack as a dependency (repeatable).
  --alone                Do not add the core packs automatically.
  --format <format>      text (default), json, or github (annotations for
                         GitHub Actions).
  --notices              Also list notices (otherwise only counted).
  --strict               Also fail on warnings and on problems that do not
                         block (inactive output types, alpha/beta packs).
  --root <dir>           Repository root (default: this checkout).
  -h, --help             Show this help.

Exit codes: 0 = no blocking errors (with --strict: no errors and no warnings),
1 = problems found, 2 = usage or setup error.`;

function parseArgs(argv) {
    const options = { files: [], with: [], format: 'text', all: false, alone: false, strict: false, notices: false, config: null, root: path.join(__dirname, '..') };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const value = () => {
            if (i + 1 >= argv.length) throw new UsageError(`${arg} needs a value.`);
            return argv[++i];
        };
        if (arg === '-h' || arg === '--help') options.help = true;
        else if (arg === '--all') options.all = true;
        else if (arg === '--alone') options.alone = true;
        else if (arg === '--strict') options.strict = true;
        else if (arg === '--notices') options.notices = true;
        else if (arg === '--config') options.config = value();
        else if (arg === '--with') options.with.push(value());
        else if (arg === '--format') options.format = value();
        else if (arg === '--root') options.root = path.resolve(value());
        else if (arg.startsWith('-')) throw new UsageError(`Unknown option ${arg}.`);
        else options.files.push(arg);
    }
    if (!['text', 'json', 'github'].includes(options.format)) throw new UsageError(`Unknown format "${options.format}".`);
    return options;
}

class UsageError extends Error {}

// Pack paths are reported relative to the repository root, as in the app.
const relative = (root, file) => {
    const absolute = path.resolve(file);
    const inside = path.relative(root, absolute);
    return inside.startsWith('..') || path.isAbsolute(inside) ? file : inside.split(path.sep).join('/');
};

// Loads the app's own scripts into one VM context.
function loadApp(root) {
    const read = file => fs.readFileSync(path.join(root, file), 'utf8');
    const ctx = vm.createContext({
        console,
        // use() fetches "./packs/..." relative to the app; serve repository files.
        fetch: async url => {
            const file = path.join(root, String(url).replace(/^\.\//, ''));
            const ok = fs.existsSync(file) && fs.statSync(file).isFile();
            return {
                ok, status: ok ? 200 : 404,
                text: async () => fs.readFileSync(file, 'utf8'),
                json: async () => JSON.parse(fs.readFileSync(file, 'utf8'))
            };
        }
    });
    const run = (code, file) => vm.runInContext(code, ctx, { filename: file });
    run(read('js/js-yaml.min.js'), 'js/js-yaml.min.js');
    run(read('utils/packutils.js').replace(/^export\s+/gm, ''), 'utils/packutils.js');
    for (const file of ['utils/pack-validator.js', 'utils/expressions.js', 'utils/assemble.js', 'menu.js']) run(read(file), file);
    return ctx;
}

async function checkConfiguration(ctx, root, configFile) {
    const candidates = configFile ? [configFile] : ['config/config.yaml', 'config/config-default.yaml'];
    const file = candidates.find(candidate => fs.existsSync(path.resolve(root, candidate)));
    if (!file) throw new UsageError(`Configuration file not found: ${candidates.join(' or ')}.`);
    const name = relative(root, path.resolve(root, file));
    const text = fs.readFileSync(path.resolve(root, file), 'utf8');
    let config;
    try {
        config = ctx.parseConfigFile(text, name);
    } catch (error) {
        // An unusable configuration stops the collector: report it as a blocking error.
        const issue = {
            code: 'invalid-configuration', severity: 'error', form: null, indicator: null, field: null, pack: name, line: null,
            message: error.message, hint: 'Fix the configuration file; the collector shows this error instead of starting.',
            deferred: null, blocking: true
        };
        return { name: `Configuration ${name}`, kind: 'configuration', report: { issues: [issue], errors: [issue], warnings: [], blocking: [issue], current: [issue], deferred: [], notices: [], indicatorsChecked: 0 } };
    }
    const forms = await ctx.menu(config);
    forms.config = config;
    return { name: `Configuration ${name}`, kind: 'configuration', report: ctx.PackValidator.validate(forms) };
}

function checkPack(ctx, root, file, options) {
    const source = relative(root, file);
    const absolute = path.resolve(root, file);
    if (!fs.existsSync(absolute)) throw new UsageError(`Pack file not found: ${file}.`);
    const text = fs.readFileSync(absolute, 'utf8');
    const companions = [];
    const addCompanion = companion => {
        const companionPath = path.resolve(root, companion);
        if (!fs.existsSync(companionPath)) throw new UsageError(`Pack file not found: ${companion}.`);
        companions.push({ source: relative(root, companion), text: fs.readFileSync(companionPath, 'utf8') });
    };
    if (!options.alone) {
        let prefix = null;
        try { prefix = JSON.parse(text)?.prefix; } catch { /* reported as invalid-json */ }
        const form = ctx.PackValidator.formOfPrefix(prefix);
        if (form !== 'meta') addCompanion('packs/core-meta.json');
        if (form === 'pub' && prefix !== 'P') addCompanion('packs/core-pub.json');
    }
    options.with.forEach(addCompanion);
    const report = /^packs\/archive\//.test(source)
        ? (() => {
            const { issues } = ctx.PackValidator.parsePackText(source, text);
            const marked = issues.map(issue => ({ ...issue, deferred: null, blocking: true }));
            return { issues: marked, errors: marked, warnings: [], blocking: marked, current: marked, deferred: [], notices: [], indicatorsChecked: 0 };
        })()
        : ctx.PackValidator.checkPackFiles([{ source, text }], companions);
    return { name: `Pack ${source}`, kind: 'pack', report };
}

function allPackFiles(root) {
    const files = [];
    (function walk(dir) {
        for (const name of fs.readdirSync(path.join(root, dir)).sort()) {
            const file = `${dir}/${name}`;
            if (fs.statSync(path.join(root, file)).isDirectory()) walk(file);
            else if (name.endsWith('.json') && file !== 'packs/info.json') files.push(file);
        }
    })('packs');
    return files;
}

// --- Output ------------------------------------------------------------------

const where = issue => [issue.pack, issue.line].filter(value => value !== null && value !== undefined).join(':');
const reason = issue => issue.deferred === 'inactive' ? 'not blocking: output type inactive' : issue.deferred ? `not blocking: ${issue.deferred} pack` : '';

function counts(report) {
    const warnings = report.current.filter(issue => issue.severity === 'warning').length;
    return `${report.blocking.length} blocking error${report.blocking.length === 1 ? '' : 's'}, ${warnings} warning${warnings === 1 ? '' : 's'}, ${report.deferred.length} not blocking, ${report.notices.length} notice${report.notices.length === 1 ? '' : 's'}`;
}

function failed(report, strict) {
    return strict
        ? report.issues.some(issue => issue.severity !== 'notice')
        : report.blocking.length > 0;
}

function formatText(results, options) {
    const lines = [];
    const show = (issue, indent) => {
        const head = [issue.severity.toUpperCase().padEnd(7), issue.code, where(issue), issue.indicator ? `(${issue.indicator})` : '', reason(issue) ? `[${reason(issue)}]` : '']
            .filter(Boolean).join('  ');
        lines.push(`${indent}${head}`);
        lines.push(`${indent}    ${issue.message}`);
        if (issue.hint) lines.push(`${indent}    How to fix: ${issue.hint}`);
    };
    for (const { name, report } of results) {
        lines.push(`${name}: ${counts(report)}`);
        report.current.forEach(issue => show(issue, '  '));
        if (report.deferred.length) {
            lines.push(`  Not blocking (${report.deferred.length}):`);
            report.deferred.forEach(issue => show(issue, '    '));
        }
        if (report.notices.length && options.notices) {
            lines.push(`  Notices (${report.notices.length}):`);
            report.notices.forEach(issue => show(issue, '    '));
        }
        lines.push('');
    }
    const bad = results.filter(result => failed(result.report, options.strict)).length;
    lines.push(bad
        ? `FAILED: ${bad} of ${results.length} checked ${results.length === 1 ? 'target has' : 'targets have'} ${options.strict ? 'errors or warnings' : 'blocking errors'}.`
        : `OK: ${results.length} checked, no ${options.strict ? 'errors or warnings' : 'blocking errors'}.`);
    lines.push(`Rules and fixes: ${results[0]?.guideUrl ?? 'documentation/RESQUE-Pack-Guide.md#validator-rules'}`);
    return lines.join('\n');
}

// GitHub Actions workflow commands; see "Workflow commands for GitHub Actions".
function formatGitHub(results, options) {
    const data = text => String(text).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
    const property = text => data(text).replace(/:/g, '%3A').replace(/,/g, '%2C');
    const lines = [];
    for (const { report } of results) {
        const list = [...report.current, ...report.deferred, ...(options.notices ? report.notices : [])];
        for (const issue of list) {
            const level = issue.blocking || (options.strict && issue.severity !== 'notice') ? 'error'
                : issue.severity === 'warning' && !issue.deferred ? 'warning' : 'notice';
            const props = [issue.pack && `file=${property(issue.pack)}`, issue.line && `line=${issue.line}`, `title=${property(issue.code)}`].filter(Boolean).join(',');
            const text = `${reason(issue) ? `[${reason(issue)}] ` : ''}${issue.indicator ? `${issue.indicator}: ` : ''}${issue.message} How to fix: ${issue.hint ?? ''}`;
            lines.push(`::${level} ${props}::${data(text)}`);
        }
    }
    lines.push(formatText(results, { ...options, notices: false }).split('\n').slice(-2, -1)[0]);
    return lines.join('\n');
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
        console.log(usage);
        return 0;
    }
    const root = options.root;
    if (!fs.existsSync(path.join(root, 'utils/pack-validator.js'))) throw new UsageError(`Not a collector-app checkout: ${root}.`);
    const ctx = loadApp(root);
    const results = [];
    if (!options.files.length || options.all) results.push(await checkConfiguration(ctx, root, options.config));
    const packs = options.all ? [...new Set([...options.files, ...allPackFiles(root)])] : options.files;
    for (const file of packs) results.push(checkPack(ctx, root, path.isAbsolute(file) ? file : path.join(root, file), options));
    for (const result of results) result.guideUrl = ctx.PackValidator.guideUrl;
    const ok = !results.some(result => failed(result.report, options.strict));
    if (options.format === 'json') {
        console.log(JSON.stringify({ ok, strict: options.strict, results: results.map(({ name, kind, report }) => ({ name, kind, report })) }, null, 2));
    } else {
        console.log(options.format === 'github' ? formatGitHub(results, options) : formatText(results, options));
    }
    return ok ? 0 : 1;
}

main().then(code => { process.exitCode = code; }, error => {
    console.error(error instanceof UsageError ? `${error.message}\n\n${usage}` : error.stack || String(error));
    process.exitCode = 2;
});
