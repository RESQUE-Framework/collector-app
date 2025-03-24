export const generateScoringRules = (items) => {
    let rules = {};

    items.forEach(item => {
        if (!item.score) return;

        let rule = {
            not_applicable: item.score.not_applicable,
        };

        if (item.type === 'radio') {
            rule.op = 'select';
            rule.max = Math.max(...item.options.map(v => v.value));

            rule.points = item.options.map(option => {
                let condition = `($${item.id} === '${option.id}')`
                    + (item.score.condition ? ` && (${item.score.condition})` : '');

                if (option.explanation_required) {
                    condition += ` && exists($${item.id}_${option.id}Explanation)`;
                }

                return {
                    value: option.value,
                    condition
                }
            })
        }

        if (item.type === 'checkbox') {
            rule.op = 'sum';
            rule.max = item.options.reduce((acc, option) => acc + option.value, 0);

            rule.points = item.options.map(option => {
                let condition = `$${item.id}_${option.id}`
                    + (item.score.condition ? ` && (${item.score.condition})` : '');

                if (option.explanation_required) {
                    condition += ` && exists(${item.id}_${option.id}Explanation)`;
                }

                return {
                    value: option.value,
                    condition
                }
            })
        }

        rules[item.id] = rule;

    });

    return rules;
}

export const score = r => {
    const scoring = Alpine.store('forms')[r.type].scoring;

    if (scoring === undefined) {
        return {};
    }

    if (!Object.keys(scoring).length) {
        return {};
    }

    let maxScore = 0;
    let reachedScore = 0;

    let itemScores = {};

    for (const indicator in scoring) {
        if (indicator === 'post') {
            // skip post
            continue;
        }
        if (scoring[indicator].not_applicable && evaluateConditionInContext(scoring[indicator].not_applicable, r)) {
            continue;
        }

        let itemMaxScore = scoring[indicator].max;
        let itemScore = 0;

        switch (scoring[indicator].op) {
            case "sum":
                itemScore = scoring[indicator].points
                    .filter(p => evaluateConditionInContext(p.condition, r))
                    .reduce((sum, next) => sum + next.value, 0);
                break;
            case "select":
                itemScore = (scoring[indicator].points.find(p => evaluateConditionInContext(p.condition, r)) || { value: 0 }).value;
                break;
            default:
                break;
        }

        maxScore += itemMaxScore;
        reachedScore += itemScore;

        itemScores[indicator] = {
            max: itemMaxScore,
            score: itemScore
        }
    }

    if (scoring.post) {
        scoring.post.forEach(transformation => {
            if (evaluateConditionInContext(transformation.condition, r)) {
                console.log(transformation.factor)
                reachedScore *= transformation.factor;
            }
        })
    }

    const categories = [
        {
            title: "Theorizing & Formal Modeling",
            cue: "Theorizing"
        },
        {
            title: "Open Data",
            cue: "Data"
        },
        {
            title: "Open Materials",
            cue: "OpenMaterials"
        },
        {
            title: "Preregistration",
            cue: "Prereg"
        },
        {
            title: "Reproducible Code & Verification",
            cue: "ReproducibleScripts|IndependentVerification"
        }
    ]

    const categoryScores = categories.map(category => {
        const categoryIndicators = Object.keys(itemScores).filter(indicator => new RegExp(category.cue).test(indicator));
        const categoryMax = categoryIndicators.map(indicator => itemScores[indicator].max).reduce((sum, current) => sum + current, 0);
        const categoryScore = categoryIndicators.map(indicator => itemScores[indicator].score).reduce((sum, current) => sum + current, 0);

        return {
            title: category.title,
            max: categoryMax,
            score: categoryScore
        }
    });

    return {
        max: maxScore,
        score: reachedScore,
        relative: reachedScore / maxScore,
        percentage: ((reachedScore / maxScore) * 100).toFixed(1),
        items: itemScores,
        categories: categoryScores
    }
}

export const scoreAll = rs => {
    const scores = rs.map(r => score(r));

    const validScores = scores.filter(s => Object.keys(s).length && s.max > 0)

    const relative = validScores
        .map(s => s.relative)
        .reduce((sum, current) => sum + current, 0) / validScores.length

    const overallCategoryScores = validScores
        .map(s => s.categories)
        .reduce((sum, current) => {
            current.forEach(category => {
                const existingCategory = sum.find(c => c.title === category.title);

                if (existingCategory) {
                    existingCategory.max += category.max;
                    existingCategory.score += category.score;
                } else {
                    sum.push({ ...category });
                }
            });

            return sum;
        }, []);

    return {
        scores,
        overall: {
            relative,
            percentage: (relative * 100).toFixed(1),
            categories: overallCategoryScores
        }
    };
}