// Logic of validator.html: loading what to check and rendering reports of
// utils/pack-validator.js. Everything runs in the browser; a pack file chosen
// by the user is read locally and never uploaded. Pack contents are inserted
// with textContent only, so a pack cannot inject markup into the page.
globalThis.PackValidatorPage = (() => {
    // Same lookup as the collector: config.yaml, else config-default.yaml.
    async function loadConfigSource(fetchFile = fetch) {
        for (const file of ['config/config.yaml', 'config/config-default.yaml']) {
            const response = await fetchFile(`./${file}`);
            if (response.ok) return { file, text: await response.text() };
        }
        throw new Error('No configuration found (config/config.yaml or config/config-default.yaml).');
    }

    // Report for the configuration, exactly as "Pack validation" in the collector.
    async function checkConfiguration(fetchFile = fetch) {
        const { file, text } = await loadConfigSource(fetchFile);
        const config = parseConfigFile(text, file);
        const forms = await menu(config);
        forms.config = config;
        return { file, config, report: PackValidator.validate(forms) };
    }

    // Pack files of this app: every configured source plus the preview catalog
    // (packs/info.json), with the file names preview.html uses.
    function packSources(config, catalog = []) {
        const sources = [];
        for (const type of ['meta', 'pub', 'software', 'data']) {
            for (const source of config?.[type]?.sources ?? []) sources.push(normalizePublicationSource(source));
        }
        for (const entry of catalog) {
            const folder = entry.path && entry.path !== '.' ? `${entry.path}/` : '';
            const version = entry.version ? `-${String(entry.version).replaceAll('.', '_')}` : '';
            sources.push(`packs/${folder}${entry.type}${version}.json`);
        }
        return [...new Set(sources.map(source => source.replace(/^\.\//, '')))];
    }

    // Packs a file is checked together with, as in scripts/validate-packs.cjs.
    function companionSources(text) {
        let prefix = null;
        try { prefix = JSON.parse(text)?.prefix; } catch { /* reported as invalid-json */ }
        const form = PackValidator.formOfPrefix(prefix);
        return [
            ...(form !== 'meta' ? ['packs/core-meta.json'] : []),
            ...(form === 'pub' && prefix !== 'P' ? ['packs/core-pub.json'] : [])
        ];
    }

    async function checkFile(source, text, { withCore = true, fetchFile = fetch } = {}) {
        if (/^(\.\/)?packs\/archive\//.test(source)) {
            const { issues } = PackValidator.parsePackText(source, text);
            const marked = issues.map(issue => ({ ...issue, deferred: null, blocking: true }));
            return { issues: marked, errors: marked, warnings: [], blocking: marked, current: marked, deferred: [], notices: [], indicatorsChecked: 0 };
        }
        const companions = [];
        if (withCore) {
            for (const companion of companionSources(text)) {
                const response = await fetchFile(`./${companion}`);
                if (response.ok) companions.push({ source: companion, text: await response.text() });
            }
        }
        return PackValidator.checkPackFiles([{ source, text }], companions);
    }

    // --- Rendering ---------------------------------------------------------

    function el(tag, attributes = {}, ...children) {
        const node = document.createElement(tag);
        for (const [name, value] of Object.entries(attributes)) {
            if (name === 'className') node.className = value;
            else node.setAttribute(name, value);
        }
        for (const child of children.flat()) {
            if (child === null || child === undefined || child === false) continue;
            node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
        }
        return node;
    }

    const reasonText = issue => issue.deferred === 'inactive'
        ? `Not blocking: the "${issue.form}" output type is inactive (active: false).`
        : issue.deferred ? `Not blocking: ${issue.deferred} pack.` : null;

    function issueElement(issue) {
        const label = issue.severity === 'error' ? 'Error' : issue.severity === 'warning' ? 'Warning' : 'Notice';
        const where = issue.pack ? `${issue.pack}${issue.line ? `, line ${issue.line}` : ''}` : null;
        return el('li', { className: `pack-validation-${issue.severity}` },
            el('strong', {}, label),
            issue.form ? ` · ${issue.form}` : '',
            issue.indicator ? [' · ', el('code', {}, issue.indicator)] : '',
            ' · ', el('a', { className: 'pack-validation-rule', href: PackValidator.guideUrl, target: '_blank', rel: 'noopener' }, issue.code),
            reasonText(issue) ? el('div', { className: 'pack-validation-reason' }, reasonText(issue)) : null,
            where ? el('div', {}, 'Pack: ', el('code', {}, where),
                issue.packStatus && issue.packStatus !== 'stable' ? el('span', { className: 'status-badge' }, issue.packStatus) : null) : null,
            issue.field ? el('div', {}, 'Field: ', el('code', {}, issue.field)) : null,
            el('p', {}, issue.message),
            issue.hint ? el('p', { className: 'pack-validation-hint' }, `How to fix: ${issue.hint}`) : null,
            issue.expression ? el('details', {}, el('summary', {}, 'Show expression or text'), el('pre', {}, issue.expression)) : null
        );
    }

    function summaryText(report) {
        const warnings = report.current.filter(issue => issue.severity === 'warning').length;
        const n = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;
        return `${n(report.blocking.length, 'blocking error')}, ${n(warnings, 'warning')}, ${report.deferred.length} not blocking, ${n(report.notices.length, 'notice')}`;
    }

    // One report: summary, current problems, then collapsed groups.
    function reportElement(title, report) {
        // ✓ nothing to fix, ✗ blocking errors, ! anything else (warnings, or
        // problems that do not block, e.g. in an alpha pack).
        const mark = report.blocking.length ? ['validator-failed', '✗ ']
            : report.current.length || report.deferred.length ? ['validator-warn', '! '] : ['validator-ok', '✓ '];
        const section = el('section', { className: 'validator-report' },
            el('h3', {}, el('span', { className: mark[0] }, mark[1]), title),
            el('p', { className: 'validator-summary' }, summaryText(report)));
        if (report.current.length) section.appendChild(el('ol', { className: 'pack-validation-results' }, report.current.map(issueElement)));
        const group = (label, list) => list.length
            ? el('details', { className: 'pack-validation-deferred' }, el('summary', {}, `${label} (${list.length})`),
                el('ol', { className: 'pack-validation-results' }, list.map(issueElement)))
            : null;
        const deferred = group('Not blocking: inactive output types and alpha/beta packs', report.deferred);
        const notices = group('Notices: for information', report.notices);
        if (deferred) section.appendChild(deferred);
        if (notices) section.appendChild(notices);
        return section;
    }

    function errorElement(title, error) {
        return el('section', { className: 'validator-report' },
            el('h3', {}, el('span', { className: 'validator-failed' }, '✗ '), title),
            el('p', { className: 'pack-validation-error' }, error.message || String(error)));
    }

    return { loadConfigSource, checkConfiguration, packSources, companionSources, checkFile, issueElement, reportElement, errorElement, summaryText };
})();
