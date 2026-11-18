#!/usr/bin/env node
'use strict';

// Tests of the command-line pack validator: node tests/verify-validate-cli.cjs
// Fixtures are in tests/fixtures/ (packs and a configuration).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

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
    assert.match(result.out, /Not blocking \(\d+\):/);
    assert.match(result.out, /\[not blocking: output type inactive\]/);
    assert.match(result.out, /^OK: 1 checked/m);
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
    const annotations = result.out.split('\n').filter(line => line.startsWith('::'));
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
