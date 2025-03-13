export const getDefaultValues = elements => {
    let defaultValues = {};

    for(const element of elements) {
        if (element.default
            || element.rows?.some(row => row.default)
        ) {
            switch (element.type) {
                case 'checkbox':
                    element.default.forEach((optionId) => {
                        defaultValues[element.id + '_' + optionId] = true;
                    })
                    break;
                case 'tabular_radio':
                    element.rows.forEach((row) => {
                        defaultValues[element.id + '_' + row.id] = element.default || '';
                    });

                    element.rows.forEach((row) => {
                        if (row.default) {
                            defaultValues[element.id + '_' + row.id] = row.default;
                        }
                    });
                    break;
                default:
                    defaultValues[element.id] = element.default;
            }                   
        } else {
            // Define default values
            switch (element.type) {
                case 'separator':
                case 'info':
                    // No default values needed
                    break;
                case 'text':
                case 'textbox':
                case 'number':
                case 'date':
                case 'dropdown':
                case 'radio':
                    defaultValues[element.id] = '';
                    break;
                case 'checkbox':
                    element.options.forEach((option) => {
                        defaultValues[element.id + '_' + option.id] = false;
                    });
                    break;
                case 'tabular_radio':
                    element.rows.forEach((row) => {
                        defaultValues[element.id + '_' + row.id] = '';
                    });
                    break;
                default:
                    defaultValues[element.id] = '';
            }
        }
    }

    return defaultValues;
}
