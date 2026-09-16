#!/usr/bin/env node
'use strict';

// Run from any working directory:
//   node /path/to/collector-app/tests/verify-packs.cjs [repository-root] [--strict]
// Default root: the parent of this script's directory. No npm install is needed.
// stdout is a single JSON report. Exit 1: failed check/invalid JSON; exit 2:
// invocation/setup error. --strict also exits 1 when known issues are reproduced.
// Regression checks protect fixes. Known-issue checks deliberately reproduce
// defects; they are NOT acceptance criteria. Promote them after fixing the app.

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');

const args = process.argv.slice(2);
if (args.includes('--help')) {
    console.log('Usage: node tests/verify-packs.cjs [repository-root] [--strict]\n' +
        'Default root is relative to this script, not the working directory.\n' +
        '--strict also fails for reproduced known issues. Output is JSON.');
    process.exit(0);
}
const positional = args.filter(arg => !arg.startsWith('--'));
if (positional.length > 1 || args.some(arg => arg.startsWith('--') && arg !== '--strict')) {
    console.log(JSON.stringify({ error: 'Usage: node tests/verify-packs.cjs [repository-root] [--strict]' }, null, 2));
    process.exit(2);
}
const root = path.resolve(positional[0] || path.join(__dirname, '..'));
const strict = args.includes('--strict');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const pack = name => JSON.parse(read(`packs/${name}.json`));
const plain = value => JSON.parse(JSON.stringify(value));
const closeTo = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10,
    `Expected ${actual} to be close to ${expected}`);

// These are excerpts of the actual browser code, not copied implementations.
// Missing or ambiguous anchors must fail explicitly after a source refactor.
function between(source, start, end, filename) {
    const from = source.indexOf(start);
    if (from < 0 || source.indexOf(start, from + start.length) >= 0) {
        throw new Error(`${filename}: missing/ambiguous start anchor ${JSON.stringify(start)}`);
    }
    const to = source.indexOf(end, from + start.length);
    if (to < 0) throw new Error(`${filename}: missing end anchor ${JSON.stringify(end)}`);
    return source.slice(from, to);
}

function memoryStorage() {
    const values = new Map();
    return {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: key => values.delete(key),
        clear: () => values.clear()
    };
}

function harness() {
    const html = read('index.html');
    const preview = read('preview.html');
    const stores = {};
    const requests = [];
    const alerts = [];
    const localStorage = memoryStorage();
    const sessionStorage = memoryStorage();
    const ctx = vm.createContext({
        console: { log() {}, warn() {}, error() {} },
        URLSearchParams,
        localStorage,
        sessionStorage,
        window: { location: { href: 'http://example.invalid/index.html', search: '' } },
        alert: message => alerts.push(message),
        driver: () => ({ drive() {} }),
        tourForm: {},
        switchToTab() {},
        Alpine: {
            store(name, value) {
                if (arguments.length === 2) stores[name] = value;
                return stores[name];
            }
        },
        // No networking. Resolve fetches against files in the supplied checkout.
        async fetch(url) {
            assert.equal(typeof url, 'string');
            assert.ok(!/^(?:[a-z]+:)?\/\//i.test(url), `Unexpected external fetch: ${url}`);
            const relative = path.normalize(url.replace(/^\.\//, ''));
            assert.ok(!path.isAbsolute(relative) && !relative.startsWith('..'), `Unsafe fetch: ${url}`);
            requests.push(relative);
            const file = path.join(root, relative);
            const ok = fs.existsSync(file) && fs.statSync(file).isFile();
            return {
                ok,
                status: ok ? 200 : 404,
                text: async () => ok ? read(relative) : 'Not found',
                json: async () => {
                    if (!ok) throw new Error(`404: ${relative}`);
                    return JSON.parse(read(relative));
                }
            };
        }
    });
    const run = (code, filename) => vm.runInContext(code, ctx, { filename, timeout: 5000 });
    const expose = (source, names, filename) => run(source + '\n' +
        names.map(name => `globalThis.${name} = ${name};`).join('\n'), filename);
    const fromIndex = (start, end, names) => expose(between(html, start, end, 'index.html'), names, 'index.html');

    expose(read('utils/score2.js'), ['score', 'scoreAll'], 'utils/score2.js');
    expose(read('utils/packutils.js').replace(/^export\s+(?=const )/gm, ''), ['getDefaultValues'], 'utils/packutils.js');
    expose(read('utils/keyalias.js').replace(/^export\s+(?=const )/gm, ''), ['renameOldKeys'], 'utils/keyalias.js');
    run(read('js/js-yaml.min.js'), 'js/js-yaml.min.js');
    fromIndex('const preprocessCondition =', 'const partialHighlight =', ['evaluateConditionInContext', 'preprocessCondition']);
    fromIndex('const checkCompletion =', 'const getProgressColor =', ['checkCompletion']);
    fromIndex('async function use(config,', '</script>', ['use', 'pick', 'pickExclude']);
    expose(read('menu.js'), ['menu', 'pickAccordingToConfig', 'normalizePublicationConfig', 'normalizePublicationSource'], 'menu.js');
    fromIndex('function getQueryConfig(params)', 'const params = new URLSearchParams', ['getQueryConfig']);
    fromIndex('const loadConfigText =', 'loadConfigText().then(text =>', ['loadConfigText']);
    fromIndex('const getCollectorUrl =', "Alpine.store('selectedIndicator', {});", ['getConfig', 'getScoreCategories']);
    fromIndex('const handleLoad =', 'const filterExport =', ['handleLoad']);
    fromIndex('const filterExport =', '// this is the export function', ['filterExport']);
    run(between(html, 'let prefixes =', '</script>', 'index.html'), 'index.html');
    run(between(html, "Alpine.store('data', {", "Alpine.store('warnings', {", 'index.html'), 'index.html');
    run(between(html, "Alpine.store('warnings', {", 'Alpine.effect(() => {', 'index.html'), 'index.html');
    expose(between(preview, 'const resolvePackInQuery =', 'const packToHTML =', 'preview.html'), ['resolvePackInQuery'], 'preview.html');
    const selection = between(html,
        '// Resolve an optional pack selection using preview.html query syntax.',
        "Alpine.store('forms').config = config;", 'index.html');
    run(`globalThis.selectCollectorPack = (config, query) => {
        const params = new URLSearchParams(query);
        normalizePublicationConfig(config);
        ${selection}
        return config;
    };`, 'index.html:pack-selection');

    Object.assign(ctx.window, {
        score: ctx.score,
        scoreAll: ctx.scoreAll,
        getDefaultValues: ctx.getDefaultValues,
        renameOldKeys: ctx.renameOldKeys
    });
    stores.config = { config: { statements_only_for_top_publications: true, pub: { active: true } }, queryConfig: { global: {} } };
    stores.data.input = [{ type: 'meta', RaterType: 'Applicant' }];
    stores.forms = {};
    return {
        ctx, stores, requests, alerts, localStorage, sessionStorage,
        defaults: elements => ctx.getDefaultValues(elements),
        uiEval: (expression, record) => ctx.evaluateConditionInContext(expression, record),
        defaultConfig: () => plain(ctx.jsyaml.load(read('config/config-default.yaml'))),
        preview(query) {
            ctx.window.location.search = query;
            return plain(ctx.resolvePackInQuery());
        },
        scorePack(definition, answers, type = 'pub') {
            return ctx.score({ type, ...ctx.getDefaultValues(definition.elements), ...answers }, { forms: { [type]: definition } });
        },
        async assemble(config) {
            const forms = await ctx.menu(config);
            stores.forms = { ...forms, config };
            stores.data.input = [stores.data.createResearchOutput('meta')];
            stores.data.input[0].forms = stores.forms;
            return forms;
        }
    };
}

const checks = [];
const regression = (id, name, test) => checks.push({ id, name, kind: 'regression', test });
const knownIssue = (id, finding, name, test) => checks.push({ id, finding, name, kind: 'known-issue', test });
const characterization = (id, finding, name, test) => checks.push({ id, finding, name, kind: 'characterization', test });
const item = (h, definition, id, answers, type = 'pub') => plain(h.scorePack(definition, answers, type).items[id] ?? null);
const base = {
    P_Suitable: 'Yes', P_Data: 'Yes', P_Data_Source_NewOwn: true,
    P_Data_Open: 'YesEntire', P_Data_Open_AccessLevel: 'ZK0',
    P_Data_Open_Identifier: 'https://example.org/data'
};

regression('PUB-DEFAULT', 'Default YAML and active publication pack use pub/core-pub.json', () => {
    const h = harness();
    const config = h.defaultConfig();
    assert.equal(config.pub.active, true);
    assert.equal(Object.hasOwn(config, 'pubs'), false);
    assert.deepEqual(config.pub.sources, ['packs/core-pub.json']);
    assert.equal(fs.existsSync(path.join(root, 'packs/core-pubs.json')), false);
    assert.equal(pack('core-pub').prefix, 'P');
    return { sources: config.pub.sources, packVersion: pack('core-pub').version };
});
regression('PUB-FALLBACK', 'Configuration loader reads the default file when config.yaml is absent', async () => {
    const h = harness();
    // Force the absent-config branch even in checkouts with a local config.yaml.
    const originalFetch = h.ctx.fetch;
    h.ctx.fetch = async url => url === './config/config.yaml'
        ? { ok: false, status: 404 } : originalFetch(url);
    const config = h.ctx.normalizePublicationConfig(h.ctx.jsyaml.load(await h.ctx.loadConfigText()));
    assert.deepEqual(plain(config.pub.sources), ['packs/core-pub.json']);
    return { loaded: h.requests };
});
regression('PUB-LEGACY-YAML', 'Legacy YAML is normalized through the actual loader/menu path', async () => {
    const h = harness();
    const config = h.defaultConfig();
    config.pubs = config.pub;
    delete config.pub;
    config.pubs.sources = ['packs/core-pubs.json', 'packs/EP/EP-theory_development.json'];
    const text = h.ctx.jsyaml.dump(config);
    const originalFetch = h.ctx.fetch;
    h.ctx.fetch = async url => url === './config/config.yaml'
        ? { ok: true, text: async () => text } : originalFetch(url);
    const loaded = h.ctx.normalizePublicationConfig(h.ctx.jsyaml.load(await h.ctx.loadConfigText()));
    const forms = await h.assemble(loaded);
    assert.equal(forms.pub.elements.length, pack('core-pub').elements.length + pack('EP/EP-theory_development').elements.length);
    assert.equal(Object.hasOwn(forms, 'pubs'), false);
    assert.ok(h.requests.includes('packs/core-pub.json'));
    assert.ok(!h.requests.includes('packs/core-pubs.json'));
    return { keys: Object.keys(forms), sources: plain(loaded.pub.sources) };
});
regression('PUB-PRECEDENCE', 'Canonical pub takes precedence; normalization is idempotent', () => {
    const h = harness();
    const config = { pub: { sources: ['packs/core-pub.json'] }, pubs: { sources: ['legacy-only.json'] } };
    assert.equal(h.ctx.normalizePublicationConfig(config), config);
    assert.deepEqual(config.pub.sources, ['packs/core-pub.json']);
    const once = plain(config);
    h.ctx.normalizePublicationConfig(config);
    assert.deepEqual(plain(config), once);
    return { canonical: config.pub.sources, legacyKeyRetained: Object.hasOwn(config, 'pubs') };
});
regression('PUB-EXACT-ALIAS', 'Only the unversioned legacy source is aliased; archives and extensions are preserved', () => {
    const h = harness();
    const sources = ['packs/core-pubs.json', 'packs/core-pub.json',
        'packs/archive/core-pubs-0_8_2.json', 'packs/archive/core-pubs-0_3_1.json',
        'packs/EP/EP-theory_development.json'];
    const actual = sources.map(source => h.ctx.normalizePublicationSource(source));
    assert.deepEqual(actual, ['packs/core-pub.json', ...sources.slice(1)]);
    return { before: sources, after: actual };
});
regression('PUB-USE', 'Direct use() calls also normalize the old unversioned source', async () => {
    const h = harness();
    const combined = await h.ctx.use({}, 'packs/core-pubs.json');
    assert.equal(combined.pool.length, pack('core-pub').elements.length);
    assert.deepEqual(h.requests, ['packs/core-pub.json']);
    return { fetched: h.requests };
});
regression('PUB-MENU', 'Menu assembles canonical forms and new records retain type pub', async () => {
    const h = harness();
    const forms = await h.assemble(h.defaultConfig());
    assert.deepEqual(Object.keys(forms).sort(), ['data', 'meta', 'pub', 'software']);
    assert.equal(forms.pub.elements.length, pack('core-pub').elements.length);
    const record = h.stores.data.createResearchOutput('pub');
    assert.equal(record.type, 'pub');
    assert.equal(record.version, pack('core-pub').version);
    const exported = plain(h.ctx.filterExport(record));
    assert.equal(exported.type, 'pub');
    const score = h.ctx.score(record, { forms });
    assert.ok(Number.isFinite(score.max));
    return { type: record.type, version: record.version, max: score.max, fetched: h.requests };
});
regression('PUB-UI-CONFIG', 'UI expressions and per-publication overrides use config$pub/pub:', async () => {
    const h = harness();
    await h.assemble(h.defaultConfig());
    h.stores.config.queryConfig = h.ctx.getQueryConfig(new URLSearchParams('pub:min_indicators_warning_threshold=4'));
    h.stores.config.config = h.ctx.getConfig('pub');
    assert.equal(h.uiEval('config$pub.active', {}), true);
    assert.equal(h.stores.config.config.min_indicators_warning_threshold, '4');
    assert.match(read('index.html'), /x-show="\$store\.config\.config\.pub\.active"/);
    return { active: true, threshold: h.stores.config.config.min_indicators_warning_threshold };
});
regression('PUB-COLLECTOR-CORE', 'Collector resolves pub/core-pub and the exact legacy core-pubs alias', async () => {
    const result = [];
    for (const type of ['pub', 'core-pub', 'core-pubs']) {
        const h = harness();
        const config = h.ctx.selectCollectorPack(h.defaultConfig(), `type=${type}`);
        const forms = await h.assemble(config);
        assert.deepEqual(plain(config.pub.sources), ['packs/core-pub.json']);
        assert.equal(forms.pub.elements.length, pack('core-pub').elements.length);
        result.push({ type, sources: plain(config.pub.sources) });
    }
    return result;
});
regression('PUB-COLLECTOR-EXTENSION', 'An extension selection retains core order and does not append the same exact path twice', async () => {
    const h = harness();
    const query = 'path=EP&type=EP-theory_development';
    const config = h.ctx.selectCollectorPack(h.defaultConfig(), query);
    h.ctx.selectCollectorPack(config, query);
    assert.deepEqual(plain(config.pub.sources), ['packs/core-pub.json', 'packs/EP/EP-theory_development.json']);
    const forms = await h.assemble(config);
    const core = pack('core-pub');
    const theory = pack('EP/EP-theory_development');
    assert.deepEqual(plain(forms.pub.elements.map(e => e.id)), [...core.elements, ...theory.elements].map(e => e.id));
    assert.deepEqual(plain(forms.pub.versions), { P: core.version, TH: theory.version });
    return { elements: forms.pub.elements.length, versions: plain(forms.pub.versions) };
});
regression('PUB-COLLECTOR-ARCHIVE', 'Explicit historical core-pubs filenames remain loadable in the collector', async () => {
    const result = [];
    for (const version of ['0.3.1', '0.8.2']) {
        const h = harness();
        const config = h.ctx.selectCollectorPack(h.defaultConfig(), `path=archive&type=core-pubs&version=${version}`);
        const forms = await h.assemble(config);
        assert.equal(forms.pub.versions.P, version);
        result.push({ version, sources: plain(config.pub.sources) });
    }
    return result;
});
regression('PUB-PREVIEW-CURRENT', 'Preview pub/core-pub resolves the current renamed file', () => {
    const h = harness();
    return ['pub', 'core-pub'].map(type => {
        const selected = h.preview(`?type=${type}&showPoints=true&showLabels=true`);
        assert.equal(path.posix.normalize(`packs/${selected.filename}.json`), 'packs/core-pub.json');
        assert.equal(selected.showPoints, true);
        assert.equal(selected.showLabels, true);
        assert.ok(fs.existsSync(path.join(root, 'packs', `${selected.filename}.json`)));
        return { type, ...selected };
    });
});
regression('PUB-CATALOG', 'Every catalog entry, including historical plural names, resolves to an existing file', () => {
    const h = harness();
    const catalog = pack('info');
    assert.ok(Array.isArray(catalog));
    return catalog.map(entry => {
        const selected = h.preview('?' + new URLSearchParams(entry));
        const file = path.posix.normalize(`packs/${selected.filename}.json`);
        assert.ok(fs.existsSync(path.join(root, file)), `Catalog target missing: ${file}`);
        return file;
    });
});
regression('PUB-IMPORT', 'Import normalizes embedded legacy configuration without renaming pub records/forms', async () => {
    const h = harness();
    await h.assemble(h.defaultConfig());
    const metadata = plain(h.stores.data.input[0]);
    metadata.forms.config.pubs = metadata.forms.config.pub;
    delete metadata.forms.config.pub;
    metadata.forms.config.pubs.sources = ['packs/core-pubs.json'];
    const publication = plain(h.stores.data.createResearchOutput('pub'));
    delete publication.P_Data_Source_ReuseOwn;
    const input = [metadata, publication];
    await h.ctx.handleLoad([{ text: async () => JSON.stringify(input) }]);
    assert.deepEqual(plain(h.stores.data.input[0].forms.config.pub.sources), ['packs/core-pub.json']);
    assert.equal(h.stores.data.input[1].type, 'pub');
    assert.equal(h.stores.data.input[1].P_Data_Source_ReuseOwn, false);
    assert.equal(Object.hasOwn(h.stores.data.input[0].forms, 'pubs'), false);
    return { type: h.stores.data.input[1].type, sources: plain(h.stores.data.input[0].forms.config.pub.sources), alerts: h.alerts };
});

regression('DEFAULT-CHECKBOX', 'Checkbox defaults initialize selected and unselected keys', () => {
    const h = harness();
    const actual = h.defaults(pack('core-pub').elements);
    assert.equal(actual.P_Data_Source_NewOwn, true);
    assert.equal(actual.P_Data_Source_ReuseOwn, false);
    const options = [{ id: 'A' }, { id: 'B' }];
    const variants = [undefined, [], ['A'], ['A', 'B']].map(selected => {
        const element = { id: 'X', type: 'checkbox', options };
        if (selected !== undefined) element.default = selected;
        return plain(h.defaults([element]));
    });
    assert.deepEqual(variants, [
        { X_A: false, X_B: false }, { X_A: false, X_B: false },
        { X_A: true, X_B: false }, { X_A: true, X_B: true }
    ]);
    return variants;
});
regression('DEFAULT-FALSY', 'Own-property scalar defaults preserve 0, false, empty string and null', () => {
    const h = harness();
    const elements = [
        { id: 'N', type: 'number', default: 0 },
        { id: 'F', type: 'text', default: false },
        { id: 'E', type: 'text', default: '' },
        { id: 'Z', type: 'text', default: null },
        { id: 'S', type: 'text', default: '0' },
        { id: 'Missing', type: 'text' },
        Object.assign(Object.create({ default: 'inherited' }), { id: 'Inherited', type: 'text' })
    ];
    const actual = plain(h.defaults(elements));
    assert.deepEqual(actual, { N: 0, F: false, E: '', Z: null, S: '0', Missing: '', Inherited: '' });
    return actual;
});
regression('DEFAULT-TABLE', 'Table row defaults override the element fallback, including falsy overrides', () => {
    const h = harness();
    const actual = plain(h.defaults([{ id: 'T', type: 'tabular_radio', default: 'NoRole', rows: [
        { id: 'A' }, { id: 'B', default: 'Lead' }, { id: 'C', default: '' },
        { id: 'D', default: false }, { id: 'E', default: 0 }
    ] }, { id: 'U', type: 'tabular_radio', rows: [{ id: 'A' }] }]));
    assert.deepEqual(actual, { T_A: 'NoRole', T_B: 'Lead', T_C: '', T_D: false, T_E: 0, U_A: '' });
    return actual;
});
regression('DEFAULT-VALIDATION', 'Malformed checkbox defaults and unknown option IDs fail clearly', () => {
    const h = harness();
    const options = [{ id: 'A' }];
    for (const value of [null, false, 0, '', 'A', {}]) {
        assert.throws(() => h.defaults([{ id: 'X', type: 'checkbox', options, default: value }]), /X: checkbox default must be an array/);
    }
    assert.throws(() => h.defaults([{ id: 'X', type: 'checkbox', options, default: ['Missing'] }]), /X: unknown default option "Missing"/);
    return { invalidShapesRejected: 6, unknownOptionRejected: true };
});
regression('DEFAULT-DISPLAY', 'Information elements and separators never create answer defaults', () => {
    const h = harness();
    const actual = plain(h.defaults([{ id: 'I', type: 'info', default: 'ignored' }, { id: 'S', type: 'separator', default: 0 }]));
    assert.deepEqual(actual, {});
    return actual;
});
regression('DEFAULT-ALL-PACKS', 'Every questionnaire pack can initialize its current defaults', () => {
    const h = harness();
    return jsonFiles().filter(file => file !== 'packs/info.json').map(file => {
        const definition = JSON.parse(read(file));
        const defaults = h.defaults(definition.elements);
        assert.ok(defaults && typeof defaults === 'object');
        return { file, answerKeys: Object.keys(defaults).length };
    });
});

regression('EXPRESSION-SUGAR', 'OR/AND sugar and negation agree in UI and scoring', () => {
    const h = harness();
    const expressions = [
        ["$x =|= ['A','B']", 'B', true], ["!$x =|= ['A','B']", 'B', false],
        ["$x =&= ['A','B']", 'B', false], ["$x =&= ['B','B']", 'B', true]
    ];
    for (const [expression, x, expected] of expressions) {
        assert.equal(h.uiEval(expression, { x }), expected);
        const p = { elements: [{ id: 'Q', type: 'radio', options: [{ id: 'Yes', value: 1 }], score: { condition: expression } }] };
        assert.deepEqual(item(h, p, 'Q', { x, Q: 'Yes' }), { max: 1, score: expected ? 1 : 0 });
    }
    return expressions.map(([expression]) => h.ctx.preprocessCondition(expression));
});
regression('EXPRESSION-EXISTS', 'exists is truthiness, not whitespace trimming or URL validation', () => {
    const h = harness();
    const values = ['', 0, false, null, '0', '   ', 'not a URL'];
    const actual = values.map(value => h.uiEval('exists($x)', { x: value }));
    assert.deepEqual(actual, [false, false, false, false, true, true, true]);
    return { values, actual };
});
regression('SCORE-CONDITION', 'A false score.condition retains the denominator', () => {
    const h = harness();
    const actual = item(h, pack('core-pub'), 'P_ReproducibleScripts', {
        ...base, P_ReproducibleScripts: 'YesEntire', P_ReproducibleScripts_Identifier: ''
    });
    assert.deepEqual(actual, { max: 1, score: 0 });
    return actual;
});
regression('SCORE-NOT-APPLICABLE', 'Justified not applicable removes both earned and possible points', () => {
    const h = harness();
    const core = pack('core-pub');
    const answers = { ...base, P_ReproducibleScripts: 'NotApplicable', P_ReproducibleScripts_NAExplanation: 'Reason' };
    assert.equal(item(h, core, 'P_ReproducibleScripts', answers), null);
    const without = item(h, core, 'P_ReproducibleScripts', { ...answers, P_ReproducibleScripts_NAExplanation: '' });
    assert.deepEqual(without, { max: 1, score: 0 });
    return { withExplanation: null, withoutExplanation: without };
});
regression('SCORE-TYPES', 'Radio/checkbox option values score without a score object; dropdown/table values do not', () => {
    const h = harness();
    const options = [{ id: 'Yes', value: 1 }, { id: 'No', value: 0 }];
    const p = { elements: [
        { id: 'R', type: 'radio', options }, { id: 'C', type: 'checkbox', options },
        { id: 'D', type: 'dropdown', options }, { id: 'T', type: 'tabular_radio', rows: [{ id: 'A' }], options }
    ] };
    const actual = h.scorePack(p, { R: 'Yes', C_Yes: true, D: 'Yes', T_A: 'Yes' });
    assert.equal(actual.score, 2);
    assert.equal(actual.max, 2);
    assert.equal(h.scorePack(p, { C_Yes: 'true' }).score, 0);
    return plain(actual.items);
});
regression('SCORE-UNSUITABLE', 'Unsuitable publications exclude every scored core and shipped extension item', () => {
    const h = harness();
    return ['core-pub', 'EP/EP-clinical_psychology', 'EP/EP-theory_development'].map(name => {
        const actual = h.scorePack(pack(name), { P_Suitable: 'No' });
        assert.equal(actual.max, 0);
        assert.equal(actual.score, 0);
        return { pack: name, max: actual.max, score: actual.score };
    });
});
regression('SCORE-AGGREGATION', 'Overall percentage is the mean of output ratios, not pooled points', () => {
    const h = harness();
    const p = { elements: [{ id: 'X', type: 'radio', options: [{ id: 'Yes', value: 1 }] }] };
    const q = { elements: [{ id: 'Y', type: 'radio', options: [{ id: 'Yes', value: 9 }, { id: 'No', value: 0 }] }] };
    const actual = h.ctx.scoreAll([{ forms: { pub: p, software: q } }, { type: 'pub', X: 'Yes' }, { type: 'software', Y: 'No' }]);
    assert.equal(actual.overall.percentage, '50.0');
    return { overall: actual.overall.percentage, pooledPointsPercentage: '10.0' };
});
regression('MENU-FILTERS', 'Empty exclude wins over include, prefix matching is used, and excluded defaults survive', async () => {
    const h = harness();
    const combined = { pool: [{ id: 'A' }, { id: 'AChild' }, { id: 'B' }], defaultValues: { B: 'retained' } };
    const excluded = h.ctx.pickAccordingToConfig(combined, { include: ['A'], exclude: [] });
    const included = h.ctx.pickAccordingToConfig(combined, { include: ['A'] });
    assert.equal(excluded.elements.length, 3);
    assert.equal(included.elements.length, 2);
    assert.equal(included.defaultValues.B, 'retained');
    assert.equal(h.ctx.pickAccordingToConfig(combined, { include: [] }).elements.length, 3);
    return { withEmptyExclude: plain(excluded.elements), includeOnly: plain(included.elements) };
});

regression('PACK-IDS', 'Pack element, option, row and generated answer IDs are unique within each pack', () => {
    return jsonFiles().filter(file => file !== 'packs/info.json').map(file => {
        const definition = JSON.parse(read(file));
        const ids = definition.elements.map(element => element.id);
        assert.equal(new Set(ids).size, ids.length, `${file}: duplicate element IDs`);
        const answerKeys = [];
        for (const element of definition.elements) {
            assert.ok(typeof element.id === 'string' && element.id.length > 0, `${file}: missing element ID`);
            for (const field of ['options', 'rows']) {
                if (!element[field]) continue;
                const childIds = element[field].map(child => child.id);
                assert.equal(new Set(childIds).size, childIds.length, `${file}/${element.id}: duplicate ${field}`);
            }
            if (element.type === 'checkbox' || element.type === 'tabular_radio') {
                const children = element.type === 'checkbox' ? element.options : element.rows;
                answerKeys.push(...children.map(child => `${element.id}_${child.id}`));
            } else if (!['info', 'separator'].includes(element.type)) {
                answerKeys.push(element.id);
            }
        }
        assert.equal(new Set(answerKeys).size, answerKeys.length, `${file}: generated answer-key collision`);
        return { file, elements: ids.length, answerKeys: answerKeys.length };
    });
});
regression('PACK-EXPRESSIONS', 'Active pack visibility and scoring expressions evaluate on default-answer fixtures', () => {
    const h = harness();
    const baseDefaults = h.defaults(pack('core-pub').elements);
    return jsonFiles().filter(file => file !== 'packs/info.json' && !file.startsWith('packs/archive/')).map(file => {
        const definition = JSON.parse(read(file));
        const answers = { ...baseDefaults, ...h.defaults(definition.elements) };
        let evaluated = 0;
        for (const element of definition.elements) {
            const expressions = [element.condition, element.score?.condition, element.score?.not_applicable];
            for (const expression of expressions) {
                if (expression === undefined) continue;
                assert.equal(typeof expression, 'string', `${file}/${element.id}: expression must be a string`);
                h.uiEval(expression, answers);
                evaluated += 1;
            }
        }
        const result = h.scorePack(definition, answers);
        assert.ok(Number.isFinite(result.score) && Number.isFinite(result.max), `${file}: nonfinite score`);
        return { file, expressionsEvaluated: evaluated, score: result.score, max: result.max };
    });
});
regression('SCORE-CATEGORY-FALLBACK', 'Per-form categories, legacy fallback and explicit overrides retain their precedence', () => {
    const h = harness();
    const categories = title => [{ title, cue: 'X' }];
    const form = { elements: [{ id: 'X', type: 'radio', options: [{ id: 'Yes', value: 1 }] }], config: { score_categories: categories('Form') } };
    const metadata = { forms: { pub: form, config: { score_categories: categories('Legacy') } } };
    const answer = { type: 'pub', X: 'Yes' };
    assert.equal(h.ctx.score(answer, metadata).categories[0].title, 'Form');
    assert.equal(h.ctx.score(answer, metadata, categories('Override')).categories[0].title, 'Override');
    delete form.config;
    assert.equal(h.ctx.score(answer, metadata).categories[0].title, 'Legacy');
    return { perForm: 'Form', explicitOverride: 'Override', missingFormConfig: 'Legacy' };
});

knownIssue('CONFIG-WARNING-KEY', 'CONFIG-01', 'The default YAML warning threshold has different casing from the runtime lookup', async () => {
    const h = harness();
    const config = h.defaultConfig();
    config.min_RO_warning_threshold = 5;
    await h.assemble(config);
    h.stores.data.input.push(h.stores.data.createResearchOutput('pub'));
    h.stores.data.currentTab = 1;
    h.stores.data.score = h.ctx.scoreAll(h.stores.data.input);
    h.stores.config.config = h.ctx.getConfig('pub');
    h.stores.warnings.reevaluate();
    assert.equal(h.stores.config.config.min_ro_warning_threshold, undefined);
    assert.equal(h.stores.warnings.minROWarning, false);
    return { configuredThreshold: 5, researchOutputs: 1, warningShown: false,
        configuredKey: 'min_RO_warning_threshold', runtimeKey: 'min_ro_warning_threshold' };
});
knownIssue('CONFIG-BUILDER-KEYS', 'CONFIG-01', 'Builder camelCase parameters do not override snake_case collector settings', async () => {
    const h = harness();
    await h.assemble(h.defaultConfig());
    const builder = read('builder.html');
    assert.ok(builder.includes("changeParameter('maxTopPapers', this.value)"));
    assert.ok(builder.includes("changeParameter('pub:minIndicatorsWarningThreshold', this.value)"));
    h.stores.config.queryConfig = h.ctx.getQueryConfig(new URLSearchParams('maxTopPapers=1&pub:minIndicatorsWarningThreshold=7'));
    const actual = h.ctx.getConfig('pub');
    assert.equal(actual.max_top_papers, 3);
    assert.equal(actual.min_indicators_warning_threshold, 0);
    assert.equal(actual.maxTopPapers, '1');
    assert.equal(actual.minIndicatorsWarningThreshold, '7');
    return { requested: { topPapers: 1, indicatorsThreshold: 7 }, effective: { topPapers: actual.max_top_papers, indicatorsThreshold: actual.min_indicators_warning_threshold } };
});

knownIssue('PUB-ARCHIVE-ALIAS', 'PUB-01', 'Canonical pub/core-pub aliases construct nonexistent archived filenames', () => {
    const h = harness();
    return ['pub', 'core-pub'].map(type => {
        const query = `path=archive&type=${type}&version=0.8.2`;
        const preview = h.preview('?' + query);
        const config = h.ctx.selectCollectorPack(h.defaultConfig(), query);
        const source = path.posix.normalize(`packs/${preview.filename}.json`);
        assert.equal(source, 'packs/archive/core-pub-0_8_2.json');
        assert.equal(fs.existsSync(path.join(root, source)), false);
        assert.deepEqual(plain(config.pub.sources), [source]);
        assert.ok(fs.existsSync(path.join(root, 'packs/archive/core-pubs-0_8_2.json')));
        return { type, requested: source, existing: 'packs/archive/core-pubs-0_8_2.json' };
    });
});
knownIssue('PUB-LEGACY-PREVIEW', 'PUB-01', 'Unversioned core-pubs preview links do not use the collector compatibility alias', () => {
    const h = harness();
    const preview = h.preview('?type=core-pubs');
    const source = path.posix.normalize(`packs/${preview.filename}.json`);
    assert.equal(source, 'packs/core-pubs.json');
    assert.equal(fs.existsSync(path.join(root, source)), false);
    return { requested: source, replacement: 'packs/core-pub.json' };
});
knownIssue('PUB-RELATIVE-SOURCE', 'PUB-01', 'The legacy source alias does not cover a ./-prefixed configuration path', async () => {
    const h = harness();
    const legacy = './packs/core-pubs.json';
    assert.equal(h.ctx.normalizePublicationSource(legacy), legacy);
    await assert.rejects(h.ctx.use({}, legacy), /404: packs\/core-pubs\.json/);
    return { unresolved: legacy };
});
knownIssue('PUB-DUPLICATE-ALIASES', 'PUB-02', 'Both old and new source spellings load the publication core twice', async () => {
    const h = harness();
    const config = h.defaultConfig();
    config.pub.sources = ['packs/core-pubs.json', 'packs/core-pub.json'];
    const forms = await h.assemble(config);
    const ids = forms.pub.elements.map(element => element.id);
    assert.equal(ids.length, 2 * pack('core-pub').elements.length);
    assert.equal(new Set(ids).size, ids.length / 2);
    const single = h.scorePack({ ...pack('core-pub'), config: config.pub.config }, base);
    const duplicated = h.scorePack(forms.pub, base);
    closeTo(duplicated.score, 2 * single.score);
    closeTo(duplicated.max, 2 * single.max);
    const itemMaxSum = Object.values(duplicated.items).reduce((sum, entry) => sum + entry.max, 0);
    closeTo(itemMaxSum, single.max);
    return { normalizedSources: plain(config.pub.sources), elements: ids.length, distinctIds: new Set(ids).size,
        single: { score: single.score, max: single.max }, duplicated: { score: duplicated.score, max: duplicated.max },
        duplicatedItemMaxSum: itemMaxSum };
});
knownIssue('ACCESS-JUSTIFICATION', 'SCORE-01', 'Restricted-access ZK2 earns a point without its requested justification', () => {
    const h = harness();
    const actual = item(h, pack('core-pub'), 'P_Data_Open_AccessLevel', {
        ...base, P_Data_Open_AccessLevel: 'ZK2', P_Data_Open_AccessLevel_ZK2Explanation: ''
    });
    assert.deepEqual(actual, { max: 1, score: 1 });
    return actual;
});
knownIssue('ACCESS-HIDDEN', 'SCORE-01', 'A retained access answer earns points after Open Data becomes unjustified NotApplicable', () => {
    const h = harness();
    const core = pack('core-pub');
    const answers = { ...base, P_Data_Open: 'NotApplicable', P_Data_Open_NAExplanation: '' };
    const element = core.elements.find(e => e.id === 'P_Data_Open_AccessLevel');
    const actual = { visible: h.uiEval(element.condition, answers), item: item(h, core, element.id, answers) };
    assert.equal(actual.visible, false);
    assert.deepEqual(actual.item, { max: 1, score: 1 });
    return actual;
});
knownIssue('FAIR-REUSED', 'SCORE-02', 'Reused-data FAIR questions are visible and applicable but cannot earn points', () => {
    const h = harness();
    const core = pack('core-pub');
    const element = core.elements.find(e => e.id === 'P_Data_Open_FAIR');
    return ['P_Data_Source_ReuseOwn', 'P_Data_Source_ReuseCompilation'].map(source => {
        const answers = { ...base, P_Data_Source_NewOwn: false, [source]: true, P_Data_Open_FAIR_Codebook: true };
        const actual = { source, visible: h.uiEval(element.condition, answers), item: item(h, core, element.id, answers) };
        assert.equal(actual.visible, true);
        assert.deepEqual(actual.item, { max: 1, score: 0 });
        return actual;
    });
});
characterization('CHILD-EVIDENCE', 'SCORE-03', 'Child FAIR/preregistration points do not require their parent evidence URL', () => {
    const h = harness();
    const core = pack('core-pub');
    const answers = {
        ...base, P_Data_Open_Identifier: '', P_Data_Open_FAIR_Codebook: true,
        P_ReproducibleScripts: 'YesEntire', P_ReproducibleScripts_Identifier: '', P_ReproducibleScripts_FAIR_OpenLicense: true,
        P_Preregistration: 'Yes', P_Preregistration_Identifier: '', P_TypeMethod_EmpiricalQuantitative: true,
        P_Preregistration_Content_Hypotheses: true
    };
    const ids = ['P_Data_Open_AccessLevel', 'P_Data_Open_FAIR', 'P_ReproducibleScripts', 'P_ReproducibleScripts_FAIR', 'P_Preregistration', 'P_Preregistration_Content'];
    const actual = Object.fromEntries(ids.map(id => [id, item(h, core, id, answers)]));
    assert.equal(actual.P_Data_Open_AccessLevel.score, 0);
    assert.equal(actual.P_Data_Open_FAIR.score, 0.5);
    assert.equal(actual.P_ReproducibleScripts.score, 0);
    assert.equal(actual.P_ReproducibleScripts_FAIR.score, 0.2);
    assert.equal(actual.P_Preregistration.score, 0);
    assert.equal(actual.P_Preregistration_Content.score, 0.2);
    return actual;
});
knownIssue('CLINICAL-HIDDEN', 'SCORE-04', 'Hidden clinical RCT answers retain points after preregistration changes to No', () => {
    const h = harness();
    const clinical = pack('EP/EP-clinical_psychology');
    const answers = {
        P_Suitable: 'Yes', P_TypeMethod_EmpiricalQuantitative: true, P_Preregistration: 'No', CP_RCT: 'Yes',
        CP_Preregistration_PrimaryMainOutcome: 'Yes', CP_Methods_RCTCriteria_RandomAssignment: true
    };
    const element = clinical.elements.find(e => e.id === 'CP_Preregistration_PrimaryMainOutcome');
    const actual = { visible: h.uiEval(element.condition, answers), primary: item(h, clinical, element.id, answers), criteria: item(h, clinical, 'CP_Methods_RCTCriteria', answers) };
    assert.equal(actual.visible, false);
    assert.deepEqual(actual.primary, { max: 1, score: 1 });
    assert.deepEqual(actual.criteria, { max: 2, score: 0.5 });
    return actual;
});
knownIssue('SOFTWARE-GATES', 'SCORE-05', 'Software ignores factor, option condition and parent visibility', () => {
    const h = harness();
    const software = pack('core-software');
    const answers = {
        S_License: 'ClosedSource', S_URL: '', S_CodebaseActivelyMaintained: 'Yes', S_CommunityActivelyMaintained: 'HighVolume',
        S_Tests: 'No', S_Tests_Quality_OpenSource: true, S_Documentation_UserFacingDocumentation: false,
        S_Documentation_UserFacing: 'AllFunctions'
    };
    const actual = h.scorePack(software, answers, 'software');
    closeTo(actual.score, 5.2);
    assert.equal(actual.max, 11);
    return { score: actual.score, max: actual.max, tests: item(h, software, 'S_Tests_Quality', answers, 'software'), documentation: item(h, software, 'S_Documentation_UserFacing', answers, 'software') };
});
knownIssue('EXPORT-OWNERSHIP', 'DATA-01', 'Hidden generated checkbox/table answers survive export, but hidden scalar defaults do not', () => {
    const h = harness();
    const elements = [
        { id: 'X', type: 'checkbox', condition: 'false', options: [{ id: 'A' }] },
        { id: 'Y', type: 'radio', condition: 'false', default: 'Yes', options: [{ id: 'Yes' }] },
        { id: 'T', type: 'tabular_radio', condition: 'false', rows: [{ id: 'A' }], options: [{ id: 'Yes' }] }
    ];
    h.stores.forms = { pub: { elements, defaultValues: h.defaults(elements) } };
    const actual = plain(h.ctx.filterExport({ type: 'pub', X_A: true, Y: 'Yes', T_A: 'Yes' }));
    assert.deepEqual(actual, { type: 'pub', X_A: true, T_A: 'Yes' });
    return actual;
});
knownIssue('COMPLETION-TABLE', 'UI-01', 'An unanswered table is marked complete because its parent key is missing', () => {
    const h = harness();
    const elements = [{ id: 'T', type: 'tabular_radio', rows: [{ id: 'A' }], options: [{ id: 'Yes' }] }];
    h.stores.forms = { pub: { elements, defaultValues: h.defaults(elements) } };
    const record = { type: 'pub', ...h.defaults(elements) };
    assert.equal(record.T_A, '');
    const actual = plain(h.ctx.checkCompletion(record));
    assert.equal(actual.progress.ratio, 1);
    return actual.progress;
});
knownIssue('COMPLETION-MISSING-EMPTY', 'UI-01', 'Missing scalars count as filled and no required fields produces NaN', () => {
    const h = harness();
    h.stores.forms = { pub: { elements: [{ id: 'X', type: 'text' }] } };
    assert.equal(h.ctx.checkCompletion({ type: 'pub' }).progress.ratio, 1);
    h.stores.forms.pub.elements = [];
    const actual = h.ctx.checkCompletion({ type: 'pub' }).progress;
    assert.ok(Number.isNaN(actual.ratio));
    assert.equal(actual.percent, 'NaN');
    return { missingScalarRatio: 1, emptyFormRatio: 'NaN', emptyFormPercent: actual.percent };
});
knownIssue('IMPORT-FORM-DEFAULTS', 'DATA-02', 'Import fills defaults using the previously open dataset, not the incoming form', async () => {
    const h = harness();
    await h.assemble(h.defaultConfig());
    const incoming = plain(h.stores.data.input[0]);
    incoming.forms.pub.elements.push({ id: 'EX_Imported', type: 'text', default: 'incoming default' });
    const record = plain(h.stores.data.createResearchOutput('pub'));
    await h.ctx.handleLoad([{ text: async () => JSON.stringify([incoming, record]) }]);
    assert.equal(h.stores.data.input[1].EX_Imported, undefined);
    assert.equal(h.stores.data.input[0].forms.pub.elements.at(-1).id, 'EX_Imported');
    return { embeddedField: 'EX_Imported', initialized: false };
});
knownIssue('PERSISTED-FORMS', 'DATA-02', 'Saved embedded forms can disagree with current UI/export forms', async () => {
    const h = harness();
    await h.assemble(h.defaultConfig());
    const metadata = plain(h.stores.data.input[0]);
    metadata.forms.pub.elements = [{ id: 'P_Legacy', type: 'radio', options: [{ id: 'Yes', value: 9 }] }];
    const publication = plain(h.stores.data.createResearchOutput('pub'));
    publication.P_Legacy = 'Yes';
    h.localStorage.setItem('data ' + h.stores.forms.config.main_title, JSON.stringify([metadata, publication]));
    h.stores.data.manualInit();
    assert.equal(h.stores.data.score.scores[1].score, 9);
    assert.ok(!h.stores.forms.pub.elements.some(e => e.id === 'P_Legacy'));
    assert.equal(Object.hasOwn(h.ctx.filterExport(publication), 'P_Legacy'), false);
    return { scoredWithEmbeddedForm: 9, visibleInCurrentForm: false, retainedByExport: false };
});
knownIssue('PREVIEW-VERSION-POINTS', 'UI-02', 'Versioned preview query loses showPoints=true', () => {
    const h = harness();
    const actual = h.preview('?path=archive&type=core-pubs&version=0.8.2&showPoints=true&showLabels=true');
    assert.equal(actual.showLabels, true);
    assert.equal(actual.showPoints, undefined);
    return actual;
});

characterization('SCORE-UNDOCUMENTED-GUARD', 'LIMIT-01', 'The undocumented score.score guard changes false-condition denominator behavior', () => {
    const h = harness();
    const element = { id: 'X', type: 'radio', options: [{ id: 'Yes', value: 1 }], score: { condition: 'false' } };
    const before = item(h, { elements: [element] }, 'X', { X: 'Yes' });
    element.score.score = true;
    const after = item(h, { elements: [element] }, 'X', { X: 'Yes' });
    assert.deepEqual(before, { max: 1, score: 0 });
    assert.equal(after, null);
    return { before, after };
});
characterization('SCORE-CONFIG-UNSUPPORTED', 'LIMIT-01', 'config$ works in UI expressions but is unsupported by the scorer', () => {
    const h = harness();
    assert.equal(h.uiEval('config$statements_only_for_top_publications', {}), true);
    const p = { elements: [{ id: 'X', type: 'radio', options: [{ id: 'Yes', value: 1 }], score: { condition: 'config$statements_only_for_top_publications' } }] };
    assert.throws(() => h.scorePack(p, { X: 'Yes' }), error => error.name === 'ReferenceError');
    return { ui: true, scoring: 'ReferenceError' };
});
characterization('THEORY-UNANSWERED', 'POLICY-01', 'Unanswered theory filters leave 15 hidden possible points', () => {
    const h = harness();
    const theory = pack('EP/EP-theory_development');
    const answers = { P_Suitable: 'Yes', ...h.defaults(theory.elements) };
    const actual = h.scorePack(theory, answers);
    assert.equal(actual.max, 15);
    assert.equal(actual.score, 0);
    const visible = theory.elements.filter(e => e.type === 'checkbox' && h.uiEval(e.condition, answers));
    assert.equal(visible.length, 0);
    return { visibleScoredItems: visible.length, score: actual.score, max: actual.max };
});
characterization('THEORY-CATEGORIES', 'POLICY-01', 'Default category cues omit theory checklist points', () => {
    const h = harness();
    const categories = h.defaultConfig().pub.config.score_categories;
    const scored = pack('EP/EP-theory_development').elements.filter(e => e.type === 'checkbox');
    const matched = scored.filter(element => categories.some(category => new RegExp(category.cue).test(element.id)));
    assert.equal(matched.length, 0);
    return { checklistItems: scored.length, categoryMatches: matched.length };
});
characterization('PUB-NORMALIZATION-SCOPE', 'PUB-NOTES', 'Normalization retains legacy keys and does not migrate query namespaces or saved record types', () => {
    const h = harness();
    const config = { pubs: { sources: ['packs/core-pubs.json'] } };
    h.ctx.normalizePublicationConfig(config);
    assert.equal(Object.hasOwn(config, 'pubs'), true);
    const query = plain(h.ctx.getQueryConfig(new URLSearchParams('pubs:min_indicators_warning_threshold=5')));
    assert.equal(query.pub, undefined);
    assert.equal(query.pubs.min_indicators_warning_threshold, '5');
    const unchanged = h.ctx.renameOldKeys({ type: 'pubs' });
    assert.equal(unchanged.type, 'pubs');
    return { legacyConfigKeyRetained: true, legacyQueryNamespace: query.pubs, recordType: unchanged.type };
});

function jsonFiles(dir = 'packs') {
    return fs.readdirSync(path.join(root, dir), { withFileTypes: true })
        .sort((a, b) => a.name.localeCompare(b.name))
        .flatMap(entry => {
            const file = `${dir}/${entry.name}`;
            return entry.isDirectory() ? jsonFiles(file) : file.endsWith('.json') ? [file] : [];
        });
}

async function main() {
    for (const file of ['index.html', 'preview.html', 'menu.js', 'utils/score2.js', 'utils/packutils.js', 'config/config-default.yaml']) {
        if (!fs.existsSync(path.join(root, file))) throw new Error(`Not a repository root: missing ${file} in ${root}`);
    }
    const jsonParsing = jsonFiles().map(file => {
        try {
            JSON.parse(read(file));
            return { file, valid: true };
        } catch (error) {
            return { file, valid: false, error: error.message };
        }
    });
    const results = [];
    for (const { test, ...entry } of checks) {
        try {
            const evidence = await test();
            results.push({ ...entry, status: entry.kind === 'known-issue' ? 'reproduced' : 'passed', evidence });
        } catch (error) {
            // Keep running so a stale expectation cannot hide later results.
            results.push({ ...entry, status: 'failed', error: { name: error.name, message: error.message } });
        }
    }
    const count = (kind, status) => results.filter(result => result.kind === kind && result.status === status).length;
    const failed = results.filter(result => result.status === 'failed').length;
    const invalidJSON = jsonParsing.filter(result => !result.valid).length;
    const reproduced = count('known-issue', 'reproduced');
    const runtimeFiles = ['index.html', 'preview.html', 'menu.js', 'utils/score2.js', 'utils/packutils.js', 'utils/keyalias.js', 'builder.html', 'config/config-default.yaml', ...jsonFiles()];
    const report = {
        repository: root,
        nodeVersion: process.version,
        strict,
        summary: {
            totalChecks: results.length,
            regressions: { passed: count('regression', 'passed'), failed: count('regression', 'failed') },
            knownIssues: { reproduced, failedToReproduce: count('known-issue', 'failed') },
            characterizations: { passed: count('characterization', 'passed'), failed: count('characterization', 'failed') },
            jsonFiles: { valid: jsonParsing.length - invalidJSON, invalid: invalidJSON },
            failedChecks: failed,
            exitCode: failed || invalidJSON || (strict && reproduced) ? 1 : 0
        },
        interpretation: 'Reproduced known issues are defects, not acceptance passes. Characterizations document limitations or policy choices. After a runtime fix, update/promote its checks; do not restore the defect. This VM harness is not a browser or external-report test.',
        checks: results,
        jsonParsing,
        sourceSHA256: Object.fromEntries(runtimeFiles.map(file => [file, createHash('sha256').update(read(file)).digest('hex')]))
    };
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.summary.exitCode;
}

main().catch(error => {
    console.log(JSON.stringify({ repository: root, error: { name: error.name, message: error.message }, exitCode: 2 }, null, 2));
    process.exitCode = 2;
});
