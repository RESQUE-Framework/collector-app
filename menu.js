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
    const metaConfig = {
        min_indicators_warning_threshold: config.meta.config.min_indicators_warning_threshold
    }

    const metaPre = await use(metaConfig, ...config.meta.sources);

    const pubConfig = {
        min_indicators_warning_threshold: config.pubs.config.min_indicators_warning_threshold
    }

    const pubPre = await use(pubConfig, ...config.pubs.sources);

    const softwareConfig = {
        min_indicators_warning_threshold: config.software.config.min_indicators_warning_threshold
    }

    const softwarePre = await use(softwareConfig, ...config.software.sources);

    const dataConfig = {
        min_indicators_warning_threshold: config.data.config.min_indicators_warning_threshold
    }

    const dataPre = await use(dataConfig, ...config.data.sources);

    return {
        meta: pickAccordingToConfig(metaPre, config.meta),

        pub: pickAccordingToConfig(pubPre, config.pubs),

        software: pickAccordingToConfig(softwarePre, config.software),

        data: pickAccordingToConfig(dataPre, config.data)
    }
}