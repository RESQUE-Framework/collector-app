const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const match = html.match(/const tourMain = \(\) => \(\{[\s\S]*?\n        \}\);/);
assert.ok(match, 'Main tour definition exists');

const config = { show_beta_warning: false };
const context = { Alpine: { store: () => ({ config }) } };
const tourMain = vm.runInNewContext(`${match[0]}\ntourMain`, context);
const warning = 'Note: The RESQUE is still a beta version and in active development.';

assert.ok(!tourMain().steps[0].popover.description.includes(warning));
config.show_beta_warning = true;
assert.ok(tourMain().steps[0].popover.description.includes(warning));
assert.equal((html.match(/driver\(tourMain\(\)\)\.drive\(\)/g) || []).length, 2);
