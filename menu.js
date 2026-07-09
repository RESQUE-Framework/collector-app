function pickAccordingToConfig(packPre, config) {    
    if (config.exclude) {
        return pickExclude(packPre, ...config.exclude);
    } else if (config.include) {
        return pick(packPre, ...config.include);
    } else {
        return pick(packPre);
    }
}

async function menu(config) {
    const metaConfig = { ...config.meta.config };

    const metaPre = await use(metaConfig, ...config.meta.sources);

    const pubConfig = { ...config.pubs.config };

    const pubPre = await use(pubConfig, ...config.pubs.sources);

    const softwareConfig = { ...config.software.config };

    const softwarePre = await use(softwareConfig, ...config.software.sources);

    const dataConfig = { ...config.data.config };

    const dataPre = await use(dataConfig, ...config.data.sources);

    return {
        meta: pickAccordingToConfig(metaPre, config.meta),

        pub: pickAccordingToConfig(pubPre, config.pubs),

        software: pickAccordingToConfig(softwarePre, config.software),

        data: pickAccordingToConfig(dataPre, config.data)
    }
}