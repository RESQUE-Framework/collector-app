Note: these are initial, quite unstructured notes. They will be structured and expanded in the future.

### <template>

Under `<template>`, only **one** root element is allowed. If you want to return multiple elements, you can wrap them in a `<div>` or `<span>`.

### How to create a new (expansion) pack

- Decide for a unique prefix that has not been used in any other existing pack
- Make sure that every indicator id starts with this prefix of the pack!
- The indicator id must have this format: `<Prefix>_<IndicatorNamePascalCase>`
  - Subcategories are separated by an underscore: `<Prefix>_<IndicatorNamePascalCase>_<SubcategoryNamePascalCase>`

### How scoring works

- "condition": When the condition is met, the maximum of the possible values of the indicator is added to the maximum of the POMP score, and the actual value is added to the actual POMP score - except when the `not_applicable` condition is also met (see below).
- "not_applicable": When this condition is met, the indicator is not applicable. Then it is removed from the maximum POMP score and ignored in the score computation.
- "op": TODO
- "explanation_required": TODO: I guess then the follow-up indicator must be in the format `P_Data_Open_AccessLevel` --> `P_Data_Open_AccessLevel_ZK2Explanation`?

