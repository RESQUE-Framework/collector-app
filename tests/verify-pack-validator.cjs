#!/usr/bin/env node
'use strict';

// Dependency-free regression tests: node tests/verify-pack-validator.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const ctx = vm.createContext({
    console,
    fetch: async url => ({ json: async () => JSON.parse(read(url)) })
});
vm.runInContext(read('utils/pack-validator.js') + '\nglobalThis.validator = PackValidator;', ctx);
vm.runInContext(read('utils/packutils.js').replace(/^export /gm, ''), ctx);
vm.runInContext(read('menu.js'), ctx);
vm.runInContext(read('js/js-yaml.min.js'), ctx);
const html = read('index.html');
const start = html.indexOf('async function use(config,');
assert.ok(start >= 0, 'Pack assembly source anchor must exist');
vm.runInContext(html.slice(start, html.indexOf('</script>', start)), ctx);
const validate = forms => JSON.parse(JSON.stringify(ctx.validator.validate(forms)));
const element = (id, properties = {}) => ({ id, type: 'text', ...properties });
const config = () => ctx.jsyaml.load(read('config/config-default.yaml'));

test('default selected packs report the existing missing software reference, not built-in fields', async () => {
    const report = validate(await ctx.menu(config()));
    assert.deepEqual(report.issues.map(e => [e.form, e.indicator, e.reference]), [
        ['software', 'S_Tests_Quality', '$S_Tests_URL']
    ]);
    assert.ok(report.indicatorsChecked > 100);
});

test('core plus either shipped extension resolves cross-pack references', async () => {
    for (const name of ['EP-theory_development', 'EP-clinical_psychology']) {
        const c = config();
        c.pub.sources.push(`packs/EP/${name}.json`);
        assert.deepEqual(validate(await ctx.menu(c)).issues.filter(e => e.form === 'pub'), []);
    }
});

test('excluded indicators are reported despite retained defaults', async () => {
    const c = config();
    c.pub.exclude = ['P_Suitable'];
    const forms = await ctx.menu(c);
    assert.ok(Object.hasOwn(forms.pub.defaultValues, 'P_Suitable'));
    const report = validate(forms);
    assert.ok(report.errors.some(e => e.reference === '$P_Suitable' && e.field === 'condition'));
    assert.ok(report.errors.some(e => e.reference === '$P_Suitable' && e.field === 'score.not_applicable'));
    assert.ok(report.errors.filter(e => e.form === 'pub').every(e => e.reference === '$P_Suitable'));
});

test('include selection, exclude precedence, and excluded consumers follow the real loader', async () => {
    const c = config();
    c.pub.include = ['P_ReproducibleScripts'];
    // exclude: [] wins over include, so this still selects the complete core.
    assert.deepEqual(validate(await ctx.menu(c)).issues.filter(e => e.form === 'pub'), []);
    delete c.pub.exclude;
    const partial = validate(await ctx.menu(c));
    assert.ok(partial.errors.some(e => e.reference === '$P_Suitable'));
    assert.ok(partial.issues.every(e => e.form !== 'pub' || e.indicator.startsWith('P_ReproducibleScripts')));
    c.pub.include = ['DOI'];
    assert.deepEqual(validate(await ctx.menu(c)).issues.filter(e => e.form === 'pub'), []);
});

test('standalone expansion pack reports its missing core dependency', async () => {
    const c = config();
    c.pub.sources = ['packs/EP/EP-theory_development.json'];
    const report = validate(await ctx.menu(c));
    assert.ok(report.errors.length > 0);
    assert.ok(report.errors.filter(e => e.form === 'pub').every(e => e.reference === '$P_Suitable'));
});

test('checkbox options, table rows, comments and runtime fields resolve; absent keys do not', () => {
    const forms = { pub: { elements: [
        element('Flags', { type: 'checkbox', options: [{ id: 'Yes' }] }),
        element('Table', { type: 'tabular_radio', rows: [{ id: 'Row' }] }),
        element('Consumer', { condition: '$Flags_Yes && $Table_Row && $Flags_Comment && $date_added && $type' }),
        element('Broken', { condition: '$Flags_No || $Table_Missing || $Flags || $Table' })
    ] } };
    assert.deepEqual(validate(forms).errors.map(e => e.reference), ['$Flags_No', '$Table_Missing', '$Flags', '$Table']);
    forms.pub.elements.splice(0, 1);
    assert.ok(validate(forms).errors.some(e => e.reference === '$Flags_Yes'));
});

test('references resolve in their own form or metadata; config is not an indicator', () => {
    const forms = {
        meta: { elements: [element('Rater')] },
        pub: { elements: [element('Consumer', { condition: 'meta$Rater && config$pub.active && $Rater && meta$Missing' })] },
        software: { elements: [element('Missing')] }
    };
    const report = validate(forms);
    assert.deepEqual(report.errors.map(e => [e.reference, e.targetForm]), [['$Rater', 'pub'], ['meta$Missing', 'meta']]);
    forms.meta.elements = [];
    assert.ok(validate(forms).errors.some(e => e.reference === 'meta$Rater'));
});

test('nested expressions are errors, text references warnings, and duplicates collapse per field', () => {
    const forms = { pub: { elements: [element('Consumer', {
        condition: '$Missing || $Missing',
        score: { condition: '$Missing', not_applicable: 'meta$Absent' },
        scoring: { rules: [{ when: '$Legacy' }] },
        validation: { condition: '$Invalid', pattern: '^USD$' },
        options: [{ id: 'A', condition: '$Option', text: 'Read $Help' }],
        title: 'See $TitleMissing and config$main_title',
        info: '{ $Highlight | Label }',
        default: '$NotAnExpression'
    })] } };
    const report = validate(forms);
    assert.equal(report.errors.length, 7);
    assert.equal(report.warnings.length, 2);
    assert.ok(report.errors.some(e => e.field === 'scoring.rules[0].when'));
    assert.ok(report.errors.some(e => e.field === 'info (highlight condition)'));
    assert.equal(report.errors.filter(e => e.field === 'condition').length, 1);
    assert.deepEqual(report.warnings.map(e => e.reference), ['$Help', '$TitleMissing']);
});

test('global text references use publication keys and never fall back to unrelated forms', () => {
    const forms = {
        meta: { elements: [element('Intro', { type: 'info', text: 'global$P_TopPaper_Select@paper_count; global$Missing@paper_count' })] },
        pub: { elements: [element('P_TopPaper', { type: 'checkbox', options: [{ id: 'Select' }] })] }
    };
    const report = validate(forms);
    assert.equal(report.errors.length, 0);
    assert.deepEqual(report.warnings.map(e => e.reference), ['global$Missing']);
});

test('all selected forms are checked even if the output type is inactive; inputs are not mutated', () => {
    const forms = { software: { elements: [element('S_Test', { condition: '$Missing' })] }, config: { software: { active: false } } };
    const before = JSON.stringify(forms);
    assert.equal(validate(forms).errors.length, 1);
    assert.equal(JSON.stringify(forms), before);
    assert.equal(validate({}).indicatorsChecked, 0);
});

// Exercise the actual collector startup/store code with a simulated UI. This
// catches popup timing and wiring failures but does not replace a browser test.
async function startup(elements) {
    const state = { rendered: false, tours: 0, opened: [] };
    const dialog = { open: false, showModal() {
        assert.ok(state.rendered, 'Dialog must be rendered before it is opened');
        this.open = true;
        state.opened.push('pack-validation-modal');
    }, close() { this.open = false; } };
    const stores = {
        forms: {}, indentations: {}, config: { config: {}, queryConfig: {} },
        data: { input: [{}], manualInit() {} }, warnings: { manualInit() {} }
    };
    const browser = vm.createContext({
        console, params: new URLSearchParams(),
        normalizePublicationConfig: ctx.normalizePublicationConfig,
        jsyaml: { load: JSON.parse },
        loadConfigText: async () => JSON.stringify(config()),
        menu: async () => ({ pub: { elements } }),
        window: { getDepths: () => [] },
        Alpine: {
            store(name, value) {
                if (arguments.length === 2) stores[name] = value;
                return stores[name];
            },
            nextTick(callback) {
                return Promise.resolve().then(() => { state.rendered = true; callback(); });
            }
        },
        document: {
            getElementById: id => { assert.equal(id, 'pack-validation-modal'); return dialog; },
            documentElement: { style: { setProperty() {} } }
        },
        fetch: async () => ({ text: async () => '' }),
        showdown: { Converter: class { makeHtml(text) { return text; } } },
        renderMatomoOptOut() {}, objectHash: JSON.stringify,
        setTimeout() {}, switchToTab() {},
        driver: () => ({ drive() { state.tours++; } }), tourMain: {},
        showInstructionsModal() {}
    });
    vm.runInContext(read('utils/pack-validator.js'), browser);
    const storeStart = html.indexOf("Alpine.store('packValidation', {");
    assert.ok(storeStart >= 0);
    vm.runInContext(html.slice(storeStart, html.indexOf("Alpine.store('forms', {", storeStart)), browser);
    const modalStart = html.indexOf('const showModal =');
    vm.runInContext(html.slice(modalStart, html.indexOf('const showInfoModal =', modalStart)), browser);
    const startupStart = html.indexOf('loadConfigText().then(text =>');
    assert.ok(startupStart >= 0);
    await vm.runInContext(html.slice(startupStart, html.indexOf('</script>', startupStart)), browser);
    // The existing loader does not return its nested menu() chain.
    await new Promise(resolve => setImmediate(resolve));
    state.rendered = true;
    return { state, stores, dialog, browser };
}

test('startup errors proactively open the modal after rendering; it closes and rechecks on demand', async () => {
    const ui = await startup([element('Consumer', { condition: '$Missing' })]);
    assert.equal(ui.stores.packValidation.report.errors.length, 1);
    assert.equal(ui.dialog.open, true);
    assert.equal(ui.state.tours, 0);
    vm.runInContext("closeModal('pack-validation-modal')", ui.browser);
    assert.equal(ui.dialog.open, false);
    ui.stores.forms.pub.elements.push(element('Missing'));
    ui.stores.packValidation.open();
    assert.equal(ui.dialog.open, true);
    assert.equal(ui.stores.packValidation.report.issues.length, 0);
});

test('warnings and successful checks stay optional and are available through the modal store', async () => {
    for (const fields of [{ title: 'See $Missing' }, {}]) {
        const ui = await startup([element('Consumer', fields)]);
        assert.equal(ui.dialog.open, false);
        assert.equal(ui.stores.packValidation.report.errors.length, 0);
        assert.equal(ui.stores.packValidation.report.warnings.length, fields.title ? 1 : 0);
        ui.stores.packValidation.open();
        assert.equal(ui.dialog.open, true);
    }
});
