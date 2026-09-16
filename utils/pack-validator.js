// Browser-side checks for the assembled (already selected) forms. No eval,
// network requests, answer data, or dependencies are needed for validation.
// Publish explicitly so classic scripts and module/wrapper loaders expose the
// same API to the collector. A top-level const is local to a module or wrapper.
globalThis.PackValidator = (() => {
    const formTypes = ['meta', 'pub', 'software', 'data'];
    const recordKeys = ['type', 'version', 'date_added', 'date_modified', 'position', 'CollectorURL'];
    const displayFields = new Set(['title', 'text', 'info', 'background', 'tip_external', 'message']);

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
        // Metadata and other types without an active flag remain enabled.
        const activeTypes = formTypes.filter(type => forms.config?.[type]?.active !== false);
        // Defaults deliberately do not count: use() builds them before exclude/
        // include filtering, so they also contain answers for removed indicators.
        const keys = Object.fromEntries(formTypes.map(type => [type,
            activeTypes.includes(type) ? answerKeys(forms[type]?.elements, type) : new Set()
        ]));
        const issues = [];
        let indicatorsChecked = 0;

        for (const form of activeTypes) {
            for (const [index, element] of (forms[form]?.elements || []).entries()) {
                indicatorsChecked++;
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
                        issues.push({
                            code: 'missing-indicator-reference', severity, form,
                            indicator: element.id, field, reference: match[0], targetForm,
                            location: `${form}.elements[${index}].${field}`,
                            expression: text,
                            message: `This indicator refers to the ${match[0]} indicator in the "${targetForm}" pack which does not exist (maybe it was excluded in your config.yaml?).`
                        });
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

        const errors = issues.filter(issue => issue.severity === 'error');
        const warnings = issues.filter(issue => issue.severity === 'warning');
        return { issues: [...errors, ...warnings], errors, warnings, indicatorsChecked };
    }

    return { validate };
})();
