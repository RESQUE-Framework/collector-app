async function menu() {
    return {
        config: {            
            main_title: "RESQUE",
            background_color: "#ffffff",
            max: 10, // max number of publications that the committee expects
            maxTopPapers: 3,  // How many papers can be selected as "best papers"
            minROWarningThreshold: 0,
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