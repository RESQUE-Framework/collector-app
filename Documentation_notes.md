Note: these are initial, quite unstructured notes. They will be structured and expanded in the future.

## How to create a new (expansion) pack

- Decide for a unique prefix that has not been used in any other existing pack
- Make sure that every indicator id starts with this prefix of the pack!
- The indicator id must have this format: `<Prefix>_<IndicatorNamePascalCase>`
  - Subcategories are separated by an underscore: `<Prefix>_<IndicatorNamePascalCase>_<SubcategoryNamePascalCase>`
- Make sure that subcategories do not have the same name like a multiple choice (checkbox) option of a parent indicator - this will break the analysis!
  - For example, you have the indicator `X_GoodPractice`
- An EP is only shown in  `/preview.html` if you add it to `packs/info.json` (see the self-explanatory syntax there).

## How scoring works

- "condition": When the condition is met, the maximum of the possible values of the indicator is added to the maximum of the POMP score, and the actual value is added to the actual POMP score - except when the `not_applicable` condition is also met (see below).
- "not_applicable": When this condition is met, the indicator is not applicable. Then it is removed from the maximum POMP score and ignored in the score computation.
- "value": The score that is added to the actual POMP score when the condition is met. Every response option needs a value - even if the option leads to "not applicable" (set to 0 in this case).
- "op": TODO
- "explanation_required": TODO: I guess then the follow-up indicator must be in the format `P_Data_Open_AccessLevel` --> `P_Data_Open_AccessLevel_ZK2Explanation`?

## How to (de)select indicators


```yaml
meta:
  sources: ["packs/core-meta.json"]
  exclude: ["LastName"]
  config:
    min_indicators_warning_threshold: 0

pubs:
  sources: ["packs/core-pubs.json"]
  include: ["DOI"]
  config:
    min_indicators_warning_threshold: 0
```

`sources` includes the packs that should be combined. E.g. if there are extension packs, we could do something like:

```yaml
pubs:
  sources: ["packs/core-pubs.json", "packs/extensions/clinical-psych-pubs.json"]
```

The elements from that 'pack' would be included (hopefully, we should test this) in our final 'pubs form.

If `exclude` is provided, we exclude the indicators with the ids from the list. We include everything else per default.

If `include` is provided, we include the indicators with the ids from the list. We exclude everything else per default.

If `exclude` and `include` both do not exist, we pick everything.


### Examples:

```yaml
pubs:
  sources: ["packs/core-pubs.json", "packs/extensions/clin-pubs.json"]
  include: ["DOI", "CP_Hello"]
  config:
    min_indicators_warning_threshold: 0
```



## `<template>` in index.html

Under `<template>`, only **one** root element is allowed. If you want to return multiple elements, you can wrap them in a `<div>` or `<span>`.