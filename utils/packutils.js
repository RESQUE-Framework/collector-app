export const getDefaultValues = elements => {
    const defaultValues = {};
    const hasDefault = obj =>
        Object.prototype.hasOwnProperty.call(obj, 'default');

    for (const element of elements) {
        switch (element.type) {
            case 'separator':
            case 'info':
                break;

            case 'checkbox': {
                const selected = hasDefault(element) ? element.default : [];

                if (!Array.isArray(selected)) {
                    throw new TypeError(
                        `${element.id}: checkbox default must be an array`
                    );
                }

                const optionIds = new Set(element.options.map(o => o.id));

                for (const id of selected) {
                    if (!optionIds.has(id)) {
                        throw new Error(
                            `${element.id}: unknown default option "${id}"`
                        );
                    }
                }

                const selectedIds = new Set(selected);

                for (const option of element.options) {
                    defaultValues[`${element.id}_${option.id}`] =
                        selectedIds.has(option.id);
                }
                break;
            }

            case 'tabular_radio': {
                const fallback = hasDefault(element) ? element.default : '';

                for (const row of element.rows) {
                    defaultValues[`${element.id}_${row.id}`] =
                        hasDefault(row) ? row.default : fallback;
                }
                break;
            }

            default:
                defaultValues[element.id] =
                    hasDefault(element) ? element.default : '';
        }
    }

    return defaultValues;
};
