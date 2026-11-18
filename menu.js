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

function parseConfigFile(text, file = 'config/config.yaml') {
    let config;

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