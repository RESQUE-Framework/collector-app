// Loading and selecting packs: use() fetches and combines the packs listed in a
// configuration section, the pick functions apply include/exclude (menu.js).
// Shared by the collector (index.html), the stand-alone validator page
// (validator.html) and the command-line validator (scripts/validate-packs.cjs).
// Needs normalizePublicationSource (menu.js), getDefaultValues/getInitialValues
// (utils/packutils.js) and PackValidator (utils/pack-validator.js) at call time.

async function use(config, ...packs) {

    const pool = [];

    const sources = packs.map(normalizePublicationSource);

    const ps = await Promise.all(sources.map(async source => {
        const response = await fetch("./" + source);

        // Shown on the startup error panel; a 404 page is not JSON and
        // would otherwise surface as an unhelpful parse error.
        if (!response.ok) {
            throw new Error(`The pack file "${source}" listed under "sources:" in the configuration could not be loaded (HTTP ${response.status}).`);
        }

        // Parsed here instead of response.json(): the validator keeps the
        // text for line numbers, and invalid JSON gets a readable message.
        const text = await response.text();
        let pack;
        try {
            pack = JSON.parse(text);
        } catch (error) {
            throw new Error(`The pack file "${source}" is not valid JSON (${error.message}).`);
        }
        PackValidator.remember(source, pack, text);
        return pack;
    }));

    ps.forEach(p => pool.push(...p.elements));

    let versions = {};

    ps.forEach(pack => versions[pack.prefix] = pack.version);

    let date = {};

    ps.forEach(pack => date[pack.prefix] = pack.date);

    let defaultValues = {}

    ps.forEach(pack => Object.assign(defaultValues, getDefaultValues(pack.elements)));

    // What a new record starts with. Differs from defaultValues only for
    // controls that show their default as a placeholder hint instead.
    let initialValues = {}

    ps.forEach(pack => Object.assign(initialValues, getInitialValues(pack.elements)));

    return {
        title: ps[0].title,
        versions,
        date,
        defaultValues,
        initialValues,
        // Source, prefix, version and status of every pack (see
        // utils/pack-validator.js); exported along with the form.
        packs: ps.map((pack, i) => PackValidator.packInfo(pack, sources[i])),
        pool,
        config
    };
}

function pick(combinedPack, ...ids) {
    return pickByCondition(combinedPack, item => ids.length === 0 || ids.some(id => item.id.startsWith(id)));
}

function pickByPrefix(combinedPack, prefix) {
    return {
        title: combinedPack.title,
        versions: combinedPack.versions,
        date: combinedPack.date,
        defaultValues: combinedPack.defaultValues,
        initialValues: combinedPack.initialValues,
        packs: combinedPack.packs,
        config: combinedPack.config,
        elements: combinedPack.pool.filter(item => item.id.startsWith(prefix))
    };
}

function pickByCondition(combinedPack, condition) {
    return {
        title: combinedPack.title,
        versions: combinedPack.versions,
        date: combinedPack.date,
        defaultValues: combinedPack.defaultValues,
        initialValues: combinedPack.initialValues,
        packs: combinedPack.packs,
        config: combinedPack.config,
        elements: combinedPack.pool.filter(item => condition(item))
    };
}

function pickExclude(combinedPack, ...ids) {
    return pickByCondition(combinedPack, item => !ids.some(id => item.id.startsWith(id)));
}
