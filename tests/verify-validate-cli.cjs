#!/usr/bin/env node
'use strict';

// Tests of the command-line pack validator: node tests/verify-validate-cli.cjs
// Fixtures are in tests/fixtures/ (packs and a configuration).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const root = path.join(__dirname, '..');
const cli = (...args) => {
    const result = spawnSync(process.execPath, [path.join(root, 'scripts/validate-packs.cjs'), ...args], { cwd: root, encoding: 'utf8' });
    return { code: result.status, out: result.stdout, err: result.stderr };
};
const fixture = name => `tests/fixtures/packs/${name}`;
const json = (...args) => {
    const result = cli('--format', 'json', ...args);
    return { code: result.code, data: JSON.parse(result.out) };
};
const codesOf = report => report.issues.map(issue => issue.code);

test('--help prints the usage and exits 0; bad options and missing files exit 2', () => {
    const help = cli('--help');
    assert.equal(help.code, 0);
    assert.match(help.out, /Usage: node scripts\/validate-packs\.cjs/);
    assert.equal(cli('--bogus').code, 2);
    assert.equal(cli('--format', 'xml').code, 2);
    assert.equal(cli('packs/does-not-exist.json').code, 2);
    assert.equal(cli('--config', 'config/does-not-exist.yaml').code, 2);
});

test('the shipped default configuration has no blocking errors', () => {
    const result = cli('--config', 'config/config-default.yaml');
    assert.equal(result.code, 0, result.out);
    assert.match(result.out, /^Configuration config\/config-default\.yaml: 0 blocking errors/m);
    assert.match(result.out, /^OK: 1 checked/m);
});

test('problems in an inactive output type are listed as not blocking and do not fail', () => {
    const result = cli('--config', 'tests/fixtures/config-inactive-problems.yaml');
    assert.equal(result.code, 0, result.out);
    assert.match(result.out, /: 0 blocking errors, /);
    assert.match(result.out, /Not blocking \(\d+\):/);
    assert.match(result.out, /ERROR\s+generated-key-collision\s+tests\/fixtures\/packs\/EP-broken\.json:\d+.*\[not blocking: output type inactive\]/);
    assert.equal(cli('--strict', '--config', 'tests/fixtures/config-inactive-problems.yaml').code, 1);
});

test('a configuration that excludes a dependency fails with the broken references', () => {
    const result = cli('--config', 'tests/fixtures/config-excludes-dependency.yaml');
    assert.equal(result.code, 1);
    assert.match(result.out, /ERROR\s+missing-indicator-reference\s+packs\/core-pub\.json:\d+/);
    assert.match(result.out, /\$P_Suitable/);
    assert.match(result.out, /How to fix: Restore the referenced indicator/);
    assert.match(result.out, /^FAILED: 1 of 1 checked target has blocking errors\./m);
});

test('a clean expansion pack passes, also strictly, and needs the core for its references', () => {
    const good = json(fixture('EP-good.json'));
    assert.equal(good.code, 0);
    assert.equal(good.data.ok, true);
    assert.deepEqual(good.data.results.map(r => [r.kind, r.name]), [['pack', 'Pack tests/fixtures/packs/EP-good.json']]);
    assert.deepEqual(good.data.results[0].report.issues, []);
    assert.equal(cli('--strict', fixture('EP-good.json')).code, 0);
    // --alone: without the core, $P_Suitable does not exist.
    const alone = json('--alone', fixture('EP-good.json'));
    assert.equal(alone.code, 1);
    assert.ok(alone.data.results[0].report.blocking.every(issue => issue.reference === '$P_Suitable'));
    // --with adds dependencies explicitly.
    assert.equal(cli('--alone', '--with', 'packs/core-meta.json', '--with', 'packs/core-pub.json', fixture('EP-good.json')).code, 0);
});

test('a broken pack lists each problem with its line, and fails', () => {
    const { code, data } = json(fixture('EP-broken.json'));
    assert.equal(code, 1);
    const issues = data.results[0].report.issues;
    assert.deepEqual([...new Set(codesOf(data.results[0].report))].sort(), [
        'array-comparison', 'generated-key-collision', 'option-value-incomplete', 'unknown-field', 'unknown-option-literal'
    ]);
    assert.ok(issues.every(issue => issue.pack === 'tests/fixtures/packs/EP-broken.json' && Number.isInteger(issue.line)));
    const typo = issues.find(issue => issue.code === 'unknown-field');
    assert.match(typo.message, /Did you mean "condition"\?/);
});

test('an alpha pack with problems passes by default and fails with --strict', () => {
    const relaxed = cli(fixture('EP-alpha.json'));
    assert.equal(relaxed.code, 0, relaxed.out);
    assert.match(relaxed.out, /\[not blocking: alpha pack\]/);
    assert.equal(cli('--strict', fixture('EP-alpha.json')).code, 1);
});

test('invalid JSON is reported with its line and fails', () => {
    const { code, data } = json(fixture('EP-invalid-json.json'));
    assert.equal(code, 1);
    const [issue] = data.results[0].report.issues;
    assert.equal(issue.code, 'invalid-json');
    assert.equal(issue.line, 4);
});

test('--format github prints workflow annotations with file and line', () => {
    const result = cli('--format', 'github', fixture('EP-broken.json'));
    assert.equal(result.code, 1);
    const annotations = result.out.split('\n').filter(line => /^::(error|warning|notice) /.test(line));
    assert.ok(annotations.length >= 5);
    assert.ok(annotations.every(line => /^::(error|warning|notice) file=tests\/fixtures\/packs\/EP-broken\.json,line=\d+,title=[a-z-]+::/.test(line)), annotations.join('\n'));
    assert.ok(annotations.some(line => line.startsWith('::error') && line.includes('title=generated-key-collision')));
    // Annotation text must not contain raw line breaks.
    assert.ok(annotations.every(line => !line.includes('\r')));
});

test('--all checks the configuration and every pack, and the shipped repository passes', () => {
    const { code, data } = json('--all', '--config', 'config/config-default.yaml');
    assert.equal(code, 0);
    const names = data.results.map(r => r.name);
    assert.equal(names[0], 'Configuration config/config-default.yaml');
    for (const file of ['packs/core-pub.json', 'packs/core-meta.json', 'packs/EP/EP-clinical_psychology.json', 'packs/dev/EP-stimuli.json', 'packs/archive/core-pubs-0_3_1.json']) {
        assert.ok(names.includes(`Pack ${file}`), file);
    }
    assert.ok(!names.some(name => name.includes('info.json') || name.includes('tests/fixtures')));
    // Archived packs are only parsed.
    assert.deepEqual(data.results.find(r => r.name === 'Pack packs/archive/core-pubs-0_3_1.json').report.issues, []);
});

// A pack with `count` missing references (blocking errors) and the given extra elements.
const tempPack = (count, extra = []) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resque-validator-'));
    const file = path.join(dir, 'EP-many.json');
    const elements = Array.from({ length: count }, (_, i) => ({ id: `EX_Q${i + 1}`, type: 'text', title: `Q${i + 1}`, condition: `$EX_Missing${i + 1}` }));
    fs.writeFileSync(file, JSON.stringify({ prefix: 'EX', version: '1.0.0', date: '2026-11-19', title: 'Many problems', elements: [...elements, ...extra] }, null, 4));
    return { dir, file };
};

test('--format github: at most 10 annotations per level, the 10th counts the rest; full report in a log group', () => {
    const { file } = tempPack(15);
    const result = cli('--format', 'github', file);
    assert.equal(result.code, 1);
    const lines = result.out.split('\n');
    const errors = lines.filter(line => line.startsWith('::error '));
    assert.equal(errors.length, 10);
    assert.equal(errors.slice(0, 9).filter(line => line.includes('title=missing-indicator-reference')).length, 9);
    assert.match(errors[9], /^::error title=6 more errors::6 more errors are not shown as annotations \(GitHub shows at most 10 per level and step\)/);
    // The log group holds every problem, also those without an annotation.
    const start = lines.indexOf('::group::Full report');
    const end = lines.indexOf('::endgroup::');
    assert.ok(start >= 0 && end > start);
    const group = lines.slice(start, end).join('\n');
    for (let i = 1; i <= 15; i++) assert.ok(group.includes(`$EX_Missing${i} `), `EX_Missing${i} in the log group`);
    // Below the cap nothing is summarized.
    assert.ok(!cli('--format', 'github', fixture('EP-broken.json')).out.includes(' more errors'));
});

test('--summary appends a Markdown report with a table and every problem, escaped', () => {
    const { dir, file } = tempPack(12, [
        { id: 'EX_Choice', type: 'radio', title: 'Choice', options: [{ id: 'A', text: 'A' }] },
        { id: 'EX_Evil', type: 'text', title: 'Evil', condition: "$EX_Choice === '<img src=x onerror=alert(1)>|**x**'" }
    ]);
    const summary = path.join(dir, 'summary.md');
    fs.writeFileSync(summary, 'Written by an earlier step.\n');
    const result = cli('--format', 'github', '--summary', summary, '--config', 'config/config-default.yaml', file);
    assert.equal(result.code, 1);
    const md = fs.readFileSync(summary, 'utf8');
    assert.ok(md.startsWith('Written by an earlier step.\n## Pack validation\n'), 'appended, not overwritten');
    assert.match(md, /\*\*FAILED\*\*: 1 of 1 checked with blocking errors\./);
    assert.match(md, /^\| Checked \| Blocking errors \| Warnings \| Not blocking \| Notices \|$/m);
    assert.match(md, /^\| Pack .*EP-many\.json \| 13 \| 0 \| 0 \| 0 \|$/m);
    // All 12 missing references are listed, although only 9 became annotations.
    for (let i = 1; i <= 12; i++) assert.ok(md.includes(`$EX\\_Missing${i} `), `EX_Missing${i} in the summary`);
    assert.match(md, /- \*\*Error\*\* `unknown-option-literal`/);
    // Pack text cannot add HTML or break the table.
    assert.ok(!md.includes('<img'));
    assert.ok(md.includes('&lt;img src=x onerror=alert(1)&gt;\\|\\*\\*x\\*\\*'));
    // A run without blocking errors summarizes as OK; problems that do not
    // block are collapsed.
    const okSummary = path.join(dir, 'ok.md');
    assert.equal(cli('--summary', okSummary, '--config', 'tests/fixtures/config-inactive-problems.yaml').code, 0);
    const okMd = fs.readFileSync(okSummary, 'utf8');
    assert.match(okMd, /\*\*OK\*\*: no blocking errors\./);
    assert.match(okMd, /<details><summary>Not blocking \(\d+\)<\/summary>/);
});

test('the workflow writes the job summary and describes where annotations appear', () => {
    const workflow = fs.readFileSync(path.join(root, '.github/workflows/validate-packs.yml'), 'utf8');
    assert.ok(workflow.includes('node scripts/validate-packs.cjs --all --format github --summary "$GITHUB_STEP_SUMMARY"'));
    assert.ok(!/annotations on the changed (files|lines)/.test(workflow));
    for (const doc of ['documentation/RESQUE-Pack-Guide.md', 'How_to_fork.md']) {
        assert.ok(!/annotations on the changed (files|lines)|shown on the changed lines/.test(fs.readFileSync(path.join(root, doc), 'utf8')), doc);
    }
});
