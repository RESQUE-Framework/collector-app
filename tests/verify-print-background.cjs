#!/usr/bin/env node
'use strict';

// Dependency-free regression tests: node tests/verify-print-background.cjs
// Covers "Print this publication": the printed page must be white even when
// config.yaml sets `background_color` to something else.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const css = read('styles.css');

// Minimal CSS reader: no parser is bundled, and the checks below only need the
// declarations of a named selector inside (or outside) the `@media print` block.
const blockAt = (source, braceIndex) => {
    let depth = 0;
    for (let i = braceIndex; i < source.length; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}' && --depth === 0) return source.slice(braceIndex + 1, i);
    }
    throw new Error('Unbalanced braces in stylesheet');
};
const rules = source => {
    const found = [];
    for (let i = 0; i < source.length; i++) {
        if (source[i] !== '{') continue;
        const body = blockAt(source, i);
        const selector = source.slice(0, i).split(/[}{]/).pop().replace(/\/\*[\s\S]*?\*\//g, '').trim();
        found.push({ selector, body });
        i += body.length + 1;
    }
    return found;
};
const declarations = (source, selector) => rules(source)
    .filter(r => r.selector.split(',').map(s => s.trim()).includes(selector))
    .flatMap(r => r.body.split(';'))
    .map(d => d.replace(/\/\*[\s\S]*?\*\//g, '').trim())
    .filter(Boolean);

const printIndex = css.indexOf('@media print');
assert.ok(printIndex >= 0, 'styles.css must contain an @media print block');
const printBlock = blockAt(css, css.indexOf('{', printIndex));
const screenCss = css.slice(0, printIndex) + css.slice(printIndex + printBlock.length);
const white = /^#ffffff$|^#fff$|^white$/i;

const value = (decls, property) => {
    const hit = decls.map(d => d.match(/^([^:]+):([\s\S]+)$/))
        .filter(Boolean)
        .filter(m => m[1].trim() === property)
        .pop();
    return hit ? hit[2].trim() : undefined;
};

test('printing resets the configured background color to white', () => {
    const declared = value(declarations(printBlock, ':root'), '--bg-color');
    assert.ok(declared, '@media print must redeclare --bg-color');
    // The configuration value is an inline custom property on <html> (see below),
    // so only an !important author declaration can override it.
    assert.match(declared, /!important$/);
    assert.match(declared.replace(/\s*!important$/, ''), white);
});

test('printing paints the page background white regardless of the configuration', () => {
    const background = value(declarations(printBlock, 'body'), 'background-color');
    assert.ok(background, '@media print must set an explicit body background-color');
    assert.match(background, /!important$/);
    assert.match(background.replace(/\s*!important$/, ''), white);
    // Without this the body background would be printed as configured.
    assert.match(value(declarations(printBlock, 'body'), 'print-color-adjust'), /exact/);
});

test('on screen the configured background color still applies', () => {
    assert.equal(value(declarations(screenCss, 'body'), 'background-color'), 'var(--bg-color)');
    const fallback = value(declarations(screenCss, ':root'), '--bg-color');
    assert.match(fallback, white, 'the screen fallback stays the plain default');
    assert.ok(!/!important/.test(fallback), 'the screen default must not be !important');
    const html = read('index.html');
    assert.match(
        html,
        /document\.documentElement\.style\.setProperty\(\s*'--bg-color',\s*Alpine\.store\('config'\)\.config\.background_color\s*\)/,
        'the collector applies background_color as an inline custom property'
    );
    assert.match(html, /@click="print\(\)"/, 'the "Print this publication" trigger exists');
});

test('the shipped configurations still expose background_color', () => {
    for (const file of ['config/config-default.yaml', 'config/config-default-committee.yaml']) {
        assert.match(read(file), /^background_color:/m, `${file} defines background_color`);
    }
});
