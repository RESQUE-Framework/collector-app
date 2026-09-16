#!/usr/bin/env node
'use strict';

// Render the JSON emitted by verify-packs.cjs. No dependencies or network access.
// The generated report preserves the verifier's exit code, even after successful
// rendering. A renderer/input error exits 2 and is written to stderr.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);
const pretty = value => escapeHTML(JSON.stringify(value, null, 2));
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

/** Reject incomplete or inconsistent reports rather than implying a pass. */
function validateReport(report) {
    assert.ok(report && typeof report === 'object' && !Array.isArray(report), 'Expected a JSON report object');
    if (own(report, 'error')) return { setupError: true, exitCode: 2 };
    assert.ok(Array.isArray(report.checks), 'Missing checks array');
    assert.ok(Array.isArray(report.jsonParsing), 'Missing jsonParsing array');
    assert.ok(report.summary && typeof report.summary === 'object', 'Missing summary');
    assert.equal(typeof report.strict, 'boolean', 'Missing strict-mode flag');
    const ids = new Set();
    for (const check of report.checks) {
        assert.ok(check && typeof check === 'object', 'Each check must be an object');
        assert.ok(typeof check.id === 'string' && check.id.length > 0, 'Each check needs an ID');
        assert.ok(!ids.has(check.id), `Duplicate check ID: ${check.id}`);
        ids.add(check.id);
        assert.equal(typeof check.name, 'string', `Missing name for ${check.id}`);
        assert.ok(['regression', 'known-issue', 'characterization'].includes(check.kind), `Unknown kind for ${check.id}`);
        const allowed = check.kind === 'known-issue' ? ['reproduced', 'failed'] : ['passed', 'failed'];
        assert.ok(allowed.includes(check.status), `Unknown status for ${check.id}`);
        if (check.status === 'failed') assert.ok(check.error, `Missing failure details for ${check.id}`);
    }
    for (const entry of report.jsonParsing) {
        assert.ok(entry && typeof entry.file === 'string', 'Missing pack filename');
        assert.equal(typeof entry.valid, 'boolean', `Missing validation result for ${entry.file}`);
    }
    const count = (kind, status) => report.checks.filter(c => c.kind === kind && c.status === status).length;
    const failed = report.checks.filter(c => c.status === 'failed').length;
    const invalid = report.jsonParsing.filter(p => !p.valid).length;
    const reproduced = count('known-issue', 'reproduced');
    const expected = {
        totalChecks: report.checks.length,
        regressions: { passed: count('regression', 'passed'), failed: count('regression', 'failed') },
        knownIssues: { reproduced, failedToReproduce: count('known-issue', 'failed') },
        characterizations: { passed: count('characterization', 'passed'), failed: count('characterization', 'failed') },
        jsonFiles: { valid: report.jsonParsing.length - invalid, invalid },
        failedChecks: failed,
        exitCode: failed || invalid || (report.strict && reproduced) ? 1 : 0
    };
    for (const [key, value] of Object.entries(expected)) {
        assert.deepEqual(report.summary[key], value, `Inconsistent summary.${key}`);
    }
    return { setupError: false, exitCode: expected.exitCode };
}

const CSS = `
:root{color-scheme:light;--ink:#162a3a;--muted:#526575;--line:#d9e3ea;--paper:#fff;--bg:#f2f5f7;--green:#1d654d;--amber:#7d4804;--red:#aa2436;--blue:#245a81}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}a{color:#155982;text-underline-offset:3px}a:hover{text-decoration-thickness:2px}header{background:#142c3c;color:white;border-top:6px solid #48b7af}header .wrap{padding-top:32px;padding-bottom:32px}.wrap{max-width:1200px;margin:0 auto;padding:28px 32px}.eyebrow{text-transform:uppercase;letter-spacing:.13em;font-size:12px;font-weight:750;color:#bbd7e5}h1{font-size:clamp(28px,5vw,42px);line-height:1.13;margin:10px 0 16px;letter-spacing:-.035em}header p{max-width:780px;margin:0;color:#d4e4ed}header nav{display:flex;flex-wrap:wrap;gap:20px;margin-top:22px}header a{color:#e8f4fa;font-size:14px}h2{font-size:24px;line-height:1.3;margin:0 0 14px;letter-spacing:-.02em}h3{font-size:17px;line-height:1.45;margin:12px 0 8px}p{margin:8px 0 14px}.muted{color:var(--muted)}.small{font-size:13px}.banner{padding:22px 24px;border:1px solid var(--line);border-left:5px solid var(--amber);border-radius:10px;background:#fff6e8;margin-bottom:24px}.banner h2{font-size:22px}.banner p:last-child{margin-bottom:0}.banner.bad{border-left-color:var(--red);background:#fff0f2}.banner.good{border-left-color:var(--green);background:#eef8f2}.cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin:20px 0 28px}.metric{background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:20px}.metric strong{font-size:34px;line-height:1.2;display:block;margin:5px 0}.metric .label{display:block;font-size:13px;font-weight:700;letter-spacing:.02em}.metric p{font-size:13px;color:var(--muted);margin:5px 0 0}.metric.good strong{color:var(--green)}.metric.warn strong{color:var(--amber)}.metric.bad strong{color:var(--red)}.meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 26px;padding:20px 24px;background:white;border:1px solid var(--line);border-radius:10px;margin:0 0 24px}.meta dt{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);font-weight:700}.meta dd{margin:3px 0 5px;overflow-wrap:anywhere;font-size:14px}.section{margin-top:36px}.note{border:1px solid var(--line);border-radius:8px;padding:15px 18px;background:#eaf2f7}.legend{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin:18px 0}.legend p{font-size:14px;margin:5px 0 0}.legend strong{font-size:14px}.toolbar{display:flex;align-items:end;flex-wrap:wrap;gap:12px;background:white;border:1px solid var(--line);padding:18px;border-radius:10px;margin:20px 0 12px}.field{display:flex;flex-direction:column;gap:5px;flex:1 1 220px}.field label{font-size:13px;font-weight:700}input,select,button{font:inherit;border:1px solid #aebecb;border-radius:6px;padding:9px 11px;background:white;color:var(--ink)}button{cursor:pointer;font-size:14px}button:hover{background:#edf3f7}input:focus-visible,select:focus-visible,button:focus-visible,summary:focus-visible,a:focus-visible{outline:3px solid #3b8eba;outline-offset:3px}.finding-index{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}.finding-index a{border:1px solid #d8c19e;background:#fff8ed;border-radius:6px;padding:6px 10px;font-size:13px}.check{background:white;border:1px solid var(--line);border-radius:10px;padding:18px 22px;margin:12px 0;border-left:4px solid #a7bbc9;break-inside:avoid;scroll-margin-top:15px}.check.good{border-left-color:var(--green)}.check.warn{border-left-color:#b5761d}.check.bad{border-left-color:var(--red)}.topline{display:flex;align-items:center;flex-wrap:wrap;gap:8px}.check-id{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:13px;font-weight:700}.kind{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);margin-left:auto}.badge{display:inline-block;font-size:12px;font-weight:700;padding:3px 8px;border-radius:5px;background:#e9f1f7;color:#244f71}.badge.good{background:#e7f5ed;color:var(--green)}.badge.warn{background:#fff1d8;color:var(--amber)}.badge.bad{background:#fde8ec;color:var(--red)}.finding{font-size:13px;color:var(--muted)}.check p.small{margin:8px 0}details{margin-top:12px}summary{cursor:pointer;font-size:14px;font-weight:650;padding:4px 0}pre{margin:10px 0 0;padding:16px;background:#f0f4f7;border:1px solid var(--line);border-radius:7px;font:12px/1.6 ui-monospace,SFMono-Regular,Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere;tab-size:2}code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:.9em;overflow-wrap:anywhere}.table-wrap{overflow-x:auto;border:1px solid var(--line);border-radius:8px;background:white}table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;padding:10px 14px;vertical-align:top;border-bottom:1px solid var(--line);overflow-wrap:anywhere}th{background:#e8eff4;font-size:12px;text-transform:uppercase;letter-spacing:.04em}tr:last-child td{border-bottom:none}footer{padding:28px 0 12px;color:var(--muted);font-size:13px}.empty{padding:24px;background:white;border:1px dashed #aabac8;border-radius:8px}#shown{margin:8px 0 14px}[hidden]{display:none!important}.provenance td:last-child{word-break:break-all}
@media(max-width:760px){.wrap{padding:22px 16px}.cards{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.metric{padding:16px}.meta,.legend{grid-template-columns:1fr}.check{padding:16px}.kind{margin-left:0;width:100%;order:3}.banner{padding:18px}.toolbar{align-items:stretch}.toolbar button{flex:1 1 auto}}
@media print{body{background:white;font-size:11px}.wrap{max-width:none;padding:16px 0}header{background:white;color:var(--ink);border-top:2px solid var(--ink)}header .wrap{padding:12px 0}header p,.eyebrow{color:var(--muted)}h1{font-size:28px}header nav,.toolbar,.finding-index,.screen-only,#shown,#empty{display:none!important}.cards{gap:8px}.metric{padding:10px}.metric strong{font-size:24px}.banner{margin-bottom:16px}.section{margin-top:22px}.check{margin:8px 0;padding:12px;break-inside:auto}.check[hidden]{display:block!important}.check h3,.topline{break-after:avoid}.meta{padding:12px}.table-wrap{overflow:visible}pre{font-size:9px;max-height:none}.no-print{display:none!important}a{color:inherit}footer{padding:16px 0}}
`;

// Static markup contains all results. Filtering is progressive enhancement;
// disabling JavaScript never hides checks. No result is injected as HTML in JS.
const SCRIPT = `
(() => {
  const toolbar = document.getElementById('toolbar');
  const search = document.getElementById('search');
  const filter = document.getElementById('filter');
  const cards = Array.from(document.querySelectorAll('[data-check]'));
  const shown = document.getElementById('shown');
  const empty = document.getElementById('empty');
  if (toolbar) {
    toolbar.hidden = false;
    const update = () => {
      const needle = search.value.trim().toLowerCase();
      let count = 0;
      cards.forEach(card => {
        const matches = filter.value === 'all' ||
          (filter.value === 'attention' && card.dataset.attention === 'true') ||
          (filter.value === 'publication' && card.dataset.publication === 'true') ||
          card.dataset.kind === filter.value;
        card.hidden = !(matches && card.textContent.toLowerCase().includes(needle));
        if (!card.hidden) count++;
      });
      shown.textContent = count + ' of ' + cards.length + ' checks shown';
      empty.hidden = count !== 0;
    };
    search.addEventListener('input', update);
    filter.addEventListener('change', update);
    document.getElementById('reset').addEventListener('click', () => {
      search.value = ''; filter.value = 'all'; update();
    });
    document.getElementById('expand').addEventListener('click', () => {
      cards.filter(card => !card.hidden).forEach(card => card.querySelectorAll('details').forEach(d => { d.open = true; }));
    });
    document.getElementById('collapse').addEventListener('click', () => {
      cards.filter(card => !card.hidden).forEach(card => card.querySelectorAll('details').forEach(d => { d.open = false; }));
    });
    const showTarget = () => {
      const target = document.getElementById(location.hash.slice(1));
      if (target && target.hasAttribute('data-check')) {
        search.value = ''; filter.value = 'all'; update(); target.scrollIntoView();
      }
    };
    window.addEventListener('hashchange', showTarget);
    update();
    showTarget();
  }
  let detailState = [];
  window.addEventListener('beforeprint', () => {
    detailState = Array.from(document.querySelectorAll('details.print-expand')).map(d => [d, d.open]);
    detailState.forEach(([d]) => { d.open = true; });
  });
  window.addEventListener('afterprint', () => {
    detailState.forEach(([d, wasOpen]) => { d.open = wasOpen; });
  });
})();
`;

function checkPresentation(check) {
    if (check.status === 'failed') {
        return check.kind === 'known-issue'
            ? { tone: 'bad', label: 'Not reproduced - investigate', explanation: 'The known-defect expectation did not match. This may indicate a fix, a behavior change, or a test/harness problem; it does not automatically prove that the defect is fixed.' }
            : { tone: 'bad', label: check.kind === 'regression' ? 'Regression failed' : 'Characterization changed', explanation: 'The recorded expectation did not match. Review the error and application behavior.' };
    }
    if (check.kind === 'known-issue') return { tone: 'warn', label: 'Known defect reproduced', explanation: 'The test confirmed an existing defect. This is not an acceptance pass.' };
    if (check.kind === 'characterization') return { tone: '', label: 'Documented behavior matched', explanation: 'This records a limitation or policy-dependent behavior; matching it is not a correctness verdict.' };
    return { tone: 'good', label: 'Regression passed', explanation: '' };
}

function renderCheck(check, index) {
    const display = checkPresentation(check);
    const attention = check.status === 'failed' || check.kind === 'known-issue';
    const publication = check.id.startsWith('PUB-') || String(check.finding || '').startsWith('PUB-');
    const kind = { regression: 'Regression', 'known-issue': 'Known issue', characterization: 'Characterization' }[check.kind];
    return `<article class="check ${display.tone}" id="check-${index}" data-check data-kind="${escapeHTML(check.kind)}" data-attention="${attention}" data-publication="${publication}">
<div class="topline"><a class="check-id" href="#check-${index}">${escapeHTML(check.id)}</a><span class="badge ${display.tone}">${display.label}</span><span class="kind">${kind}</span></div>
<h3>${escapeHTML(check.name)}</h3>
${check.finding ? `<div class="finding">Finding reference: <strong>${escapeHTML(check.finding)}</strong></div>` : ''}
${display.explanation ? `<p class="small muted">${display.explanation}</p>` : ''}
${own(check, 'error') ? `<details class="print-expand" open><summary>Error details</summary><pre>${pretty(check.error)}</pre></details>` : ''}
${own(check, 'evidence') ? `<details class="print-expand"><summary>Recorded evidence</summary><pre>${pretty(check.evidence)}</pre></details>` : ''}
</article>`;
}

/** @returns {{html: string, exitCode: number}} */
function renderReport(report, options = {}) {
    const validation = validateReport(report);
    const renderedAt = options.renderedAt || new Date().toISOString();
    const source = options.source || 'Verification JSON';
    const s = report.summary;
    const fatal = validation.setupError;
    const failed = !fatal && (s.failedChecks > 0 || s.jsonFiles.invalid > 0);
    const hasIssues = !fatal && s.knownIssues.reproduced > 0;
    const empty = !fatal && s.totalChecks === 0;
    const tone = fatal || failed ? 'bad' : hasIssues || empty ? '' : 'good';
    const title = fatal ? 'Verification did not complete' : failed ? 'Check failures need investigation' : hasIssues ? 'Known defects remain' : empty ? 'No checks were recorded' : 'Recorded checks matched their expectations';
    const description = fatal
        ? 'The verifier reported a setup or invocation error. There is no completed test run to summarize.'
        : failed
            ? `${s.failedChecks} check expectation(s) did not match; ${s.jsonFiles.invalid} pack JSON file(s) are invalid. A known issue that did not reproduce may have been fixed or may require investigation.`
            : hasIssues
                ? `${s.regressions.passed} regression checks passed, but ${s.knownIssues.reproduced} known-defect cases were reproduced. An exit code of 0 in normal mode does not mean that the application is defect-free.`
                : empty ? 'An empty report must not be treated as evidence of application correctness.'
                : 'No regression failures or reproduced known defects were recorded in this run. Characterizations still describe limitations or policy choices; this is not a browser or end-to-end validation.';
    let main = `<section class="banner ${tone}" aria-labelledby="outcome"><h2 id="outcome">${title}</h2><p>${escapeHTML(description)}</p><p class="small"><strong>Recorded verifier exit code: ${validation.exitCode}</strong>${fatal ? '' : ` &middot; Mode: ${report.strict ? 'strict' : 'normal'}`}</p></section>`;
    main += `<dl class="meta"><div><dt>Repository in recorded run</dt><dd>${escapeHTML(report.repository || 'Not recorded')}</dd></div><div><dt>Source results</dt><dd>${escapeHTML(source)}</dd></div><div><dt>Node version in recorded run</dt><dd>${escapeHTML(report.nodeVersion || 'Not recorded')}</dd></div><div><dt>HTML rendered at</dt><dd>${escapeHTML(renderedAt)}</dd></div><div><dt>Verification run time</dt><dd>Not recorded in this report format</dd></div><div><dt>Report provenance</dt><dd>Rendered from supplied JSON; no checks were rerun by the renderer.</dd></div></dl>`;
    if (fatal) {
        main += `<section class="section"><h2>Setup error</h2><pre>${pretty(report.error)}</pre></section>`;
    } else {
        const uniqueFindings = new Set(report.checks.filter(c => c.kind === 'known-issue' && c.status === 'reproduced' && c.finding).map(c => c.finding));
        main += `<div class="cards">
<div class="metric ${s.regressions.failed ? 'bad' : 'good'}"><span class="label">REGRESSIONS PASSED</span><strong>${s.regressions.passed}</strong><p>${s.regressions.failed} failed &middot; expectations for corrected behavior</p></div>
<div class="metric ${hasIssues ? 'warn' : ''}"><span class="label">DEFECT CASES REPRODUCED</span><strong>${s.knownIssues.reproduced}</strong><p>${uniqueFindings.size} finding references &middot; ${s.knownIssues.failedToReproduce} cases did not reproduce</p></div>
<div class="metric ${s.characterizations.failed ? 'bad' : ''}"><span class="label">CHARACTERIZATIONS MATCHED</span><strong>${s.characterizations.passed}</strong><p>${s.characterizations.failed} changed &middot; not correctness verdicts</p></div>
<div class="metric ${s.jsonFiles.invalid ? 'bad' : 'good'}"><span class="label">PACK JSON FILES VALID</span><strong>${s.jsonFiles.valid}</strong><p>${s.jsonFiles.invalid} invalid &middot; syntax validation only</p></div>
</div>
<section aria-labelledby="reading"><h2 id="reading">How to read these results</h2><div class="legend"><div><strong>Regression checks</strong><p>Protect intended or corrected behavior. Failures require investigation.</p></div><div><strong>Known-issue checks</strong><p>Reproduce existing defects. After a fix, update or promote the test; do not restore the defect.</p></div><div><strong>Characterization checks</strong><p>Record current limitations or policy choices. A match is not an approval of that behavior.</p></div></div>
<p class="note small">${escapeHTML(report.interpretation || 'This report reflects only the checks recorded in its source JSON.')}</p>
<p class="small muted">Counts represent test cases, not necessarily distinct findings. The separate findings document also includes observations that are not automated here.</p></section>`;
        const priority = c => c.status === 'failed' ? 0 : c.kind === 'known-issue' ? 1 : c.kind === 'characterization' ? 2 : 3;
        const ordered = report.checks.map((check, index) => ({ check, index })).sort((a, b) => priority(a.check) - priority(b.check) || a.index - b.index);
        const findingFirst = new Map();
        for (const { check, index } of ordered) {
            if (check.kind === 'known-issue' && check.finding && !findingFirst.has(check.finding)) findingFirst.set(check.finding, index);
        }
        main += `<section class="section" id="checks"><h2>Checks <span class="muted">/ ${s.totalChecks}</span></h2><p class="muted">Failures and known defects appear first. Each entry includes the original check name and recorded evidence.</p>
<div class="toolbar screen-only" id="toolbar" hidden><div class="field"><label for="search">Search IDs, names, findings, or evidence</label><input type="search" id="search" placeholder="For example: PUB-01 or core-pub" autocomplete="off"></div><div class="field"><label for="filter">Show checks</label><select id="filter"><option value="all">All checks</option><option value="attention">Needs attention</option><option value="publication">Publication migration</option><option value="known-issue">Known issues</option><option value="regression">Regressions</option><option value="characterization">Characterizations</option></select></div><button type="button" id="reset">Reset</button><button type="button" id="expand">Expand evidence</button><button type="button" id="collapse">Collapse evidence</button></div>
<noscript><p class="note">JavaScript is disabled. All results remain readable; search and filtering are unavailable.</p></noscript>
<p id="shown" class="small muted" aria-live="polite">${s.totalChecks} of ${s.totalChecks} checks shown</p>
${findingFirst.size ? `<div class="finding-index" aria-label="Jump to known-issue findings">${Array.from(findingFirst, ([finding, index]) => `<a href="#check-${index}">${escapeHTML(finding)}</a>`).join('')}</div>` : ''}
<div id="empty" class="empty" hidden>No checks match the current filters.</div>
${ordered.map(({ check, index }) => renderCheck(check, index)).join('\n')}
</section>
<section class="section" id="packs"><h2>Pack JSON validation</h2><p class="muted">Parsing status only; valid JSON does not establish schema completeness or scoring correctness.</p><div class="table-wrap"><table><thead><tr><th scope="col">File</th><th scope="col">Parsing result</th></tr></thead><tbody>${report.jsonParsing.map(entry => `<tr><td><code>${escapeHTML(entry.file)}</code></td><td><span class="badge ${entry.valid ? 'good' : 'bad'}">${entry.valid ? 'Valid JSON' : 'Invalid JSON'}</span>${entry.error ? `<pre>${pretty(entry.error)}</pre>` : ''}</td></tr>`).join('')}</tbody></table></div></section>`;
    }
    const hashes = report.sourceSHA256 && typeof report.sourceSHA256 === 'object' ? Object.entries(report.sourceSHA256) : [];
    main += `<section class="section" id="provenance"><h2>Provenance and raw results</h2><p class="muted">This is a presentation of the source report, not a new verification run. Report contents may include local paths and test evidence; review them before public sharing.</p>
${hashes.length ? `<details class="provenance"><summary>Source file SHA-256 fingerprints (${hashes.length})</summary><div class="table-wrap"><table><thead><tr><th scope="col">Source file</th><th scope="col">SHA-256</th></tr></thead><tbody>${hashes.map(([file, hash]) => `<tr><td><code>${escapeHTML(file)}</code></td><td><code>${escapeHTML(hash)}</code></td></tr>`).join('')}</tbody></table></div></details>` : ''}
<details class="no-print"><summary>Complete source JSON</summary><pre>${pretty(report)}</pre></details></section>
<footer>Generated by render-verification-report.cjs. Self-contained HTML; no external fonts, scripts, or styles. Browser printing includes every check, regardless of the screen filter.</footer>`;
    const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><meta name="referrer" content="no-referrer"><title>RESQUE | Pack verification report</title><style>${CSS}</style></head>
<body><header><div class="wrap"><div class="eyebrow">RESQUE / Repository verification</div><h1>Pack verification report</h1><p>A readable view of verify-packs.cjs results, separating regression checks, reproduced defects, and documented limitations.</p><nav aria-label="Report sections">${fatal ? '' : '<a href="#checks">Checks</a><a href="#packs">Pack validation</a>'}<a href="#provenance">Provenance</a></nav></div></header><main class="wrap">${main}</main><script>${SCRIPT}</script></body></html>\n`;
    return { html, exitCode: validation.exitCode };
}

function main(argv) {
    const usage = 'Usage: node tests/render-verification-report.cjs input.json output.html\n' +
        'Renders existing verifier JSON without rerunning checks.\n' +
        'Exit code: recorded verifier exit code; 2 for input/rendering errors.';
    if (argv.length === 1 && ['--help', '-h'].includes(argv[0])) {
        console.log(usage);
        return 0;
    }
    if (argv.length !== 2 || argv.some(arg => arg.startsWith('--'))) throw new Error(usage);
    const input = path.resolve(argv[0]);
    const output = path.resolve(argv[1]);
    // Existing symlinks/hard links are checked before writing, too.
    assert.notEqual(input, output, 'Input and output must be different files');
    if (fs.existsSync(output)) {
        const a = fs.statSync(input), b = fs.statSync(output);
        assert.ok(a.dev !== b.dev || a.ino !== b.ino, 'Output refers to the input file');
    }
    const report = JSON.parse(fs.readFileSync(input, 'utf8'));
    const { html, exitCode } = renderReport(report, { source: path.basename(input) });
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, html, 'utf8');
    console.error(`Wrote ${output}; recorded verification exit code: ${exitCode}`);
    return exitCode;
}

module.exports = { renderReport, validateReport };
if (require.main === module) {
    try { process.exitCode = main(process.argv.slice(2)); }
    catch (error) { console.error(`HTML report error: ${error.message}`); process.exitCode = 2; }
}
