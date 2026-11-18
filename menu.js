function pickAccordingToConfig(packPre, config) {    
    if (config.exclude) {
        return pickExclude(packPre, ...config.exclude);
    } else if (config.include) {
        return pick(packPre, ...config.include);
    } else {
        return pick(packPre);
    }
}

// A preset answers an indicator from the configuration instead of asking the
// respondent: the configured value replaces the pack default and the element is
// marked `hidden`, so it is never rendered but stays part of the selected form.
// References such as `meta$RaterType` therefore keep resolving, and the answer
// is still exported. Hiding is always the consequence of answering - there is no
// way to hide an indicator without giving it a value, so a hidden indicator can
// never be undefined. Presets match indicator IDs exactly; `include`/`exclude`
// match ID prefixes.
const PRESET_UNANSWERABLE_TYPES = ['info', 'separator'];
const PRESET_OPTION_TYPES = ['radio', 'dropdown', 'tabular_radio'];

// Returns a message describing why this value cannot be preset, or null.
function presetValueIssue(element, value) {
    if (PRESET_UNANSWERABLE_TYPES.includes(element.type)) {
        return `"${element.id}" is of type "${element.type}" and stores no answer, so it cannot be preset.`;
    }

    const optionIds = (element.options ?? []).map(option => option.id);

    if (element.type === 'checkbox') {
        if (!Array.isArray(value)) {
            return `The preset for the checkbox "${element.id}" must be a list of option IDs (use [] to preselect nothing).`;
        }

        const unknown = value.filter(id => !optionIds.includes(id));

        return unknown.length
            ? `The preset for "${element.id}" names unknown option ID(s): ${unknown.join(', ')}. Available: ${optionIds.join(', ')}.`
            : null;
    }

    if (Array.isArray(value) || (value !== null && typeof value === 'object')) {
        return `The preset for "${element.id}" must be a single value, not a list or mapping.`;
    }

    if (PRESET_OPTION_TYPES.includes(element.type) && !optionIds.includes(value)) {
        return `The preset for "${element.id}" (${JSON.stringify(value)}) is not one of its option IDs: ${optionIds.join(', ')}.`;
    }

    return null;
}

// Applies `typeConfig.preset` to an already selected pack. Valid presets are
// applied in place; invalid ones are skipped and collected in `presetIssues`,
// which `PackValidator` reports in the collector. Collecting instead of throwing
// keeps a mistyped configuration from blocking the whole form.
function applyPresets(pack, typeConfig) {
    const presets = typeConfig?.preset ?? {};

    pack.presets = {};
    pack.presetValues = {};
    pack.presetIssues = [];
    pack.defaultValues = pack.defaultValues ?? {};
    pack.initialValues = pack.initialValues ?? {};

    for (const [id, value] of Object.entries(presets)) {
        const element = pack.elements.find(candidate => candidate.id === id);

        if (!element) {
            const excluded = (typeConfig.exclude ?? []).some(prefix => id.startsWith(prefix));
            const notIncluded = !typeConfig.exclude && (typeConfig.include ?? []).length > 0;

            pack.presetIssues.push({
                indicator: id,
                value,
                message: excluded
                    ? `"${id}" is preset but also removed by "exclude". A preset keeps the indicator in the form; remove it from "exclude" instead.`
                    : notIncluded
                        ? `"${id}" is preset but not selected by "include". Add it to "include" or remove the preset.`
                        : `"${id}" is preset but none of the configured sources for this output type defines it.`
            });
            continue;
        }

        const issue = presetValueIssue(element, value);

        if (issue) {
            pack.presetIssues.push({ indicator: id, value, message: issue });
            continue;
        }

        element.default = value;
        element.hidden = true;

        // getDefaultValues() expands checkbox/table answers into their generated
        // keys, so presets reach storage, export, and scoring like any answer.
        // A preset is an answer, not a hint: it also goes into initialValues, so
        // a preset on a text/number/date element is not blanked out like a pack
        // default on the same element would be.
        const answers = getDefaultValues([element]);

        Object.assign(pack.defaultValues, answers);
        Object.assign(pack.initialValues, answers);
        Object.assign(pack.presetValues, answers);
        pack.presets[id] = value;
    }

    return pack;
}

function normalizePublicationSource(source) {
    return source === "packs/core-pubs.json"
        ? "packs/core-pub.json"
        : source;
}

function normalizePublicationConfig(config) {
    if (config.pub === undefined && config.pubs !== undefined) {
        config.pub = config.pubs;
    }

    if (Array.isArray(config.pub?.sources)) {
        config.pub.sources = config.pub.sources.map(normalizePublicationSource);
    }

    return config;
}

// --- Reading the configuration file -----------------------------------------
// An unreadable config.yaml must never leave a blank page. parseConfigFile()
// turns the file text into a configuration or throws a ConfigFileError that the
// collector (index.html) and the preview (preview.html) can show to the user.
// Syntax is checked by the bundled js-yaml (js/js-yaml.min.js); the structure
// check covers only what menu() and use() rely on to start at all - it is not a
// schema for every setting.
const CONFIG_SECTIONS = ['meta', 'pub', 'data', 'software'];

class ConfigFileError extends Error {
    // kind: 'syntax' (YAML cannot be parsed) or 'structure' (parsed, but unusable).
    // line/column are 1-based; snippet is js-yaml's excerpt of the offending lines.
    constructor({ file, kind, reason, line = null, column = null, snippet = '', issues = [] }) {
        super(line
            ? `${file}: ${reason} (line ${line}, column ${column})`
            : `${file}: ${reason}`);
        this.name = 'ConfigFileError';
        Object.assign(this, { file, kind, reason, line, column, snippet, issues });
    }
}

const isMapping = value => value !== null && typeof value === 'object' && !Array.isArray(value);

const describeYamlValue = value => value === null || value === undefined
    ? 'nothing'
    : Array.isArray(value) ? 'a list' : `a single value (${JSON.stringify(value)})`;

// Returns a list of messages, empty when the parsed configuration can be used.
function configStructureIssues(config) {
    if (!isMapping(config)) {
        return [`The file must consist of "setting: value" lines, but it contains ${describeYamlValue(config)}.`];
    }

    const issues = [];

    for (const section of CONFIG_SECTIONS) {
        const typeConfig = section === 'pub' ? config.pub ?? config.pubs : config[section];

        if (typeConfig === undefined) {
            issues.push(`The section "${section}:" is missing.`);
            continue;
        }

        if (!isMapping(typeConfig)) {
            issues.push(`The section "${section}:" must contain indented settings (such as "sources:"), but it contains ${describeYamlValue(typeConfig)}.`);
            continue;
        }

        const sources = typeConfig.sources;

        if (!Array.isArray(sources) || sources.length === 0) {
            issues.push(`"${section}: sources:" must be a list of pack files, e.g. ["packs/core-${section}.json"].`);
        } else if (sources.some(source => typeof source !== 'string' || source.trim() === '')) {
            issues.push(`"${section}: sources:" may only contain pack file paths.`);
        }

        for (const key of ['include', 'exclude']) {
            const value = typeConfig[key];

            if (value !== undefined && value !== null && !Array.isArray(value)) {
                issues.push(`"${section}: ${key}:" must be a list of indicator IDs, e.g. ["P_Data"].`);
            }
        }

        for (const key of ['config', 'preset']) {
            const value = typeConfig[key];

            if (value !== undefined && value !== null && !isMapping(value)) {
                issues.push(`"${section}: ${key}:" must contain indented "name: value" settings, but it contains ${describeYamlValue(value)}.`);
            }
        }
    }

    return issues;
}

// --- Unpaired quotation marks ----------------------------------------------
// js-yaml accepts most unpaired quotes without an error: a missing closing "
// swallows the following lines into the string (silently deleting those
// settings), and a missing opening " leaves a stray " in the value. This
// line-based check runs before js-yaml and reports the actual line. It follows
// YAML's rule that a quote only opens a string at the start of a value or flow
// item; inside an unquoted value a " is literal, so only an odd number of them
// is reported. Single-quoted values are not inspected for ", which keeps
// 'RESQUE 2"' available for a literal quotation mark. Multi-line quoted strings
// are reported as well: configuration values are written on one line.
const QUOTE_MESSAGES = {
    unclosedDouble: 'A quotation mark (") opens this value but is not closed on the same line. Add the closing " at the end of the value.',
    unclosedSingle: "A single quotation mark (') opens this value but is not closed on the same line. Add the closing ' at the end of the value.",
    unopenedDouble: 'This value ends with a quotation mark (") that was never opened. Add the opening " at the start of the value, or remove the stray ".',
    oddDouble: "This value contains a quotation mark (\") without a partner. Put the whole value in quotes or remove the stray \"; to keep a literal \", wrap the value in single quotes, e.g. 'RESQUE 2\"'.",
    commentValue: 'This value starts with # and is therefore read as a comment, so the setting is empty. It ends with a quotation mark ("), so the opening " is probably missing, e.g. "#ffffff".'
};

// Scans one scalar starting at `start`; returns { end } or { issue, column }.
function scanQuotedOrPlain(value, start, inFlow) {
    const first = value[start];

    if (first === '"') {
        for (let j = start + 1; j < value.length; j++) {
            if (value[j] === '\\') { j++; continue; }
            if (value[j] === '"') return { end: j + 1 };
        }
        return { issue: 'unclosedDouble', column: start };
    }

    if (first === "'") {
        for (let j = start + 1; j < value.length; j++) {
            if (value[j] === "'") {
                if (value[j + 1] === "'") { j++; continue; }
                return { end: j + 1 };
            }
        }
        return { issue: 'unclosedSingle', column: start };
    }

    const quotes = [];
    let end = start;

    for (; end < value.length; end++) {
        const c = value[end];
        if (c === '#' && /\s/.test(value[end - 1] ?? ' ')) break;
        if (inFlow && (c === ',' || c === ']' || c === '}')) break;
        if (c === '"') quotes.push(end);
    }

    if (quotes.length % 2 === 1) {
        const last = quotes[quotes.length - 1];
        const endsWithQuote = value.slice(start, end).trimEnd().endsWith('"');
        return { issue: endsWithQuote && quotes.length === 1 ? 'unopenedDouble' : 'oddDouble', column: last };
    }

    return { end };
}

// Returns { issue, column } for the value text of one line, or null.
function valueQuoteIssue(value) {
    let i = value.search(/\S/);

    if (i < 0) return null;

    if (value[i] === '#') {
        // `key: #ffffff"` - the value became a comment.
        return /^#[^\s"]*"\s*$/.test(value.slice(i)) ? { issue: 'commentValue', column: value.lastIndexOf('"') } : null;
    }

    if (value[i] === '[' || value[i] === '{') {
        let depth = 0;

        while (i < value.length) {
            const c = value[i];

            if (c === '[' || c === '{') { depth++; i++; continue; }
            if (c === ']' || c === '}') { depth--; i++; if (depth === 0) return null; continue; }
            if (c === ',' || c === ':' || /\s/.test(c)) { i++; continue; }
            if (c === '#' && /\s/.test(value[i - 1])) return null;

            const result = scanQuotedOrPlain(value, i, true);
            if (result.issue) return result;
            i = Math.max(result.end, i + 1);
        }

        return null;
    }

    // Anchors, aliases and tags are not used in the configuration; skip them.
    if ('&*!'.includes(value[i])) return null;

    const result = scanQuotedOrPlain(value, i, false);
    return result.issue ? result : null;
}

// Excerpt in the format js-yaml uses for its own errors (line/column 1-based).
function configSnippet(text, line, column) {
    const lines = text.split(/\r?\n/);
    const from = Math.max(1, line - 2);
    const to = Math.min(lines.length, line + 2);
    const width = String(to).length;
    const out = [];

    for (let n = from; n <= to; n++) {
        const prefix = ` ${String(n).padStart(width)} | `;
        out.push(prefix + lines[n - 1].replace(/\t/g, '→'));
        if (n === line) out.push('-'.repeat(prefix.length + column - 1) + '^');
    }

    return out.join('\n');
}

// Returns [{ line, column, reason }] (1-based) for all unpaired quotes.
function configQuoteIssues(text) {
    const issues = [];
    const lines = text.split(/\r?\n/);
    let blockIndent = null;

    lines.forEach((raw, index) => {
        const indent = raw.search(/\S/);

        // Lines of a `|` or `>` block scalar are literal text.
        if (blockIndent !== null) {
            if (indent < 0 || indent > blockIndent) return;
            blockIndent = null;
        }

        if (indent < 0 || raw[indent] === '#' || /^(---|\.\.\.)(\s|$)/.test(raw.slice(indent))) return;

        // `key: value`, `- key: value`, or `- value`; other lines (continuations
        // of multi-line values, items of multi-line lists) are not inspected.
        const match = /^(\s*(?:-\s+)*)((?:"(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^\s#'"\-[\]{},][^#]*?|-[^\s#][^#]*?)\s*:)(?:\s+|$)/.exec(raw)
            ?? /^(\s*(?:-\s+)+)()/.exec(raw);

        if (!match) return;

        const valueStart = match[0].length;
        const value = raw.slice(valueStart);

        if (/^[|>][-+0-9]*\s*(#.*)?$/.test(value)) {
            // Its body is everything indented deeper than this line.
            blockIndent = indent;
            return;
        }

        const found = valueQuoteIssue(value);

        if (found) {
            issues.push({ line: index + 1, column: valueStart + found.column + 1, reason: QUOTE_MESSAGES[found.issue] });
        }
    });

    return issues;
}

function parseConfigFile(text, file = 'config/config.yaml') {
    let config;

    const quoteIssues = configQuoteIssues(text);

    if (quoteIssues.length) {
        const [first] = quoteIssues;

        throw new ConfigFileError({
            file,
            kind: 'syntax',
            reason: first.reason,
            line: first.line,
            column: first.column,
            snippet: configSnippet(text, first.line, first.column),
            issues: quoteIssues.length > 1
                ? quoteIssues.map(issue => `Line ${issue.line}, column ${issue.column}: ${issue.reason}`)
                : []
        });
    }

    try {
        // js-yaml also rejects tabs in indentation and duplicated keys.
        config = jsyaml.load(text, { filename: file });
    } catch (error) {
        if (error?.name !== 'YAMLException') {
            throw error;
        }

        throw new ConfigFileError({
            file,
            kind: 'syntax',
            reason: error.reason ?? error.message,
            line: error.mark ? error.mark.line + 1 : null,
            column: error.mark ? error.mark.column + 1 : null,
            snippet: error.mark?.snippet ?? ''
        });
    }

    if (config === undefined || config === null) {
        throw new ConfigFileError({ file, kind: 'structure', reason: 'The file is empty.', issues: ['The file is empty or contains only comments.'] });
    }

    const issues = configStructureIssues(config);

    if (issues.length) {
        throw new ConfigFileError({ file, kind: 'structure', reason: 'The file is valid YAML but cannot be used as a configuration.', issues });
    }

    return normalizePublicationConfig(config);
}

async function menu(config) {
    normalizePublicationConfig(config);

    const metaConfig = { ...config.meta.config };

    const metaPre = await use(metaConfig, ...config.meta.sources);

    const pubConfig = { ...config.pub.config };

    const pubPre = await use(pubConfig, ...config.pub.sources);

    const softwareConfig = { ...config.software.config };

    const softwarePre = await use(softwareConfig, ...config.software.sources);

    const dataConfig = { ...config.data.config };

    const dataPre = await use(dataConfig, ...config.data.sources);

    // Presets are applied after include/exclude, so they can only answer
    // indicators that are actually part of the selected form.
    const select = (packPre, typeConfig) =>
        applyPresets(pickAccordingToConfig(packPre, typeConfig), typeConfig);

    return {
        meta: select(metaPre, config.meta),

        pub: select(pubPre, config.pub),

        software: select(softwarePre, config.software),

        data: select(dataPre, config.data)
    }
}