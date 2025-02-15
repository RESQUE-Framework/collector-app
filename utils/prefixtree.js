const idDepth = id => (id.match(/_/g) || []).length;

const isParent = (idParent, idChild) => {
    if (idDepth(idChild) - idDepth(idParent) !== 1) {
        return false;
    }
    const childPrefix = idChild.substring(0, idChild.lastIndexOf('_'));
    return childPrefix === idParent;
}

const hasCommonParent = (id1, id2) => id1.substring(0, id1.lastIndexOf('_')) === id2.substring(0, id2.lastIndexOf('_'));

const getIndentations = idList => {
    let listPath = [];
    let result = [];
    let currentList = result;
    for (let i = 0; i < idList.length; i++) {
        if (i - 1 >= 0 && isParent(idList[i - 1], idList[i])) {
            if (currentList[0] !== idList[i]) {
                listPath.push(currentList);
                let subList = [];
                currentList.push(subList);
                currentList = subList;
                currentList.push(idList[i]);
            }
        } else if ((i - 1 >= 0 && hasCommonParent(idList[i - 1], idList[i]))) {
            currentList.push(idList[i])
        } else {
            while (listPath.length > 0) {
                currentList = listPath.pop();
                if (hasCommonParent(idList[i], currentList[0]))
                    break;
            }
            currentList.push(idList[i]);
        }
    }
    return result;
}

function getDepths(indicators) {
    const result = {};

    console.log(indicators);

    const indentedList = getIndentations(indicators.map(i => i.id));

    function traverse(list, depth) {
        for (const item of list) {
            if (typeof item === 'string') {
                result[item] = depth;
            } else if (Array.isArray(item)) {
                traverse(item, depth + 1);
            }
        }
    }

    traverse(indentedList, 0);
    return result;
}