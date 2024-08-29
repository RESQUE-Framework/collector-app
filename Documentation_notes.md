Note: these are initial, quite unstructured notes. They will be structured and expanded in the future.

### <template>

Under `<template>`, only **one** root element is allowed. If you want to return multiple elements, you can wrap them in a `<div>` or `<span>`.

### How to create a new (expansion) pack

- Decide for a unique prefix that has not been used in any other existing pack
- Make sure that every indicator id starts with this prefix of the pack!
- The indicator id must have this format: `<Prefix>_<IndicatorNamePascalCase>`
  - Subcategories are separated by an underscore: `<Prefix>_<IndicatorNamePascalCase>_<SubcategoryNamePascalCase>`