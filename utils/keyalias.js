export const renameOldKeys = (obj) => {
    const aliases = {
        // Pubs
        "P_Sample_Type": "P_Sample",
        "P_Sample_Type_Other": "P_Sample_Other",
        "P_Sample_Type_RareOther": "P_Sample_RareOther",
        "P_CoG_ParcipantSample": "P_Sample_CoG",
        "P_Stimuli_Relevance": "P_Stimuli",
        "P_Stimuli_Relevance_NAexplanation": "P_Stimuli_NAExplanation",
        "P_Sample_RepresentativenessRelevance_NAexplanation": "P_Sample_RepresentativenessRelevance_NAExplanation",
        "P_Sample_CrossCultural_NAexplanation": "P_Sample_CrossCultural_NAExplanation",
        "P_Stimuli_NAexplanation": "P_Stimuli_NAExplanation",
        "P_Stimuli_Representative_NAexplanation": "P_Stimuli_Representative_NAExplanation",
        "P_CoG_StimulusSample": "P_Stimuli_CoG",
        "P_PreregisteredReplication": "P_Preregistration_Replication",
        "P_PreregisteredReplication_NAExplanation": "P_Preregistration_Replication_NAExplanation",
        "P_TypeMethod_Simulation": "P_TypeMethod_Computational"
    };

    return Object.keys(obj).reduce((acc, key) => {
        // Change the key if it is in the aliases
        const newKey = aliases[key] || key;
        acc[newKey] = obj[key];
        return acc;
    }, {});
};