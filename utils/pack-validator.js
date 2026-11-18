// Browser-side checks for the assembled (already selected) forms. No eval,
// network requests, answer data, or dependencies are needed for validation.
// Publish explicitly so classic scripts and module/wrapper loaders expose the
// same API to the collector. A top-level const is local to a module or wrapper.
globalThis.PackValidator = (() => {
    const formTypes = ['meta', 'pub', 'software', 'data'];
    const recordKeys = ['type', 'version', 'date_added', 'date_modified', 'position', 'CollectorURL'];
    const displayFields = new Set(['title', 'text', 'info', 'background', 'tip_external', 'message']);

    // Maturity of a pack, declared by its optional top-level "status" field.
    // Only problems in stable packs of active output types block the collector.
    const packStatuses = ['alpha', 'beta', 'stable'];

    // An explicit status wins. Without one, a pack in packs/dev/ is alpha and
    // every other pack (including packs/archive/) is stable. An unknown value
    // counts as stable, the strictest choice, and validate() reports it.
    function packStatus(pack, source = '') {
        if (pack?.status !== undefined) {
            return packStatuses.includes(pack.status) ? pack.status : 'stable';
        }
        return /^(\.\/)?packs\/dev\//.test(source) ? 'alpha' : 'stable';
    }

    // Shown next to the status badge in preview.html and packs.html.
    const statusNotes = {
        alpha: 'Alpha: in early development. Questions, conditions and points may be wrong and will change.',
        beta: 'Beta: complete, but still being tested. Points and wording may still change.'
    };

    const invalidStatus = pack => pack.declaredStatus !== undefined && !packStatuses.includes(pack.declaredStatus);

    // Provenance of one pack in an assembled form, stored as `form.packs`.
    // `ids` lists every element of the pack file, also excluded ones, so the
    // validator can tell which pack a selected element came from.
    function packInfo(pack, source) {
        const info = {
            source, prefix: pack?.prefix, version: pack?.version,
            status: packStatus(pack, source),
            ids: (pack?.elements || []).map(element => element.id)
        };
        // Only a declared value is stored; absence means it was inferred.
        if (pack?.status !== undefined) info.declaredStatus = pack.status;
        return info;
    }

    function answerKeys(elements = [], type) {
        const keys = new Set(recordKeys);
        if (type === 'meta') keys.add('date_created');
        // DOI lookup supplies Abstract without a separate input indicator.
        if (type === 'pub') keys.add('Abstract');
        for (const element of elements) {
            if (['info', 'separator'].includes(element.type)) continue;
            if (element.type === 'checkbox') {
                for (const option of element.options || []) keys.add(`${element.id}_${option.id}`);
            } else if (element.type === 'tabular_radio') {
                for (const row of element.rows || []) keys.add(`${element.id}_${row.id}`);
            } else {
                keys.add(element.id);
            }
            keys.add(`${element.id}_Comment`);
        }
        return keys;
    }

    function validate(forms) {
        // Every configured output type is checked, including `active: false`
        // ones. Being active only decides whether a problem blocks. Metadata
        // and types without an active flag count as active.
        const isActive = type => forms.config?.[type]?.active !== false;
        // Defaults deliberately do not count: use() builds them before exclude/
        // include filtering, so they also contain answers for removed indicators.
        const keys = Object.fromEntries(formTypes.map(type => [type, answerKeys(forms[type]?.elements, type)]));
        // Element ID -> pack it came from. Forms without `packs` (e.g. assembled
        // by older code) are treated as consisting of stable packs.
        const origins = Object.fromEntries(formTypes.map(type => {
            const byId = new Map();
            for (const pack of forms[type]?.packs ?? []) {
                for (const id of pack.ids ?? []) if (!byId.has(id)) byId.set(id, pack);
            }
            return [type, byId];
        }));
        const issues = [];
        let indicatorsChecked = 0;

        // Adds where an issue comes from and whether it blocks:
        // `deferred` is null for current issues, otherwise the reason it does
        // not block - 'inactive' (output type switched off) takes precedence
        // over the pack status ('alpha' or 'beta'). Configuration problems
        // (presets) do not depend on the pack status: `packBound` is false.
        function add(issue, pack, packBound = true) {
            const status = pack?.status ?? 'stable';
            issue.pack = pack?.source ?? null;
            issue.packStatus = status;
            issue.formActive = isActive(issue.form);
            issue.deferred = !issue.formActive ? 'inactive' : packBound && status !== 'stable' ? status : null;
            issue.blocking = issue.severity === 'error' && issue.deferred === null;
            issues.push(issue);
        }

        for (const type of formTypes) {
            for (const pack of forms[type]?.packs ?? []) {
                if (!invalidStatus(pack)) continue;
                add({
                    code: 'invalid-pack-status', severity: 'error', form: type,
                    indicator: null, field: 'status', location: `${pack.source}: status`,
                    expression: `"status": ${JSON.stringify(pack.declaredStatus)}`,
                    message: `The pack "${pack.source}" declares the status ${JSON.stringify(pack.declaredStatus)}. Use "alpha", "beta" or "stable"; until then the pack is treated as stable.`
                }, pack);
            }
        }

        // Configuration presets are resolved during assembly (menu.js). Invalid
        // ones are skipped there and reported here, for every configured type.
        for (const type of formTypes) {
            for (const issue of forms[type]?.presetIssues ?? []) {
                add({
                    code: 'invalid-preset', severity: 'error', form: type,
                    indicator: issue.indicator, field: 'preset',
                    location: `config.${type}.preset.${issue.indicator}`,
                    expression: `${issue.indicator}: ${JSON.stringify(issue.value)}`,
                    message: issue.message
                }, origins[type].get(issue.indicator), false);
            }
        }

        for (const form of formTypes) {
            for (const [index, element] of (forms[form]?.elements || []).entries()) {
                indicatorsChecked++;
                const pack = origins[form].get(element.id);
                const seen = new Set();
                function check(text, field, severity) {
                    // Match the app's reference substitution, including inside
                    // quoted expressions. Configuration is a separate namespace.
                    for (const match of text.matchAll(/(?:(meta|config|global)\$|\$)([a-zA-Z0-9_]+)/g)) {
                        const [, namespace, key] = match;
                        if (namespace === 'config') continue;
                        // global$...@paper_count counts publication answers.
                        const targetForm = namespace === 'meta' ? 'meta' : namespace === 'global' ? 'pub' : form;
                        if (keys[targetForm].has(key)) continue;
                        const duplicateKey = `${field}:${severity}:${match[0]}`;
                        if (seen.has(duplicateKey)) continue;
                        seen.add(duplicateKey);
                        add({
                            code: 'missing-indicator-reference', severity, form,
                            indicator: element.id, field, reference: match[0], targetForm,
                            location: `${form}.elements[${index}].${field}`,
                            expression: text,
                            message: `This indicator refers to the ${match[0]} indicator in the "${targetForm}" pack which does not exist (maybe it was excluded in your config.yaml?).`
                        }, pack);
                    }
                }

                function visit(value, path = '', expression = false) {
                    if (Array.isArray(value)) {
                        value.forEach((item, i) => visit(item, `${path}[${i}]`, expression));
                    } else if (value && typeof value === 'object') {
                        for (const [field, child] of Object.entries(value)) {
                            const childPath = path ? `${path}.${field}` : field;
                            const isExpression = expression || ['condition', 'not_applicable', 'score', 'scoring'].includes(field);
                            if (typeof child === 'string') {
                                if (isExpression) {
                                    check(child, childPath, 'error');
                                } else if (displayFields.has(field)) {
                                    // Highlight conditions affect logic; the rest
                                    // of display text only produces warnings.
                                    const displayText = child.replace(/\{(.*?)\|(.*?)\}/g, (match, condition, text) => {
                                        check(condition, `${childPath} (highlight condition)`, 'error');
                                        return text;
                                    });
                                    check(displayText, childPath, 'warning');
                                }
                            } else {
                                visit(child, childPath, isExpression);
                            }
                        }
                    } else if (typeof value === 'string' && expression) {
                        check(value, path, 'error');
                    }
                }
                visit(element);
            }
        }

        // An active output type built from an alpha/beta pack gets one current
        // warning, so its known problems are not overlooked although they do
        // not block. Inactive types need no such notice.
        for (const form of formTypes) {
            if (!isActive(form)) continue;
            for (const pack of forms[form]?.packs ?? []) {
                if (pack.status === 'stable') continue;
                const known = issues.filter(issue => issue.form === form && issue.pack === pack.source);
                const errors = known.filter(issue => issue.severity === 'error').length;
                const warnings = known.length - errors;
                add({
                    code: 'immature-pack', severity: 'warning', form,
                    indicator: null, field: 'status', location: `${pack.source}: status`,
                    expression: pack.declaredStatus === undefined
                        ? `${pack.source} (in packs/dev/, no "status" field)` : `"status": "${pack.status}"`,
                    message: `The "${form}" output type is active and uses the ${pack.status} pack "${pack.source}" (${errors} error${errors === 1 ? '' : 's'}, ${warnings} warning${warnings === 1 ? '' : 's'}; listed under "Not blocking"). It is still in development: conditions, points and wording may be wrong or change.`
                }, pack, false);
            }
        }

        const order = list => [
            ...list.filter(issue => issue.severity === 'error'),
            ...list.filter(issue => issue.severity === 'warning')
        ];
        const current = order(issues.filter(issue => issue.deferred === null));
        const deferred = order(issues.filter(issue => issue.deferred !== null));
        const all = [...current, ...deferred];
        return {
            issues: all,
            errors: all.filter(issue => issue.severity === 'error'),
            warnings: all.filter(issue => issue.severity === 'warning'),
            // Current errors: these open the modal on startup.
            blocking: current.filter(issue => issue.blocking),
            current, deferred, indicatorsChecked
        };
    }

    return { validate, packStatus, packInfo, packStatuses, statusNotes };
})();
