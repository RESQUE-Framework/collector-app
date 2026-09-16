function pickAccordingToConfig(packPre, config) {    
    if (config.exclude) {
        return pickExclude(packPre, ...config.exclude);
    } else if (config.include) {
        return pick(packPre, ...config.include);
    } else {
        return pick(packPre);
    }
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

    return {
        meta: pickAccordingToConfig(metaPre, config.meta),

        pub: pickAccordingToConfig(pubPre, config.pub),

        software: pickAccordingToConfig(softwarePre, config.software),

        data: pickAccordingToConfig(dataPre, config.data)
    }
}