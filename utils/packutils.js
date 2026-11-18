// A blank answer is one that carries no information: a key that is missing from
// the record, or an empty value. `0` and `false` are answers, not blanks - a
// number field answered with 0 must never be treated as unanswered.
export const isBlankAnswer = value =>
    value === undefined || value === null || value === '';

// The effective value of a blank answer is the element's default. Returns a new
// record; the stored one is never mutated, so filling in defaults for an export
// cannot write values back into the form the respondent is looking at.
// Answers that are present win over defaults, and keys that have no default (or
// whose default is itself blank) are left untouched.
export const withDefaults = (record, defaultValues) => {
    const filled = { ...record };

    for (const [key, value] of Object.entries(defaultValues ?? {})) {
        if (isBlankAnswer(filled[key]) && !isBlankAnswer(value)) {
            filled[key] = value;
        }
    }

    return filled;
};

// Controls that can show their default as a greyed-out placeholder. For these,
// the default is a hint, not an answer: the field starts empty so the respondent
// can see that they have not answered yet, and the default is substituted when
// the record is exported (see withDefaults). Every other control - radio,
// dropdown, checkbox, table - has no placeholder, so its default has to be a
// real preselection. The contenteditable `textbox` is not in this list: its
// placeholder attribute has no stylesheet rule behind it and renders nothing.
export const HINTED_TYPES = ['text', 'number', 'date'];

// The answers a newly created record starts with: the defaults, except that
// hinted controls start blank. An element answered by a configuration preset is
// marked `hidden` and has no field to show a hint in, so it keeps its value.
export const getInitialValues = elements => {
    const initialValues = getDefaultValues(elements);

    for (const element of elements) {
        if (HINTED_TYPES.includes(element.type) && !element.hidden) {
            initialValues[element.id] = '';
        }
    }

    return initialValues;
};

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
