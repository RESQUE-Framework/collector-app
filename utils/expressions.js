// Condition shorthand shared by the collector (index.html, which evaluates the
// result with eval() in evaluateConditionInContext) and the pack validator
// (utils/pack-validator.js, which only compiles it, never runs it).
// utils/score2.js keeps its own copy because RESQUER runs that file on its own;
// keep both in step (config$ is resolved here only, not by the scorer).

// Expands `$X =|= [a, b]` (equals any) and `$X =&= [a, b]` (equals all).
function preprocessCondition(condition) {
    let processedCondition = condition
        .replaceAll(/([\$\w]+)\s*=\|=\s*\[(.*?)\]/g, (match, variable, list) => {
            return "(" + list.split(",")
                .map(value => `${variable} === ${value.trim()}`)
                .join(" || ") + ")";
        })
        .replaceAll(/([\$\w]+)\s*=&=\s*\[(.*?)\]/g, (match, variable, list) => {
            return "(" + list.split(",")
                .map(value => `${variable} === ${value.trim()}`)
                .join(" && ") + ")";
        })

    return processedCondition;
}

// Turns $X, meta$X and config$a.b into lookups in the collector stores.
function insertValuesIntoCondition(condition) {
    return condition
        .replaceAll(/meta\$([a-zA-Z0-9_]+)/g, `Alpine.store('data').input[0]['$1']`)
        .replaceAll(/config\$([a-zA-Z0-9_.]+)/g, (match, keySequence) => {
            const keys = keySequence.split('.');
            return `Alpine.store('config').config['${keys.join("']['")}']`;
        })
        .replaceAll(/\$(\w*)/g, `context['$1']`);
}

globalThis.PackExpressions = { preprocessCondition, insertValuesIntoCondition };
