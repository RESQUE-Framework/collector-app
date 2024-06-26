async function menu() {
    return {
        config: {
            max: 10,
            maxTopPapers: 3,
            minROWarningThreshold: 5,
        },

        meta: pick(await use({
            minIndicatorsWarningThreshold: 0
        }, "core-meta")),

        pub: pick(await use({
            minIndicatorsWarningThreshold: 5
        }, "core-pubs")),

        software: pick(await use({
            minIndicatorsWarningThreshold: 0
        }, "core-software")),

        data: pick(await use({
            minIndicatorsWarningThreshold: 5
        }, "core-data"))
    }
}