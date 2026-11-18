// Checks pack definitions: each pack file on its own (structure, IDs, options
// and points, expressions) and the forms assembled from a configuration
// (references, collisions, include/exclude, score categories). Used by the
// collector (index.html), validator.html and scripts/validate-packs.cjs.
// No answer data, network requests or dependencies are needed. Expressions are
// compiled to check their syntax but never run; this needs utils/expressions.js.
// Publish explicitly so classic scripts and module/wrapper loaders expose the
// same API. A top-level const is local to a module or wrapper.
globalThis.PackValidator = (() => {
    const formTypes = ['meta', 'pub', 'software', 'data'];
    const recordKeys = ['type', 'version', 'date_added', 'date_modified', 'position', 'CollectorURL'];
    const displayFields = new Set(['title', 'text', 'info', 'background', 'tip_external', 'message']);
    const guideUrl = 'https://github.com/RESQUE-Framework/collector-app/blob/main/documentation/RESQUE-Pack-Guide.md#validator-rules';

    // Maturity of a pack, declared by its optional top-level "status" field.
    // Only problems in stable packs of active output types block the collector.
    const packStatuses = ['alpha', 'beta', 'stable'];

    // Shown next to the status badge in preview.html and packs.html.
    const statusNotes = {
        alpha: 'Alpha: in early development. Questions, conditions and points may be wrong and will change.',
        beta: 'Beta: complete, but still being tested. Points and wording may still change.'
    };

    // --- What a pack may contain ------------------------------------------

    const elementTypes = ['info', 'separator', 'text', 'textbox', 'number', 'date', 'radio', 'checkbox', 'dropdown', 'tabular_radio'];
    const choiceTypes = ['radio', 'checkbox', 'dropdown', 'tabular_radio'];
    const knownFields = {
        pack: ['prefix', 'version', 'date', 'title', 'elements', 'status', 'license', 'description', 'creators', 'recommendedCitation'],
        element: ['id', 'type', 'title', 'text', 'options', 'rows', 'condition', 'default', 'score', 'info', 'background',
            'tip_external', 'optional', 'validation', 'maxwords', 'alignment', 'style_classes', 'no_comment', 'onchange',
            'tooltip', 'eval_dimension', 'min_selected'],
        option: ['id', 'text', 'value', 'condition', 'explanation_required', 'tooltip', 'info'],
        row: ['id', 'title', 'text', 'tooltip', 'info'],
        score: ['condition', 'not_applicable', 'op', 'factor'],
        validation: ['pattern', 'condition', 'message']
    };
    // Accepted in packs, but neither the collector nor score2.js reads them.
    const ignoredFields = {
        'element.eval_dimension': 'is not read by the collector or the scorer.',
        'element.min_selected': 'is not enforced: a checkbox can still be left with fewer selections.',
        'option.explanation_required': 'is not enforced: no explanation is required when this option is chosen.',
        'option.condition': 'is not used by the scorer: the option earns its points regardless. Put scoring requirements into score.condition.',
        'score.op': 'is not used by the scorer.',
        'score.factor': 'is not used by the scorer: the points are not multiplied.'
    };
    // IDs in the core packs that predate the "<prefix>_" convention. They are
    // stored answer keys (RESQUER reads them), so they cannot be renamed.
    const legacyIds = {
        M: ['LastName', 'FirstName', 'YearPhD', 'AcademicAgeBonus', 'AcademicAgeBonus_Explanation', 'ORCID', 'RaterType',
            'ExternalRaterName', 'HonestyDisclaimer', 'METASEP0', 'MeritStatement', 'METASEP1', 'DateCreated', 'LastChange'],
        P: ['DOI', 'Title_Empty', 'DOI_Unavailable', 'Title', 'Year', 'Link', 'Title_Invalid', 'Title_Auto', 'Year_Auto',
            'Abstract_Auto', 'P5P6SEP', 'SEP_Suitable', 'P8P9SEP', 'P8P9bSEP', 'P9P10SEP', 'sep_before_data_open',
            'sep_before_correctness', 'OMSEP', 'P17P18SEP', 'P19P20SEP', 'P23P24SEP', 'MeritSEP', 'FinalSEP']
    };
    // Which output type a pack belongs to when no configuration says so.
    const formOfPrefix = prefix => ({ M: 'meta', S: 'software', D: 'data' })[prefix] ?? 'pub';

    // --- Rules -------------------------------------------------------------
    // Every result code with its usual severity and a hint how to fix it. The
    // guide (documentation/RESQUE-Pack-Guide.md, "Validator rules") lists the
    // same codes. `scope`: 'pack' = one pack file, 'form' = assembled form,
    // 'config' = configuration.
    const rules = {
        'invalid-json': { severity: 'error', scope: 'pack', hint: 'Fix the JSON syntax at the given line (a missing comma, quote or bracket is the usual cause).' },
        'pack-structure': { severity: 'error', scope: 'pack', hint: 'A pack is an object with "prefix", "version", "date", "title" and an "elements" list; each element is an object.' },
        'pack-metadata': { severity: 'warning', scope: 'pack', hint: 'Use a version like "1.0.0" and a date like "2026-11-18".' },
        'invalid-pack-status': { severity: 'error', scope: 'pack', hint: 'Use "alpha", "beta" or "stable", or remove the field.' },
        'unknown-field': { severity: 'warning', scope: 'pack', hint: 'Check the spelling; the app silently ignores unknown fields.' },
        'ignored-field': { severity: 'notice', scope: 'pack', hint: 'Remove the field or express the rule with fields the app supports.' },
        'missing-element-id': { severity: 'error', scope: 'pack', hint: 'Give every element, option and table row a string "id".' },
        'id-charset': { severity: 'error', scope: 'pack', hint: 'Use only letters, digits and underscores, so the ID works in conditions, JavaScript and R.' },
        'id-prefix': { severity: 'warning', scope: 'pack', hint: 'Start the ID with the pack prefix and an underscore (e.g. "EX_Protocol"), so it cannot collide with other packs.' },
        'duplicate-id': { severity: 'error', scope: 'pack', hint: 'Give each element a unique ID; two elements with the same ID share one answer.' },
        'duplicate-option-id': { severity: 'error', scope: 'pack', hint: 'Give each option (or row) of an element a unique ID.' },
        'unknown-element-type': { severity: 'error', scope: 'pack', hint: `Use one of: ${elementTypes.join(', ')}.` },
        'field-type': { severity: 'error', scope: 'pack', hint: 'Write conditions as strings (e.g. "false" instead of false) and lists as JSON arrays.' },
        'missing-options': { severity: 'error', scope: 'pack', hint: 'Choice elements need a non-empty "options" list; tables also need "rows".' },
        'option-value-type': { severity: 'error', scope: 'pack', hint: 'Points are JSON numbers of 0 or more, e.g. "value": 1 (not "1").' },
        'option-value-incomplete': { severity: 'error', scope: 'pack', hint: 'Give every option a "value" once one option has points, also 0 for options that earn none.' },
        'unscored-type-with-values': { severity: 'warning', scope: 'pack', hint: 'Only radio and checkbox elements are scored; use one of them or remove the values.' },
        'score-without-points': { severity: 'warning', scope: 'pack', hint: 'A "score" block only has an effect on radio/checkbox elements whose options have points.' },
        'expression-syntax': { severity: 'error', scope: 'pack', hint: 'Check brackets, quotes and operators; see the condition language in the guide.' },
        'array-comparison': { severity: 'error', scope: 'pack', hint: "Compare with a single value ($X !== 'Yes') or use the list shorthand (!($X =|= ['Yes', 'No']))." },
        'sugar-pitfall': { severity: 'warning', scope: 'pack', hint: 'Keep =|= lists simple: one field on the left, a non-empty list of quoted values without commas inside.' },
        'config-in-scoring': { severity: 'error', scope: 'pack', hint: 'The scorer cannot read config$ values; express the rule with answers ($...) or meta$ fields.' },
        'validation-pattern': { severity: 'error', scope: 'pack', hint: 'Write "pattern" as a valid JavaScript regular expression string (backslashes must be doubled in JSON).' },
        'missing-indicator-reference': { severity: 'error', scope: 'form', hint: 'Restore the referenced indicator in the configuration, include its pack, or update the reference. Excluded indicators do not count even if their default answers remain.' },
        'unknown-option-literal': { severity: 'error', scope: 'form', hint: 'Compare with one of the option IDs of the referenced element (IDs, not display texts; case matters).' },
        'generated-key-collision': { severity: 'error', scope: 'form', hint: 'Rename one of the IDs: checkbox options store "<id>_<optionID>", table rows "<id>_<rowID>", comments "<id>_Comment".' },
        'duplicate-source': { severity: 'error', scope: 'form', hint: 'List each pack only once under "sources" (packs/core-pubs.json and packs/core-pub.json are the same pack).' },
        'prefix-collision': { severity: 'error', scope: 'form', hint: 'Give each pack in an output type its own prefix; versions are recorded per prefix.' },
        // A notice: the core packs deliberately show the DOI field above the
        // "no DOI available" checkbox that hides it.
        'forward-reference': { severity: 'notice', scope: 'form', hint: 'Usually place an element after the indicators its condition depends on, so answers flow from top to bottom. Ignore this if the order is intended.' },
        'immature-pack': { severity: 'warning', scope: 'form', hint: 'Fine for testing. Before using the output type in production, fix the listed problems and mark the pack "stable".' },
        'invalid-preset': { severity: 'error', scope: 'config', hint: 'Use an indicator ID that is part of the form and one of its option IDs (a list for checkboxes).' },
        'selection-matches-nothing': { severity: 'warning', scope: 'config', hint: 'Check the spelling; include/exclude entries are ID prefixes of the selected packs.' },
        'include-ignored': { severity: 'warning', scope: 'config', hint: 'Remove "exclude" (also an empty one) when you want to use "include".' },
        'category-cue': { severity: 'warning', scope: 'config', hint: 'Each score category "cue" is a regular expression matched against indicator IDs.' }
    };

    // --- Pack status and provenance -----------------------------------------

    // An explicit status wins. Without one, a pack in packs/dev/ is alpha and
    // every other pack (including packs/archive/) is stable. An unknown value
    // counts as stable, the strictest choice, and validate() reports it.
    function packStatus(pack, source = '') {
        if (pack?.status !== undefined) {
            return packStatuses.includes(pack.status) ? pack.status : 'stable';
        }
        return /^(\.\/)?packs\/dev\//.test(source) ? 'alpha' : 'stable';
    }

    const invalidStatus = pack => pack.declaredStatus !== undefined && !packStatuses.includes(pack.declaredStatus);

    // Provenance of one pack in an assembled form, stored as `form.packs`.
    // `ids` lists every element of the pack file, also excluded ones, so the
    // validator can tell which pack a selected element came from.
    function packInfo(pack, source) {
        const info = {
            source, prefix: pack?.prefix, version: pack?.version,
            status: packStatus(pack, source),
            ids: (Array.isArray(pack?.elements) ? pack.elements : []).map(element => element?.id)
        };
        // Only a declared value is stored; absence means it was inferred.
        if (pack?.status !== undefined) info.declaredStatus = pack.status;
        return info;
    }

    // Pack files as loaded, keyed by source path. use() hands each fetched
    // file over, so the checks see the file as written: assembly shares the
    // element objects and presets change them. Not part of the forms/export.
    const files = new Map();

    function remember(source, pack, text) {
        files.set(normalizeSource(source), {
            text: typeof text === 'string' ? text : null,
            pack: typeof text === 'string' ? JSON.parse(text) : JSON.parse(JSON.stringify(pack))
        });
    }

    const normalizeSource = source => String(source ?? '').replace(/^\.\//, '');
    const isArchive = source => /^packs\/archive\//.test(normalizeSource(source));

    // Line (1-based) of an element ID in the file text, or null.
    function lineOf(text, id) {
        if (!text || typeof id !== 'string') return null;
        const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const match = new RegExp(`"id"\\s*:\\s*"${escaped}"`).exec(text);
        return match ? text.slice(0, match.index).split('\n').length : null;
    }

    // Parses a pack file; invalid JSON becomes an issue with a line number.
    function parsePackText(source, text) {
        try {
            return { pack: JSON.parse(text), issues: [] };
        } catch (error) {
            const position = /position (\d+)/.exec(error.message);
            const lineMatch = /line (\d+)/.exec(error.message);
            const line = lineMatch ? Number(lineMatch[1]) : position ? text.slice(0, Number(position[1])).split('\n').length : null;
            return {
                pack: null,
                issues: [issueOf('invalid-json', { pack: source, line, field: null, location: source, expression: error.message,
                    message: `The pack file "${source}" is not valid JSON: ${error.message}` })]
            };
        }
    }

    // --- Helpers -----------------------------------------------------------

    function issueOf(code, fields) {
        return {
            code, severity: rules[code].severity, form: null, indicator: null, field: null, location: null,
            expression: null, hint: rules[code].hint, ...fields
        };
    }

    // Closest known name within two edits, for "did you mean" messages.
    function suggestion(name, candidates) {
        const distance = (a, b) => {
            const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
            for (let j = 1; j <= b.length; j++) d[0][j] = j;
            for (let i = 1; i <= a.length; i++) {
                for (let j = 1; j <= b.length; j++) {
                    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
                }
            }
            return d[a.length][b.length];
        };
        const best = candidates.map(c => [c, distance(name.toLowerCase(), c.toLowerCase())]).sort((x, y) => x[1] - y[1])[0];
        return best && best[1] <= 2 ? ` Did you mean "${best[0]}"?` : '';
    }

    const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
    const validId = id => typeof id === 'string' && /^[A-Za-z0-9_]+$/.test(id);

    // All expression strings of an element: [path, text, kind]. kind is
    // 'condition', 'score' or 'highlight'. Highlight conditions come from
    // {condition|text} markup in display fields; {:A, B|text} is shorthand for
    // "$<id> =|= [A, B]", as in partialHighlight() in index.html.
    function expressionsOf(element) {
        const found = [];
        const add = (path, value, kind) => { if (typeof value === 'string' && value.trim()) found.push([path, value, kind]); };
        add('condition', element.condition, 'condition');
        if (isPlainObject(element.validation)) add('validation.condition', element.validation.condition, 'condition');
        if (isPlainObject(element.score)) {
            add('score.condition', element.score.condition, 'score');
            add('score.not_applicable', element.score.not_applicable, 'score');
        }
        // Older packs keep a "scoring" block; its strings are expressions too.
        (function visit(value, path) {
            if (typeof value === 'string') add(path, value, 'score');
            else if (Array.isArray(value)) value.forEach((v, i) => visit(v, `${path}[${i}]`));
            else if (isPlainObject(value)) for (const [k, v] of Object.entries(value)) visit(v, `${path}.${k}`);
        })(element.scoring, 'scoring');
        for (const [list, name] of [[element.options, 'options'], [element.rows, 'rows']]) {
            if (!Array.isArray(list)) continue;
            list.forEach((item, i) => { if (isPlainObject(item)) add(`${name}[${i}].condition`, item.condition, 'condition'); });
        }
        (function visitDisplay(value, path) {
            if (Array.isArray(value)) value.forEach((v, i) => visitDisplay(v, `${path}[${i}]`));
            else if (isPlainObject(value)) for (const [k, v] of Object.entries(value)) {
                if (k === 'condition' || k === 'not_applicable') continue;
                visitDisplay(v, path ? `${path}.${k}` : k);
            } else if (typeof value === 'string' && displayFields.has(path.split('.').pop().replace(/\[\d+\]$/, ''))) {
                for (const match of value.matchAll(/\{(.*?)\|(.*?)\}/g)) {
                    const condition = match[1].trim();
                    add(`${path} (highlight condition)`, condition.startsWith(':')
                        ? `$${element.id} =|= [${condition.slice(1)}]` : condition, 'highlight');
                }
            }
        })(element, '');
        return found;
    }

    // Checks one expression string on its own (no other elements needed).
    function expressionIssues(text, path, kind) {
        const issues = [];
        const add = (code, message, severity) => issues.push({ code, message, ...(severity ? { severity } : {}) });
        const expressions = globalThis.PackExpressions;
        if (!expressions) throw new Error('utils/expressions.js must be loaded before utils/pack-validator.js validates expressions.');
        if (kind === 'score' && /config\$/.test(text)) {
            add('config-in-scoring', 'The scorer (score2.js, also used by RESQUER) cannot resolve config$ references; this scoring rule fails or never applies.');
        }
        if (/=\|=\s*\[\s*\]/.test(text)) add('sugar-pitfall', 'An empty list after =|= expands to "()", which is not a valid expression.', 'error');
        if (/=&=/.test(text)) add('sugar-pitfall', 'The =&= shorthand compares one answer with every listed value at once, which is always false for two different values. For "all checkboxes selected" write $X_A && $X_B.');
        if (/[.\])\]][\w$]*\s*=[|&]=/.test(text)) add('sugar-pitfall', 'The left side of =|= / =&= must be a single field such as $Answer or meta$Field; anything else is expanded incorrectly.');
        for (const match of text.matchAll(/=[|&]=\s*\[(.*?)\]/g)) {
            // Quoted values in order; only their content may not contain commas.
            const values = [...match[1].matchAll(/'([^']*)'|"([^"]*)"/g)].map(m => m[1] ?? m[2]);
            if (values.some(value => value.includes(','))) add('sugar-pitfall', 'A value inside the =|= list contains a comma; the list is split at every comma, so the value is broken apart.');
        }
        const processed = expressions.preprocessCondition(text);
        if (/[!=]==?\s*\[|\]\s*[!=]==?/.test(processed)) {
            add('array-comparison', 'This compares an answer with a list ([...]). An answer is a single value, so the result depends on JavaScript type coercion: it only works by accident for one-element lists and is always true or false otherwise.');
        }
        if (!issues.some(issue => issue.severity === 'error' && issue.code === 'sugar-pitfall')) {
            try {
                // Compiles, but never runs, the expression as the collector would.
                new Function('context', 'exists', 'Alpine', `return (${expressions.insertValuesIntoCondition(processed)});`);
            } catch (error) {
                add('expression-syntax', `The ${path} is not a valid expression (${error.message}).`);
            }
        }
        return issues;
    }

    // --- Checks of one pack file --------------------------------------------

    // Returns issues about the file as written. Archived packs are frozen
    // history: only their JSON syntax is checked (by parsePackText).
    function lintPack(pack, { source = null, text = null } = {}) {
        if (isArchive(source)) return [];
        const issues = [];
        const add = (code, fields) => issues.push(issueOf(code, { pack: source, ...fields,
            line: fields.line ?? (fields.indicator ? lineOf(text, fields.indicator) : null) }));
        if (!isPlainObject(pack)) {
            add('pack-structure', { message: 'The pack must be a JSON object.' });
            return issues;
        }
        for (const field of Object.keys(pack)) {
            if (!knownFields.pack.includes(field)) add('unknown-field', { field, location: field,
                message: `Unknown top-level field "${field}".${suggestion(field, knownFields.pack)}` });
        }
        if (typeof pack.prefix !== 'string' || !/^[A-Za-z][A-Za-z0-9]*$/.test(pack.prefix)) {
            add('pack-structure', { field: 'prefix', location: 'prefix', expression: JSON.stringify(pack.prefix ?? null),
                message: 'The pack needs a "prefix" of letters and digits (e.g. "EX"); it identifies the pack in the recorded versions.' });
        }
        if (typeof pack.title !== 'string' || !pack.title.trim()) {
            add('pack-structure', { field: 'title', location: 'title', message: 'The pack needs a "title"; the first pack of an output type names the form.' });
        }
        if (typeof pack.version !== 'string' || !/^\d+(\.\d+){0,3}$/.test(pack.version)) {
            add('pack-metadata', { field: 'version', location: 'version', expression: JSON.stringify(pack.version ?? null),
                message: 'The "version" should be a string of numbers such as "1.0.0"; it is stored with every answer.' });
        }
        if (typeof pack.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(pack.date)) {
            add('pack-metadata', { field: 'date', location: 'date', expression: JSON.stringify(pack.date ?? null),
                message: 'The "date" should be written as YYYY-MM-DD.' });
        }
        if (pack.status !== undefined && !packStatuses.includes(pack.status)) {
            add('invalid-pack-status', { field: 'status', location: 'status', expression: `"status": ${JSON.stringify(pack.status)}`,
                message: `The pack declares the status ${JSON.stringify(pack.status)}. Use "alpha", "beta" or "stable"; until then the pack is treated as stable.` });
        }
        if (!Array.isArray(pack.elements)) {
            add('pack-structure', { field: 'elements', location: 'elements', message: 'The pack needs an "elements" list.' });
            return issues;
        }

        const seenIds = new Map();
        pack.elements.forEach((element, index) => {
            const at = `elements[${index}]`;
            if (!isPlainObject(element)) {
                add('pack-structure', { location: at, message: `Element ${index + 1} is not an object.` });
                return;
            }
            const id = element.id;
            const indicator = typeof id === 'string' ? id : null;
            const here = (field, fields = {}) => ({ indicator, field, location: field ? `${at}.${field}` : at, ...fields });
            if (typeof id !== 'string' || !id) {
                add('missing-element-id', here('id', { message: `Element ${index + 1} (type ${JSON.stringify(element.type ?? null)}) has no "id".` }));
            } else {
                if (!validId(id)) add('id-charset', here('id', { expression: id, message: `The ID "${id}" contains characters other than letters, digits and underscores.` }));
                if (seenIds.has(id)) add('duplicate-id', here('id', { expression: id, message: `The ID "${id}" is used by elements ${seenIds.get(id) + 1} and ${index + 1}; both would store their answer in the same field.` }));
                else seenIds.set(id, index);
                const prefix = typeof pack.prefix === 'string' ? pack.prefix : null;
                if (prefix && id !== prefix && !id.startsWith(`${prefix}_`) && !(legacyIds[prefix] ?? []).includes(id)) {
                    add('id-prefix', here('id', { expression: id, message: `The ID "${id}" does not start with the pack prefix "${prefix}_".` }));
                }
            }
            if (!elementTypes.includes(element.type)) {
                add('unknown-element-type', here('type', { expression: JSON.stringify(element.type ?? null),
                    message: `Unknown element type ${JSON.stringify(element.type ?? null)}.${typeof element.type === 'string' ? suggestion(element.type, elementTypes) : ''} The element is not shown.` }));
            }

            const checkFields = (object, kind, path) => {
                for (const field of Object.keys(object)) {
                    const fieldPath = path ? `${path}.${field}` : field;
                    if (!knownFields[kind].includes(field)) {
                        add('unknown-field', here(fieldPath, { message: `Unknown field "${field}"${kind === 'element' ? '' : ` in ${kind === 'option' ? 'an option' : kind === 'row' ? 'a table row' : `"${kind}"`}`}.${suggestion(field, knownFields[kind])}` }));
                    } else if (ignoredFields[`${kind}.${field}`]) {
                        add('ignored-field', here(fieldPath, { message: `"${field}" ${ignoredFields[`${kind}.${field}`]}` }));
                    }
                }
            };
            checkFields(element, 'element', '');
            if (element.score !== undefined) {
                if (isPlainObject(element.score)) checkFields(element.score, 'score', 'score');
                else add('field-type', here('score', { message: 'The "score" field must be an object with "condition" and/or "not_applicable".' }));
            }
            if (element.validation !== undefined) {
                if (!isPlainObject(element.validation)) {
                    add('field-type', here('validation', { message: 'The "validation" field must be an object with "pattern", "condition" and "message".' }));
                } else {
                    checkFields(element.validation, 'validation', 'validation');
                    const pattern = element.validation.pattern;
                    if (pattern !== undefined) {
                        try {
                            if (typeof pattern !== 'string') throw new Error('not a string');
                            new RegExp(pattern);
                        } catch (error) {
                            add('validation-pattern', here('validation.pattern', { expression: String(pattern), message: `The validation pattern is not a valid regular expression (${error.message}); the app fails when it checks the answer.` }));
                        }
                    }
                }
            }
            for (const field of ['condition']) {
                if (element[field] !== undefined && typeof element[field] !== 'string') {
                    add('field-type', here(field, { expression: JSON.stringify(element[field]), message: `"${field}" must be a string expression such as "true" or "$X === 'Yes'", not ${JSON.stringify(element[field])}.` }));
                }
            }
            if (isPlainObject(element.score)) for (const field of ['condition', 'not_applicable']) {
                if (element.score[field] !== undefined && typeof element.score[field] !== 'string') {
                    add('field-type', here(`score.${field}`, { expression: JSON.stringify(element.score[field]), message: `"score.${field}" must be a string expression, not ${JSON.stringify(element.score[field])}.` }));
                }
            }

            // Options, rows and points.
            const isChoice = choiceTypes.includes(element.type);
            const checkList = (list, name, kind) => {
                if (list === undefined) return [];
                if (!Array.isArray(list)) {
                    add('field-type', here(name, { message: `"${name}" must be a list.` }));
                    return [];
                }
                const ids = new Set();
                list.forEach((item, i) => {
                    const itemAt = `${name}[${i}]`;
                    if (!isPlainObject(item)) {
                        add('pack-structure', here(itemAt, { message: `${name}[${i}] is not an object.` }));
                        return;
                    }
                    checkFields(item, kind, itemAt);
                    if (typeof item.id !== 'string' || !item.id) {
                        add('missing-element-id', here(`${itemAt}.id`, { message: `${kind === 'row' ? 'Row' : 'Option'} ${i + 1} of "${indicator}" has no "id".` }));
                        return;
                    }
                    if (!validId(item.id)) add('id-charset', here(`${itemAt}.id`, { expression: item.id, message: `The ${kind} ID "${item.id}" contains characters other than letters, digits and underscores.` }));
                    if (ids.has(item.id)) add('duplicate-option-id', here(`${itemAt}.id`, { expression: item.id, message: `The ${kind} ID "${item.id}" occurs twice in "${indicator}".` }));
                    ids.add(item.id);
                    if (item.condition !== undefined && typeof item.condition !== 'string') {
                        add('field-type', here(`${itemAt}.condition`, { message: `"condition" of ${kind} "${item.id}" must be a string expression.` }));
                    }
                });
                return list.filter(isPlainObject);
            };
            const options = checkList(element.options, 'options', 'option');
            checkList(element.rows, 'rows', 'row');
            if (isChoice && options.length === 0) {
                add('missing-options', here('options', { message: `The ${element.type} element "${indicator}" has no options to choose from.` }));
            }
            if (element.type === 'tabular_radio' && !(Array.isArray(element.rows) && element.rows.length)) {
                add('missing-options', here('rows', { message: `The table "${indicator}" has no rows.` }));
            }
            options.forEach((option, i) => {
                if (option.value !== undefined && !(typeof option.value === 'number' && Number.isFinite(option.value) && option.value >= 0)) {
                    add('option-value-type', here(`options[${i}].value`, { expression: JSON.stringify(option.value),
                        message: `The value of option "${option.id}" is ${JSON.stringify(option.value)}; points must be a number of 0 or more. The scorer treats anything else as unreliable.` }));
                }
            });
            const valued = options.filter(option => option.value !== undefined);
            const points = options.some(option => typeof option.value === 'number' && option.value > 0);
            if (['radio', 'checkbox'].includes(element.type) && valued.length && valued.length < options.length) {
                add('option-value-incomplete', here('options', { expression: options.filter(o => o.value === undefined).map(o => o.id).join(', '),
                    message: `${valued.length} of ${options.length} options of "${indicator}" have a "value"; add one (0 if it earns no points) to: ${options.filter(o => o.value === undefined).map(o => o.id).join(', ')}.` }));
            }
            if (['dropdown', 'tabular_radio'].includes(element.type) && points) {
                add('unscored-type-with-values', here('options', { message: `"${indicator}" is a ${element.type}; its option values are never scored.` }));
            }
            if (isPlainObject(element.score) && !(['radio', 'checkbox'].includes(element.type) && points)) {
                add('score-without-points', here('score', { message: `"${indicator}" has a "score" block but ${['radio', 'checkbox'].includes(element.type) ? 'none of its options has points' : `a ${element.type} element earns no points`}, so it has no effect.` }));
            }

            // Expressions.
            for (const [path, text, kind] of expressionsOf(element)) {
                for (const problem of expressionIssues(text, path, kind)) {
                    add(problem.code, here(path, { expression: text, message: problem.message, ...(problem.severity ? { severity: problem.severity } : {}) }));
                }
            }
        });
        return issues;
    }

    // --- Checks of assembled forms -------------------------------------------

    // Answer keys each selected element stores, mapped to the element.
    function answerOwners(elements = [], type) {
        const owners = new Map(recordKeys.map(key => [key, null]));
        if (type === 'meta') owners.set('date_created', null);
        // DOI lookup supplies Abstract without a separate input indicator.
        if (type === 'pub') owners.set('Abstract', null);
        const collisions = [];
        const claim = (key, element, how) => {
            const owner = owners.get(key);
            if (!owners.has(key) || owner?.virtual) owners.set(key, { element, how });
            // null owners are built-in record fields such as "type".
            else if (owner && owner.element !== element) collisions.push({ key, first: owner, second: { element, how } });
        };
        for (const element of elements) {
            if (!element || typeof element.id !== 'string' || ['info', 'separator'].includes(element.type)) continue;
            if (element.type === 'checkbox') {
                for (const option of element.options || []) claim(`${element.id}_${option?.id}`, element, `option "${option?.id}" of checkbox ${element.id}`);
            } else if (element.type === 'tabular_radio') {
                for (const row of element.rows || []) claim(`${element.id}_${row?.id}`, element, `row "${row?.id}" of table ${element.id}`);
            } else {
                claim(element.id, element, `element ${element.id}`);
            }
            // Comment keys are always recognized as references; only real
            // comment fields can collide.
            if (element.no_comment) {
                if (!owners.has(`${element.id}_Comment`)) owners.set(`${element.id}_Comment`, { element, how: `comment of ${element.id}`, virtual: true });
            } else {
                claim(`${element.id}_Comment`, element, `comment of ${element.id}`);
            }
        }
        return { owners, collisions };
    }

    function validate(forms) {
        // Every configured output type is checked, including `active: false`
        // ones. Being active only decides whether a problem blocks. Metadata
        // and types without an active flag count as active.
        const isActive = type => forms.config?.[type]?.active !== false;
        // Defaults deliberately do not count: use() builds them before exclude/
        // include filtering, so they also contain answers for removed indicators.
        const analysis = Object.fromEntries(formTypes.map(type => [type, answerOwners(forms[type]?.elements, type)]));
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
        // do not depend on the pack status: `packBound` is false.
        function add(issue, pack, packBound = true) {
            const status = pack?.status ?? 'stable';
            const complete = issueOf(issue.code, issue);
            complete.pack = pack?.source ?? complete.pack ?? null;
            complete.packStatus = pack ? status : null;
            if (complete.line === undefined || complete.line === null) {
                complete.line = complete.indicator && pack ? lineOf(files.get(normalizeSource(pack.source))?.text, complete.indicator) : null;
            }
            complete.formActive = isActive(complete.form);
            complete.deferred = !complete.formActive ? 'inactive' : packBound && status !== 'stable' ? status : null;
            complete.blocking = complete.severity === 'error' && complete.deferred === null;
            issues.push(complete);
        }

        for (const type of formTypes) {
            const form = forms[type];
            if (!form) continue;
            const selected = new Set((form.elements || []).map(element => element?.id));
            const seenSources = new Map();

            // Pack files: each once per output type; element-level problems
            // only for selected elements (excluded ones are not used).
            for (const pack of form.packs ?? []) {
                const source = normalizeSource(pack.source);
                if (seenSources.has(source)) {
                    if (seenSources.get(source) === 1) {
                        add({ code: 'duplicate-source', form: type, field: 'sources', location: `config.${type}.sources`, expression: pack.source,
                            message: `The pack "${pack.source}" is loaded more than once for "${type}"; its indicators appear twice and count twice.` }, pack, false);
                    }
                    seenSources.set(source, seenSources.get(source) + 1);
                    continue;
                }
                seenSources.set(source, 1);
                if (invalidStatus(pack)) {
                    add({ code: 'invalid-pack-status', form: type, field: 'status', location: `${pack.source}: status`,
                        expression: `"status": ${JSON.stringify(pack.declaredStatus)}`,
                        message: `The pack "${pack.source}" declares the status ${JSON.stringify(pack.declaredStatus)}. Use "alpha", "beta" or "stable"; until then the pack is treated as stable.` }, pack);
                }
                const file = files.get(source);
                if (!file) continue;
                for (const issue of lintPack(file.pack, { source: pack.source, text: file.text })) {
                    if (issue.code === 'invalid-pack-status') continue;
                    if (issue.indicator && !selected.has(issue.indicator)) continue;
                    add({ ...issue, form: type }, pack);
                }
            }

            // Two different packs with one prefix overwrite each other's version.
            const byPrefix = new Map();
            for (const pack of form.packs ?? []) {
                const source = normalizeSource(pack.source);
                const other = byPrefix.get(pack.prefix);
                if (other && other !== source) {
                    add({ code: 'prefix-collision', form: type, field: 'prefix', location: `${pack.source}: prefix`, expression: pack.prefix,
                        message: `The packs "${other}" and "${pack.source}" both use the prefix "${pack.prefix}"; only one version is recorded with each answer.` }, pack, false);
                } else byPrefix.set(pack.prefix, source);
            }

            // The same ID from two packs (or a pack loaded twice).
            const idCount = new Map();
            for (const element of form.elements || []) {
                if (typeof element?.id === 'string') idCount.set(element.id, (idCount.get(element.id) ?? 0) + 1);
            }
            for (const [id, count] of idCount) {
                if (count < 2) continue;
                const packsWithId = (form.packs ?? []).filter(pack => (pack.ids ?? []).includes(id));
                if (new Set(packsWithId.map(pack => normalizeSource(pack.source))).size < 2) continue; // reported as duplicate-source or in the file
                add({ code: 'duplicate-id', form: type, indicator: id, field: 'id', location: `${type}: ${id}`, expression: id,
                    message: `"${id}" is defined in ${packsWithId.map(pack => `"${pack.source}"`).join(' and ')}; both elements store their answer in the same field.` },
                    // Attributed to the pack that adds the second definition.
                    packsWithId[packsWithId.length - 1]);
            }

            for (const collision of analysis[type].collisions) {
                const element = collision.second.element;
                add({ code: 'generated-key-collision', form: type, indicator: element.id, field: 'id', location: `${type}: ${collision.key}`, expression: collision.key,
                    message: `The answer key "${collision.key}" is used twice: by the ${collision.first.how} and by the ${collision.second.how}. Both answers would be stored in the same field.` }, origins[type].get(element.id));
            }
        }

        // Configuration presets are resolved during assembly (menu.js). Invalid
        // ones are skipped there and reported here, for every configured type.
        for (const type of formTypes) {
            for (const issue of forms[type]?.presetIssues ?? []) {
                add({
                    code: 'invalid-preset', form: type, indicator: issue.indicator, field: 'preset',
                    location: `config.${type}.preset.${issue.indicator}`,
                    expression: `${issue.indicator}: ${JSON.stringify(issue.value)}`,
                    message: issue.message
                }, origins[type].get(issue.indicator), false);
            }
        }

        // References: missing indicators, option literals, forward references.
        const elementById = Object.fromEntries(formTypes.map(type => [type,
            new Map((forms[type]?.elements || []).filter(e => typeof e?.id === 'string').map(e => [e.id, e]))]));
        const positionOf = Object.fromEntries(formTypes.map(type => [type,
            new Map((forms[type]?.elements || []).map((e, i) => [e?.id, i]))]));
        for (const form of formTypes) {
            for (const [index, element] of (forms[form]?.elements || []).entries()) {
                if (!isPlainObject(element)) continue;
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
                        if (analysis[targetForm].owners.has(key)) continue;
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

                // Comparisons with option IDs that do not exist.
                for (const [path, text, kind] of expressionsOf(element)) {
                    const compared = [];
                    for (const m of text.matchAll(/(meta\$|(?<!\w)\$)(\w+)\s*(?:===|!==|==|!=)\s*(['"])(.*?)\3/g)) compared.push([m[1], m[2], [m[4]], m[0]]);
                    for (const m of text.matchAll(/(meta\$|(?<!\w)\$)(\w+)\s*=[|&]=\s*\[(.*?)\]/g)) {
                        compared.push([m[1], m[2], [...m[3].matchAll(/(['"])(.*?)\1/g)].map(v => v[2]), m[0]]);
                    }
                    for (const [namespace, key, literals, written] of compared) {
                        const targetForm = namespace === 'meta$' ? 'meta' : form;
                        const owner = analysis[targetForm].owners.get(key);
                        const target = owner?.element;
                        if (!target || owner.virtual || key.endsWith('_Comment')) continue;
                        if (target.type === 'checkbox') {
                            add({ code: 'unknown-option-literal', ...(kind === 'highlight' ? { severity: 'warning' } : {}), form, indicator: element.id, field: path, location: `${form}.elements[${index}].${path}`, expression: text,
                                message: `"${written}" compares a checkbox answer with text, but checkbox options store true/false. Write ${namespace}${key} (selected) or !${namespace}${key} (not selected).` }, pack);
                            continue;
                        }
                        if (!['radio', 'dropdown', 'tabular_radio'].includes(target.type) || !Array.isArray(target.options)) continue;
                        const optionIds = target.options.map(option => option?.id);
                        for (const literal of literals.filter(value => !optionIds.includes(value))) {
                            const close = optionIds.find(id => typeof id === 'string' && id.toLowerCase() === literal.toLowerCase());
                            // Highlight conditions only change how text is shown.
                            add({ code: 'unknown-option-literal', ...(kind === 'highlight' ? { severity: 'warning' } : {}), form, indicator: element.id, field: path, location: `${form}.elements[${index}].${path}`, expression: text,
                                message: `"${literal}" is not an option ID of ${target.id} (options: ${optionIds.join(', ')}), so "${written}" never matches.${close ? ` Did you mean "${close}"?` : ''}` }, pack);
                        }
                    }
                }

                // Visibility that depends on a later element (#14).
                if (typeof element.condition === 'string') {
                    const later = new Set();
                    for (const match of element.condition.matchAll(/(?<![\w$])\$(\w+)/g)) {
                        const owner = analysis[form].owners.get(match[1]);
                        if (!owner?.element || owner.element === element) continue;
                        if ((positionOf[form].get(owner.element.id) ?? -1) > index) later.add(owner.element.id);
                    }
                    for (const id of later) {
                        add({ code: 'forward-reference', form, indicator: element.id, field: 'condition', location: `${form}.elements[${index}].condition`, expression: element.condition,
                            message: `The visibility of ${element.id} depends on ${id}, which comes later in the form.` }, pack);
                    }
                }
            }
        }

        // Configuration: include/exclude entries and score categories.
        for (const type of formTypes) {
            const section = forms.config?.[type];
            const form = forms[type];
            if (!section || !form) continue;
            const allIds = (form.packs ?? []).flatMap(pack => pack.ids ?? []);
            const knownIds = allIds.length ? allIds : (form.elements || []).map(e => e?.id);
            if (Array.isArray(section.exclude) && Array.isArray(section.include) && section.include.length) {
                add({ code: 'include-ignored', form: type, field: 'include', location: `config.${type}.include`, expression: JSON.stringify(section.include),
                    message: `"${type}" has both "include" and "exclude"; "exclude" wins (even when empty), so "include" is ignored.` }, null, false);
            }
            for (const list of ['include', 'exclude']) {
                if (!Array.isArray(section[list])) continue;
                for (const entry of section[list]) {
                    if (typeof entry === 'string' && knownIds.some(id => typeof id === 'string' && id.startsWith(entry))) continue;
                    add({ code: 'selection-matches-nothing', form: type, field: list, location: `config.${type}.${list}`, expression: JSON.stringify(entry),
                        message: `The ${list} entry ${JSON.stringify(entry)} matches no indicator of "${type}", so it has no effect.${typeof entry === 'string' ? suggestion(entry, knownIds.filter(id => typeof id === 'string')) : ''}` }, null, false);
                }
            }
            const categories = form.config?.score_categories;
            if (!Array.isArray(categories) || !categories.length) continue;
            const scored = (form.elements || []).filter(e => ['radio', 'checkbox'].includes(e?.type) && Array.isArray(e.options) &&
                e.options.some(o => typeof o?.value === 'number' && o.value > 0) && !e.hidden);
            const matchers = [];
            categories.forEach((category, i) => {
                const location = `config.${type}.config.score_categories[${i}].cue`;
                let cue;
                try {
                    if (typeof category?.cue !== 'string' || !category.cue) throw new Error('missing');
                    cue = new RegExp(category.cue);
                } catch (error) {
                    add({ code: 'category-cue', severity: 'error', form: type, field: 'score_categories', location, expression: JSON.stringify(category?.cue ?? null),
                        message: `The score category "${category?.title ?? i + 1}" has no valid "cue" (${error.message}); the scorer fails.` }, null, false);
                    return;
                }
                matchers.push(cue);
                if (!scored.some(e => cue.test(e.id))) {
                    add({ code: 'category-cue', form: type, field: 'score_categories', location, expression: category.cue,
                        message: `The score category "${category.title}" (cue ${JSON.stringify(category.cue)}) matches no scored indicator, so it always shows 0 of 0 points.` }, null, false);
                }
            });
            for (const element of scored) {
                if (matchers.some(cue => cue.test(element.id))) continue;
                add({ code: 'category-cue', form: type, indicator: element.id, field: 'score_categories', location: `config.${type}.config.score_categories`, expression: element.id,
                    message: `The scored indicator ${element.id} belongs to no score category: its points count toward the total but appear in no chart category.` }, origins[type].get(element.id), false);
            }
        }

        // An active output type built from an alpha/beta pack gets one current
        // warning, so its known problems are not overlooked although they do
        // not block. Inactive types need no such notice.
        for (const form of formTypes) {
            if (!isActive(form)) continue;
            const reported = new Set();
            for (const pack of forms[form]?.packs ?? []) {
                if (pack.status === 'stable' || reported.has(normalizeSource(pack.source))) continue;
                reported.add(normalizeSource(pack.source));
                const known = issues.filter(issue => issue.form === form && issue.pack === pack.source && issue.severity !== 'notice');
                const errors = known.filter(issue => issue.severity === 'error').length;
                const warnings = known.length - errors;
                add({
                    code: 'immature-pack', form, field: 'status', location: `${pack.source}: status`,
                    expression: pack.declaredStatus === undefined
                        ? `${pack.source} (in packs/dev/, no "status" field)` : `"status": "${pack.status}"`,
                    message: `The "${form}" output type is active and uses the ${pack.status} pack "${pack.source}" (${errors} error${errors === 1 ? '' : 's'}, ${warnings} warning${warnings === 1 ? '' : 's'}; listed under "Not blocking"). It is still in development: conditions, points and wording may be wrong or change.`
                }, pack, false);
            }
        }

        return report(issues, indicatorsChecked);
    }

    // Groups issues: `current` and `deferred` hold errors and warnings,
    // `notices` the informational results (never blocking, never counted).
    function report(issues, indicatorsChecked = 0) {
        const order = list => [
            ...list.filter(issue => issue.severity === 'error'),
            ...list.filter(issue => issue.severity === 'warning')
        ];
        const notices = issues.filter(issue => issue.severity === 'notice');
        const current = order(issues.filter(issue => issue.deferred === null));
        const deferred = order(issues.filter(issue => issue.deferred !== null));
        const all = [...current, ...deferred, ...notices];
        return {
            issues: all,
            errors: all.filter(issue => issue.severity === 'error'),
            warnings: all.filter(issue => issue.severity === 'warning'),
            // Current errors: these open the modal on startup.
            blocking: current.filter(issue => issue.blocking),
            current, deferred, notices, indicatorsChecked
        };
    }

    // Validates pack files outside a configuration (command line, validator
    // page). `checked` files are reported; `companions` (e.g. core-meta and
    // core-pub for an expansion pack) only supply the indicators they refer to.
    // Both are [{ source, text }]. Every output type counts as active.
    function checkPackFiles(checked, companions = []) {
        const checkedSources = new Set(checked.map(file => normalizeSource(file.source)));
        // A file that is checked is not also loaded as its own companion.
        const helpers = companions.filter(file => !checkedSources.has(normalizeSource(file.source)));
        const fileIssues = [];
        const forms = { config: {} };
        for (const [role, list] of [['companion', helpers], ['checked', checked]]) {
            for (const { source, text } of list) {
                const { pack, issues } = parsePackText(source, text);
                if (role === 'checked') fileIssues.push(...issues);
                if (!pack) continue;
                if (!isPlainObject(pack) || !Array.isArray(pack.elements)) {
                    // Nothing to assemble; report the structure problem itself.
                    if (role === 'checked') fileIssues.push(...lintPack(pack, { source, text }));
                    continue;
                }
                remember(source, pack, text);
                const type = formOfPrefix(pack.prefix);
                forms[type] = forms[type] ?? { title: pack.title, elements: [], packs: [] };
                forms[type].elements.push(...pack.elements.filter(isPlainObject));
                forms[type].packs.push(packInfo(pack, source));
                forms.config[type] = { active: true };
            }
        }
        const result = validate(forms);
        const relevant = result.issues.filter(issue => checkedSources.has(normalizeSource(issue.pack)));
        const own = fileIssues.map(issue => ({ ...issue, packStatus: null, formActive: true, deferred: null, blocking: issue.severity === 'error' }));
        return report([...own, ...relevant], result.indicatorsChecked);
    }

    return {
        validate, lintPack, checkPackFiles, parsePackText, remember, lineOf,
        packStatus, packInfo, packStatuses, statusNotes, rules, formOfPrefix, legacyIds, guideUrl,
        forget: () => files.clear()
    };
})();
