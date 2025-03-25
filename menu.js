async function menu() {
    return {
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