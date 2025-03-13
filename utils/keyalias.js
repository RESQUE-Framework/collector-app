export const renameOldKeys = (obj) => {
    const aliases = {
        // Pubs
        "P_CoG_ParcipantSample": "P_Sample_CoG",
        "P_Stimuli_Relevance": "P_Stimuli",
        "P_Stimuli_Relevance_NAexplanation": "P_Stimuli_NAexplanation",
        "P_CoG_StimulusSample": "P_Stimuli_CoG",
        "P_PreregisteredReplication": "P_Preregistration_Replication",
        "P_PreregisteredReplication_NAExplanation": "P_Preregistration_Replication_NAExplanation"
    };

    return Object.keys(obj).reduce((acc, key) => {
        // Change the key if it is in the aliases
        const newKey = aliases[key] || key;
        acc[newKey] = obj[key];
        return acc;
    }, {});
};