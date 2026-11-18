# How RESQUE Collector packs work

An author’s guide to pack structure, conditions, defaults, and scoring.

Reviewed against the uploaded repository on **2026-09-16**. Source links below refer to this checkout, not an older pinned GitHub commit. See the [current findings overview](RESQUE-Pack-Findings.md) for confirmed fixes, open defects, and policy decisions.


## 1. The essential distinction

A pack is a JSON description of a questionnaire. It contains an ordered list of elements: questions, explanatory text, and separators. The app renders those elements, stores the answers, and calculates scores from selected options.

Three fields have different jobs:

| Field                     | Question it answers                        | Effect in the current implementation                                                                                        |
| ------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Element-level `condition` | Should this element be shown?              | Controls visibility, required-field checks, and parts of export. It does **not** directly control scoring.                  |
| `score.condition`         | May this item earn points?                 | For the shipped scoring definitions, a false condition gives zero earned points while retaining the item’s possible points. |
| `score.not_applicable`    | Should this item be excluded from scoring? | A true expression removes both its earned and possible points.                                                              |

Consequently, **hidden**, **unanswered**, **zero points**, and **not applicable** are different states. 

- *Hiding* an element does not clear its stored answer. Why? If users choose to unhide a section, they should not lose all of their entered answers of the conditional items
- An *unanswered* scored item normally contributes zero earned points and its full maximum, unless a `not_applicable` rule excludes it.


## 2. What is in `/packs`?

| File or directory | Role |
| --- | --- |
| `core-pub.json` | Main publication questionnaire: 99 elements, including 12 scored elements. Prefix `P`, version `0.9.0`. |
| `core-meta.json` | Applicant/rater information shared by the research outputs. Prefix `M`, version `0.3.0`. |
| `core-software.json` | Research software questionnaire. Prefix `S`, version `0.2`, status `alpha`; some scoring fields are not implemented by `score2.js`. |
| `core-data.json` | A minimal data-set pack with one text field. Prefix `D`, version `0.0.1`, status `alpha`; no points. |
| `user.json` | Example custom questions. Prefix `U`, version `0.1.0`. |
| `EP/EP-clinical_psychology.json` | Publication extension, prefix `CP`, version `0.2.1`; 16 elements, including 5 scored elements. |
| `EP/EP-theory_development.json` | Publication extension, prefix `TH`, version `5.0.0`; 34 elements: 25 scored checkboxes, 4 filter questions, 1 explanation, 1 information element, and 3 separators. |
| `dev/` | Development packs for epistemic goals, multidisciplinarity, practical relevance, and stimuli. Without a `status` field they count as `alpha`. |
| `archive/` | Historical definitions. Some use an older, incompatible scoring structure. |
| `info.json` | A catalog for pack discovery/preview; it is an array, not a questionnaire pack. |

The default configuration enables publications. Data and software are configured but have `active: false`. Expansion packs are not automatically loaded because they exist in `EP/` or appear in `info.json`: add them to a configuration section’s `sources` list.

Sources: [default configuration](../config/config-default.yaml), [pack catalog](../packs/info.json).

## 3. Pack and element structure

A small illustrative pack looks like this:

```json
{
  "prefix": "EX",
  "version": "1.0.0",
  "date": "2026-09-16",
  "title": "Example publication extension",
  "elements": [
    {
      "id": "EX_OpenProtocol",
      "type": "radio",
      "title": "Is the protocol publicly available?",
      "options": [
        { "id": "No", "text": "No", "value": 0 },
        { "id": "Yes", "text": "Yes", "value": 1 }
      ],
      "condition": "$P_Suitable === 'Yes'",
      "score": {
        "not_applicable": "$P_Suitable === 'No'",
        "condition": "exists($EX_OpenProtocol_Identifier)"
      }
    },
    {
      "id": "EX_OpenProtocol_Identifier",
      "type": "text",
      "title": "Protocol DOI or URL",
      "condition": "$P_Suitable === 'Yes' && $EX_OpenProtocol === 'Yes'"
    }
  ]
}
```

This extension assumes the publication core is loaded alongside it. “Yes” can earn one point, but only once the identifier contains a truthy value. “No”, an unanswered question, or a missing identifier produces zero out of one. If `P_Suitable` is `No`, the item is excluded altogether.

### Pack metadata

`prefix` identifies the pack in the assembled version/date maps; it does not automatically prefix question IDs or create a separate answer namespace. Authors must choose distinct IDs themselves. `version`, `date`, and `title` describe the pack. Expansion packs may also contain `license`, `description`, `creators`, and `recommendedCitation`; these describe provenance and do not define scoring.

The optional `status` declares how mature a pack is: `"alpha"` (early development; questions, conditions and points may be wrong), `"beta"` (complete, still being tested) or `"stable"`. It changes neither the questionnaire nor scoring. It decides whether the [browser pack validation](#browser-pack-validation) treats the pack's problems as blocking, and `preview.html` and `packs.html` show an *alpha*/*beta* badge with a short note (also in the exported manual). Without the field, a pack in `packs/dev/` is `alpha` and every other pack is `stable`, including `packs/archive/`. Any other value is reported as an `invalid-pack-status` error and the pack is treated as stable. `core-software.json` and `core-data.json` are currently `alpha`. Set `"status": "stable"` (or remove the field outside `packs/dev/`) only when the validator reports no errors for the pack.

The order of `elements` is the display order. IDs such as `P_Data_Open_AccessLevel` also support visual indentation through `utils/prefixtree.js`. That helper examines neighboring IDs and underscore-separated relationships. Indentation does not create a logical dependency: each child must have its own condition.

### Common element fields

| Field | Purpose |
| --- | --- |
| `id` | Stable key used in answers, conditions, and scoring. |
| `type` | Selects the renderer and answer representation. |
| `title` | Question or heading text. |
| `text` | Body content for an `info` element. |
| `options` | Choices with stable `id`, display `text`, and optionally numeric `value`. |
| `rows` | Row definitions for `tabular_radio`. |
| `condition` | Expression controlling the element’s visibility. |
| `default` | Initial answer or selection, interpreted by element type. |
| `score` | Item-level applicability and point-earning rules. |
| `info`, `background`, `tip_external` | Context shown in the information panel. |
| `optional` | Excludes the element from the required-field completion check. It does not affect scoring. |
| `validation` | `pattern`, optional expression `condition`, and warning `message`. This is a UI warning, not a scoring gate. |
| `maxwords` | Displays a word count and an over-limit warning for a textbox. It does not truncate the answer. |
| `alignment`, `style_classes`, `no_comment` | Presentation and comment controls. |

Pack text is trusted content: the app renders HTML and evaluates expressions. Choice `text` supports Markdown through `renderOptionText()`. Other text fields follow their own HTML/interpolation path; do not assume every string is passed through a Markdown converter.

Some fields present in packs have no current enforcement. In particular, `min_selected` does not enforce a checkbox minimum, and `explanation_required` does not itself require an explanation. The scorer does not use `score.op`, `score.factor`, or option-level `condition`. Express required scoring checks explicitly in supported item-level rules.

## 4. How answers are stored

The collected data is an array. The first entry is metadata; later entries are individual research outputs:

```js
[
  { type: "meta", RaterType: "Applicant", forms: /* assembled definitions */ },
  { type: "pub", DOI: "...", P_Data: "Yes", P_Data_Source_NewOwn: true },
  { type: "software", S_License: "MIT" }
]
```

The publication configuration section, stored `type`, and assembled form key are all **`pub`**. The current publication filename is **`packs/core-pub.json`**. The other form keys are `meta`, `data`, and `software`. The prefix `P` and existing publication answer IDs are unchanged; the configuration rename is not an answer-key migration.

### Publication naming and legacy compatibility

| Surface | Use for new configurations/data | Compatibility in this checkout |
| --- | --- | --- |
| YAML publication section | `pub:` | `pubs:` is used only when `pub` is undefined; an existing `pub` section wins. |
| Current publication source | `packs/core-pub.json` | The exact legacy string `packs/core-pubs.json` is mapped to the current filename by the collector. |
| Output and assembled form | `type: "pub"`, `forms.pub` | These already used `pub`; no stored-record type rename is required. |
| UI expression / per-type query override | `config$pub.active`, `pub:min_indicators_warning_threshold=4` | The normalizer does not rewrite legacy expression strings or `pubs:` query namespaces. |
| Archived publication sources | `packs/archive/core-pubs-0_3_1.json`, `packs/archive/core-pubs-0_8_2.json` | These historical filenames and their `info.json` entries intentionally retain `pubs`. |

`normalizePublicationConfig()` is called by the configuration loader, `menu()`, and the file-import handler for embedded `forms.config`. `use()` also aliases the exact old unversioned source. The normalizer mutates the supplied configuration, retains any legacy `pubs` property, and does not merge conflicting `pub`/`pubs` sections. It is not a general migration of localStorage records or arbitrary path spellings.

Do not globally replace `pubs` in archives or catalogs. Avoid supplying both old and new paths for the current core: normalization does not deduplicate sources, so this loads the core twice. Relative legacy variants such as `./packs/core-pubs.json` are not currently aliased. Query-link compatibility differs between collector and preview; see Section 8 and findings **PUB-01/PUB-02**.

Sources: [normalization and menu](../menu.js), [collector loading/import](../index.html), [historical catalog](../packs/info.json).

| Element type | Answer representation | Directly scored by `score2.js`? |
| --- | --- | --- |
| `text`, `textbox`, `number`, `date` | One property named after the element ID | No |
| `radio`, `dropdown` | One property containing the selected **option ID**, not its label or point value | Radio: yes. Dropdown: no. |
| `checkbox` | One boolean property per option: `<elementID>_<optionID>` | Yes |
| `tabular_radio` | One property per row: `<elementID>_<rowID>`, containing the selected option ID | No |
| `info`, `separator` | Display elements; normally no answer property | No |

For example:

```js
P_Data = "Yes";
P_Data_Source_NewOwn = true;
P_Data_Source_ReuseOther = false;
P_CRediT_Conceptualization = "Lead";
```

There is no checkbox answer array called `P_Data_Source`. Therefore, to test whether two boxes are selected, use their individual boolean keys:

```js
$P_Data_Source_NewOwn && $P_Data_Source_ReuseOther
```

Avoid collisions between element IDs and generated checkbox/row keys. A separate element named `EX_Check_A` would collide with option `A` of checkbox element `EX_Check`.

The current `number` renderer is a text input. Numeric-looking answers can therefore be strings. Use explicit numeric conversion where strict numeric semantics matter; do not assume `$YearPhD === 2020` matches the entered text `"2020"`.

## 5. The condition language

Conditions are **strings containing expressions**. They are not plain JavaScript as written: the app first expands its shorthand and field references, then evaluates the result with JavaScript `eval()`.

For the UI, the shorthand expansion and reference substitution live in `utils/expressions.js` (also used by the pack validator), and `index.html` evaluates the result. `score2.js` contains a separate implementation for scoring. `packutils.js` initializes defaults; it does not evaluate conditions.

### 5.1 Field references

| Syntax | Meaning | UI conditions | Scoring expressions |
| --- | --- | --- | --- |
| `$P_Data` | Answer in the research output being evaluated | Supported | Supported |
| `$P_Data_Source_NewOwn` | Generated checkbox answer in that output | Supported | Supported |
| `meta$RaterType` | Answer in the first, metadata record | Supported | Supported |
| `config$statements_only_for_top_publications` | Global configuration property | Supported | **Not implemented** |
| `config$pub.active` | Nested configuration property | Supported | **Not implemented** |

For example, scoring transforms `$P_Data` to `context['P_Data']`, and `meta$RaterType` to `meta['RaterType']`. UI evaluation obtains metadata and configuration from the Alpine stores.

Use the complete, case-sensitive stored key. `$P_Data_Source` is not a substitute for `$P_Data_Source_NewOwn`. Bare `P_Data` is an ordinary JavaScript identifier and will generally cause a reference error. Use letters, digits, and underscores in new IDs; avoid hyphens and spaces in keys used by this shorthand.

### 5.2 Ordinary operators

After preprocessing, ordinary JavaScript expression rules apply:

```js
$P_Suitable === 'Yes'                    // strict equality
$P_Suitable !== 'No'                     // strict inequality
$P_TypeMethod_EmpiricalQuantitative      // checkbox truthiness
!$P_TypeMethod_MetaAnalysis              // negation
$P_Data === 'Yes' && $P_Data_Source_NewOwn
$P_Data_Source_NewOwn || $P_Data_Source_Simulated
1950 <= $YearPhD && $YearPhD <= 2030
```

Use single quotes around string literals inside the JSON string, or escape double quotes. Prefer `===` and `!==`; the implementation also accepts coercing comparisons such as `==` and `!=`, which are used in some existing formulas.

JavaScript evaluates `&&` before `||`, but parentheses make compound rules easier to read. Conditions need not return a literal boolean: the caller uses the result’s truthiness. An unknown `$Field` resolves to `undefined`; it does not necessarily throw. This can silently make a condition false or make `$Field !== 'No'` true.

### 5.3 `=|=` means “equals any listed value” (equivalent to R's `%in%`)

This pack expression:

```js
$P_Data_Open =|= ['YesEntire', 'YesParts', 'YesSynthetic']
```

is rewritten to:

```js
($P_Data_Open === 'YesEntire' ||
 $P_Data_Open === 'YesParts' ||
 $P_Data_Open === 'YesSynthetic')
```

Field substitution then turns the `$...` references into answer lookups. This is shorthand for several strict comparisons of **one scalar answer**. It is not a JavaScript operator and it is not a checkbox-array operation.

A real example is the condition for the data identifier field in `core-pub.json`:

```json
"condition": "$P_Suitable === 'Yes' && $P_Data === 'Yes' && ($P_Data_Source_NewOwn || $P_Data_Source_ReuseCompilation || $P_Data_Source_ReuseOwn || $P_Data_Source_Simulated) && $P_Data_Open =|= ['YesEntire', 'YesParts', 'YesSynthetic', 'YesAggregate', 'YesDataGeneratingScript']"
```

This shows the DOI/URL question only for a suitable, data-using paper with an eligible data source and one of the listed sharing answers.

### 5.4 Negating the list comparison (equivalent to R's `!x %in% c(...)`

The existing pack uses this form:

```js
!$P_Data_Open =|= ['NotApplicable', 'NotAvailable']
```

Because shorthand expansion happens first, this becomes:

```js
!($P_Data_Open === 'NotApplicable' || $P_Data_Open === 'NotAvailable')
```

It means “neither of these answers.” For readability, new formulas can make the grouping explicit:

```js
!($P_Data_Open =|= ['NotApplicable', 'NotAvailable'])
```

### 5.5 `=&=` means “equals every listed value”

The implementation also recognizes:

```js
$Answer =&= ['A', 'B']
```

and expands it to:

```js
($Answer === 'A' && $Answer === 'B')
```

A scalar cannot equal two different literal strings at once, so this example is always false. **This is not an “all checkboxes selected” operator.** For that, write:

```js
$EX_Check_A && $EX_Check_B
```

There are no uses of `=&=` in the shipped pack JSON files. It is supported by the preprocessors but normally offers little value for distinct radio/dropdown choices.

### 5.6 `exists(...)` means “is truthy”

Both evaluators define:

```js
const exists = value => !!value && value !== "";
```

Typical use:

```js
exists($P_OpenMaterials_Identifier)
```

This is not a check that a property exists, a URL is valid, or an explanation is substantive.

| Value | `exists(value)` |
| --- | --- |
| `undefined`, `null`, `false`, numeric `0`, `""` | `false` |
| `"0"`, `"No"`, `"   "`, `"not a URL"` | `true` |

A whitespace-only explanation entered into a plain text field can therefore satisfy an explanation gate. If meaningful text is required, trimming or stronger validation must be added explicitly.

### 5.7 Empty conditions and parser limits

An omitted or empty condition is treated as true. Write `"condition": "false"` to make a condition explicitly false; do not use a JSON boolean as a substitute for an expression string.

The sugar uses regular-expression replacement and `split(",")`, not a full parser. Keep it simple:

- Use a single field token on the left, such as `$Answer` or `meta$RaterType`.
- Use nonempty lists of simple literals, with quoted strings.
- Keep each shorthand comparison on one line.
- Avoid strings containing commas, nested arrays, complex expressions containing commas, or dotted configuration paths on the left of the sugar. Use ordinary comparisons for those cases.
- Do not assume string literals are protected from `$...` replacement.

For example, `$Answer =|= []` expands to invalid `()`, not to false. A malformed expression can interrupt evaluation because these helpers do not catch evaluation errors locally.

Sources: [UI expression helpers](../utils/expressions.js), [UI evaluation](../index.html), [scoring expression helpers](../utils/score2.js).

## 6. How scoring works

### 6.1 Where point values belong

Points are defined on **options**:

```json
{ "id": "RegisteredReport", "text": "Registered report", "value": 2 }
```

The answer stores `"RegisteredReport"`; the scorer looks up the matching option and obtains `2`. Use finite, nonnegative JSON numbers for `value`, not numeric strings. Missing or falsy option values are treated as zero by the current implementation.

An element does not need a `score` object to contribute points. A `radio` or `checkbox` with option values is scored automatically. `score` supplies additional rules; it is not an on/off switch.

| Type | Possible points | Earned points, when `score.condition` is true |
| --- | --- | --- |
| `radio` | Largest option value | Selected option’s value, or zero if no option matches |
| `checkbox` | Sum of all option values | Sum of values for keys whose stored value is exactly boolean `true` |
| All other types | Zero | Zero |

`dropdown` and `tabular_radio` are not scored, even if options contain values. Checkbox strings such as `"true"` do not earn points because the scorer tests `=== true`.

### 6.2 The actual evaluation sequence

For each element in `meta.forms[output.type].elements`, `score2.js`:

1. Evaluates `score.not_applicable`, if present. If true, it skips the item entirely.
2. Determines possible points from radio/checkbox options.
3. Awards the selected points only if `score.condition` is true, or missing/empty.
4. Adds the item’s possible and earned points to the output totals.

It does not consult the element’s visibility `condition`, inherit a parent’s scoring rule, check completion, or validate a URL.

There is an extra early-return branch guarded by `el.score?.score`. None of the shipped pack definitions supplies that property, so it has no effect on them. It appears to be a typo or leftover logic; do not add `score.score` as a pack-author workaround. See **LIMIT-01** in the [findings overview](RESQUE-Pack-Findings.md).

For a one-point item:

| Not-applicable rule | Point-earning rule | Selected value | Contribution |
| --- | --- | --- | --- |
| True | Any | Any | Excluded: neither numerator nor denominator |
| False | False | 1 | 0 out of 1 |
| False | True | 1 | 1 out of 1 |
| False | True | Missing/zero | 0 out of 1 |

### 6.3 Worked example: reproducible scripts

`P_ReproducibleScripts` has these option values:

| Answer | Value |
| --- | --- |
| `NotApplicable` | 0 |
| `NotAvailable` | 0 |
| `YesParts` | 0 |
| `YesEntire` | 1 |

Its rules are:

```json
"score": {
  "not_applicable": "($P_Suitable === 'No') || ($P_Data === 'No') || (($P_ReproducibleScripts === 'NotApplicable') && (exists($P_ReproducibleScripts_NAExplanation)))",
  "condition": "(exists($P_ReproducibleScripts_Identifier))"
}
```

For a suitable paper using data:

| Response state | Result |
| --- | --- |
| `YesEntire`, identifier entered | 1/1 |
| `YesEntire`, identifier empty | 0/1 |
| `YesParts`, identifier entered | 0/1 |
| `NotAvailable` | 0/1 |
| `NotApplicable`, explanation empty | 0/1 |
| `NotApplicable`, truthy explanation | Excluded |

The separate `P_ReproducibleScripts_FAIR` checkbox item has seven options worth 0.2 each, so its maximum is **1.4**, not 1. Its score condition checks `YesParts`/`YesEntire` but does not require the scripts identifier. It is an independently scored item, even though its ID and layout place it beneath the scripts question.

### 6.4 The 12 scored elements in `core-pub.json`

These maxima apply when each item is included. Each row has its own `not_applicable` logic; the table does not replace those formulas.

| ID | Type | Maximum | Additional gate for earning points |
| --- | --- | ---: | --- |
| `P_Methods_PRISMA` | Radio | 1 | None beyond its answer and applicability |
| `P_Methods_MetaAnalysisRaters` | Radio | 1 | None beyond its answer and applicability |
| `P_Data_Open_AccessLevel` | Radio | 1 | Data = Yes, sharing answer differs from `NotAvailable`, identifier exists; see **SCORE-01** |
| `P_Data_Open_FAIR` | Checkbox | 1 | Eligible sharing/access answers and `NewOwn` or `Simulated` source; see **SCORE-02** |
| `P_ReproducibleScripts` | Radio | 1 | Scripts identifier exists |
| `P_ReproducibleScripts_FAIR` | Checkbox | 1.4 | Scripts = `YesParts` or `YesEntire` |
| `P_IndependentVerification` | Radio | 2 | Verification identifier exists |
| `P_OpenMaterials` | Radio | 1 | Materials identifier exists |
| `P_Preregistration` | Radio | 2 | Preregistration identifier exists |
| `P_Preregistration_Content` | Checkbox | 1 | Preregistration = `Yes` or `RegisteredReport` |
| `P_Preregistration_Replication` | Radio | 1 | Preregistration = `Yes` or `RegisteredReport` |
| `P_Methods_PowerAnalysis` | Radio | 1 | Empty score condition, therefore true |

The sum of those nominal maxima is **14.4**. A publication’s denominator depends on its applicability rules; it is not a fixed 14.4. Setting `P_Suitable` to `No` excludes all scored core publication items.

Expansion packs add their scored elements to the same publication total. They do not receive an automatic separate percentage or equal pack weight. The theory checklist can add up to 25 one-point items. Add suitable category cues if you also want extension points to appear in the category charts.

### 6.5 Publication totals, overall score, and categories

For one output:

```text
relative = earned points / possible points
percentage = 100 × relative, formatted to one decimal place
```

If possible points are zero, the output’s relative score is zero and its percentage is `"0.0"`. `score()` returns item results, totals, categories, the DOI, and `P_MultiStudy_Selected`. The last field is carried through for identification; it does not create separate study scores.

`scoreAll()` scores every record after the metadata record. Outputs with a missing form or zero possible points are excluded from the overall mean. For the remaining outputs, the overall relative score is the **arithmetic mean of their individual relative scores**.

For example, an output scoring 1/1 and another scoring 0/9 produce an overall score of **50.0%**. Pooling their points would produce 10.0%, but that is not the implemented overall calculation. The scorer itself does not restrict this mean to publications or to selected top papers.

Categories are configured with a title and a regular-expression `cue` matching element IDs. For instance, `ReproducibleScripts|IndependentVerification` collects both groups. Each category sums matching item points and maxima; overlapping cues can count an item in more than one category. Categories do not change the total score.

Overall category results pool category points and maxima across outputs. This differs from the equal-output averaging used for the overall percentage, so the charts need not average to that percentage. Unmatched indicators still contribute to the total.

An explicit, nonempty category list overrides the form’s category configuration. Otherwise, `score()` reads `meta.forms[type].config.score_categories`, falling back to the older `meta.forms.config.score_categories` location. The current collector passes its publication category list to `scoreAll()` for all output types.

Source: [current scoring implementation](../utils/score2.js).

## 7. Defaults: the role of `packutils.js`

`getDefaultValues(elements)` creates the initial answer object.

| Situation | Initial value |
| --- | --- |
| Scalar input without an explicit default | Empty string `""` |
| Checkbox without an explicit default | Every option key is `false` |
| Checkbox with `"default": ["A"]` | The `..._A` key is `true`; every other option key is `false` |
| Tabular radio without a default | Each row key is `""` |
| Tabular radio with an element default | That option ID is assigned to every row |
| Tabular radio with a row default | The row default overrides the element default for that row |
| `info` or `separator`, even with an explicit default | No answer value |

Core examples are `P_Suitable: "Yes"`, `P_Data_Source_NewOwn: true`, and `P_CRediT_<row>: "NoRole"`.

**The previously documented defaults defect is fixed.** Explicit defaults are detected by own-property presence, not truthiness. Scalar `0`, `false`, `""`, and `null` are retained; an inherited `default` property is ignored. Explicit row defaults, including falsy values, override the table's fallback. Preserving a value does not imply that the renderer or completion logic accepts it as a meaningful response.

Checkbox defaults must be arrays containing valid option IDs. For example, `"default": []` is a valid all-unselected state; `"default": "A"`, `"default": false`, and an array naming an unknown option throw clear errors. Every checkbox key is initialized, whether or not it is selected. These behaviors are covered by the verifier's `DEFAULT-*` regression checks.

A configuration `preset` replaces an element's `default` before this helper runs, so a preset answer reaches storage, scoring, and export through the same mechanism (see section 8). Defaults are not recalculated when a visibility condition changes. The import handler still takes its default definitions from the previously open dataset, which can disagree with the incoming file (**DATA-02**). Generated checkbox/table keys still have a separate export-ownership problem (**DATA-01**); fixing initialization did not resolve that filtering behavior.

### A default is a hint, not an answer

For `text`, `number`, and `date` inputs the default is **not** written into the field. The field starts empty and shows the default as a greyed-out placeholder, so an unanswered question still looks unanswered and the respondent does not have to delete a value before typing. `getInitialValues(elements)` builds the answers a new record starts with: `getDefaultValues()` with those three types blanked. Every other control - radio, dropdown, checkbox, tabular radio - has no placeholder, so its default stays a real preselection (`P_Suitable: "Yes"`, `P_CRediT_<row>: "NoRole"`). The contenteditable `textbox` is excluded too: its `placeholder` attribute has no stylesheet rule behind it and renders nothing.

Two exceptions keep their value: an element answered by a configuration `preset` (marked `hidden`, with no field to show a hint in - `applyPresets()` writes preset answers into `initialValues` as well), and any element whose default is blank anyway.

`answerHint(elem)` in `index.html` supplies the placeholder: the default when the element has one, otherwise the element title, which is what the placeholder always showed.

### Blank answers fall back to the default on export

`withDefaults(record, defaultValues)` applies the rule that the effective value of a *blank* answer is its default. Blank means missing, `null`, or `""`; `0` and `false` are answers and are never replaced. The helper returns a new record, so a record held in the store is not modified by an export. Keys without a default, and keys whose default is itself blank, are left as they are.

| Moment | Effect |
| --- | --- |
| Creating an output (`createResearchOutput`) | Starts from `initialValues`: preselections are written, hint defaults are not |
| Restoring from local storage (`manualInit`) | A record saved before an element existed, or before it gained a default, starts where a new record would start; stored answers win |
| Importing a file (`handleLoad`) | Same, applied to the loaded record, so a file written by an older version is repaired |
| Exporting (`filterExport`) | An indicator left blank is exported with its default instead of `""` |

So the hint the respondent sees and the value the export carries are the same, without the default ever being an answer in the form. Export visibility conditions are evaluated on the filled record, so a condition such as `$YearPhD < 2020` reads the same value the export carries.

Two consequences worth knowing when a pack adds a default to one of these inputs: the field counts as unanswered in the completion progress until the respondent types something, and the validation message, which is only shown for a nonempty field, no longer fires against the default itself.

The verifier covers all of this with the `DEFAULT-HINT-*` and `DEFAULT-BLANK-*` regression checks.

Source: [default-value helper](../utils/packutils.js).

## 8. Loading and combining packs

For example, configure publication sources like this:

```yaml
pub:
  active: true
  sources:
    - packs/core-pub.json
    - packs/EP/EP-clinical_psychology.json
  exclude: []
  config:
    min_indicators_warning_threshold: 0
```

The example shows the relevant subsection; retain the rest of the configuration, including any desired `score_categories`.

`use()` fetches the listed sources and concatenates their elements in source order. The assembled form uses the first pack’s title, keeps version/date maps keyed by pack prefix, records each pack's `source`, `prefix`, `version`, `status` (plus `declaredStatus` when the file has one) and element `ids` in a `packs` list, and merges default values. Because the assembled forms are embedded in exported records, `packs` is exported too; RESQUER does not read it. It does not validate or resolve duplicate IDs; later defaults overwrite earlier ones with the same key. It aliases the exact old unversioned publication path before fetching but does not deduplicate equivalent sources. `menu()` currently fetches configured sources even for output types with `active: false`; all configured paths must be loadable.

`menu.js` then applies `include` or `exclude`. Both match **ID prefixes**, using `startsWith()`, rather than exact IDs. For example, excluding `P_Data` excludes `P_Data`, `P_Data_Source`, `P_Data_Open`, and their other elements.

Two important configuration details:

- If `exclude` exists, it takes precedence over `include`, even when it is `[]`. Remove `exclude` when using `include`.
- An empty `include: []` selects all elements, because `pick()` receives no filtering IDs.

Filtering occurs after defaults are built, so defaults for excluded elements remain in the assembled default map. Including a child does not automatically include the parent questions it depends on. Keep dependencies together. The browser validator reports references to excluded indicators even when their defaults remain; those defaults do not make the indicators part of the selected set.

### Presets: answering an indicator in the configuration

`exclude` removes an indicator completely: it disappears from the form, from the export, and from every condition that refers to it. That is the wrong tool when a deployment knows the answer and other indicators depend on it. A hiring committee, for example, knows that every respondent is the applicant, while `core-meta.json` and `core-pub.json` use `meta$RaterType` to decide which questions to show.

`preset` answers such an indicator in `config.yaml`:

```yaml
meta:
  sources: ["packs/core-meta.json"]
  exclude: []
  preset:
    RaterType: "Applicant"
```

`menu.js` applies presets with `applyPresets()` **after** `include`/`exclude`, so a preset can only answer an indicator that is part of the selected form. For each entry it replaces the element's `default` with the configured value, marks the element `hidden`, and expands the answer through `getDefaultValues()`, so checkbox and table presets produce their generated `<id>_<optionID>` and `<id>_<rowID>` keys. The results are available on the assembled form as `presets` (the configured values) and `presetValues` (the expanded answers).

| | Shown in the form | Answer available to conditions and scoring | In the export |
| --- | --- | --- | --- |
| Normal indicator | Yes | Yes | Yes, if its condition is true |
| `preset` | No | Yes, the configured value | Yes |
| `exclude` | No | No; references to it become validation errors | No |

Consequences worth knowing:

- Hiding is only reachable through answering. There is no `hide` list, so a hidden indicator can never be undefined, and packs do not need a `"condition": "false"` for deployment decisions.
- Preset IDs are matched **exactly**, unlike the prefix matching of `include`/`exclude`.
- Presets overwrite answers restored from local storage or loaded from a file (`enforcePresets()` in `index.html`), because the form offers no way to correct a hidden answer.
- The metadata record carries the applied presets as `presets` (output type -> indicator ID -> value), and the export keeps that key. Consumers can therefore distinguish a configured answer from one the respondent gave.
- A preset value is a normal answer for `score2.js`; it is not treated specially.
- `checkCompletion()` ignores hidden elements, so a preset neither raises nor lowers the displayed progress.
- Invalid presets are never applied. An unknown or excluded ID, an unknown option ID, a checkbox value that is not a list, and `info`/`separator` elements are collected as `presetIssues` during assembly and reported by the browser validator as `invalid-preset` errors.

`preview.html` reads the same configuration and marks preset indicators with a *hidden · preset: value* badge, so a configured questionnaire can be reviewed and exported as a manual without starting the collector.

`config/config-default-committee.yaml` is a complete example. It is a template: the app reads `config/config.yaml` and falls back to `config/config-default.yaml`, so copy it before use.

The fallback applies only when `config/config.yaml` is missing. A file that exists but cannot be used - invalid YAML, an unpaired quotation mark (which YAML itself often accepts, silently swallowing the following lines or keeping a stray `"` in the value), or a missing section or `sources` list - is checked by `parseConfigFile()` in `menu.js` and reported instead: the collector shows a startup error panel with the file, line, column, an excerpt, and the reason, and the preview shows the same message as a warning and previews the pack without presets. A pack file listed under `sources` that does not exist is reported on the same panel with its path.

The assembled form definitions are embedded in the metadata record as `forms`. `score2.js` reads those embedded definitions. When testing a changed pack with previously saved data, check which form definitions are embedded in that data; changing the source JSON does not by itself guarantee that an existing record is scored with the new definitions.

### Query-based pack selection

For the current core, use `preview.html?type=pub&showPoints=true&showLabels=true`; `type=core-pub` also works. To preview an extension, use `preview.html?path=EP&type=EP-theory_development&showPoints=true`. Preview loads the selected pack by itself; it does not assemble dependent core answers or simulate conditional scoring.

The collector uses the same query parameters to select a publication source. For example, `index.html?path=EP&type=EP-theory_development` appends the extension to `config.pub.sources`, retains source order, and avoids appending the same exact selected path twice. Explicit `core-*` selections replace the publication sources. This selector is publication-specific even when another built-in alias is provided; use the `meta`, `data`, and `software` configuration sections to configure those forms.

Historical filenames have not been renamed. A working archived selection is:

```text
preview.html?path=archive&type=core-pubs&version=0.8.2&showLabels=true
index.html?path=archive&type=core-pubs&version=0.8.2
```

Do not currently use `type=pub` or `type=core-pub` with those archived versions: both construct nonexistent `core-pub-<version>.json` files. Also, the old unversioned `type=core-pubs` alias works in the collector but fails in preview, which lacks the source normalizer (**PUB-01**). Keep explicit historical catalog names until a shared, archive-aware resolver is implemented.

In versioned previews, `showPoints=true` is currently lost in the query resolver's return object (**UI-02**). Loading an archive successfully also does not guarantee scoring compatibility: the `0.3.1` publication archive uses the old top-level `scoring` structure, which `score2.js` does not implement.

The preview still depends on remote Alpine and manual-export scripts; it is not currently an offline-only tool (**UI-03**).

Sources: [assembly helpers](../utils/assemble.js), [configuration selection](../menu.js).

### Browser pack validation

The collector runs [utils/pack-validator.js](../utils/pack-validator.js) locally after the configured packs have been assembled and `include`/`exclude` applied. This includes extensions selected through the URL and all configured output types, even those marked `active: false`. Validation examines the current form definitions, not saved answers or older forms embedded in imported records. It does not evaluate expressions or make additional network requests.

Every problem is reported with its honest severity (error or warning), the pack it comes from (`pack`, `packStatus`) and whether it **blocks**. Only errors in stable packs of active output types block:

| | Output type `active: false` | Output type active |
| --- | --- | --- |
| **stable pack** | Listed, not blocking (`deferred: 'inactive'`) | **Blocking** |
| **alpha/beta pack** | Listed, not blocking (`deferred: 'inactive'`) | Listed, not blocking (`deferred: 'alpha'`/`'beta'`), plus one current `immature-pack` warning naming the pack and its number of known problems |

Configuration problems (`invalid-preset`) block in every active output type, whatever the pack status, because they are the deployment's own mistake.

Use **Pack validation** next to FAQ, Tour, and Privacy/Terms of Use to recheck and view all results; the link shows the counts, e.g. *(1 error, 2 warnings, 3 not blocking)*. The modal opens automatically on startup only if there are blocking errors, and the welcome tour is then skipped. Warnings and non-blocking problems never open it. The modal lists current problems first; non-blocking ones are collapsed under *Not blocking*, each with its reason. Each result identifies the form, indicator ID, pack (with an *alpha*/*beta* badge), field, message, and original expression/text. Closing the modal allows continued use; validation does not change answers, scores, or configuration.

The report object contains `issues` (all, current ones first), `errors` and `warnings` (all, by severity), `current`, `deferred`, `blocking` and `indicatorsChecked`. It has four kinds of results:

- `invalid-pack-status` (error): a pack's `status` is not `alpha`, `beta` or `stable`.
- `immature-pack` (warning): an active output type uses an alpha or beta pack.
- `invalid-preset` (error), with `field: 'preset'`: invalid configuration presets, collected while the forms are assembled and listed for every configured output type.
- `missing-indicator-reference`, described below.

The reference rule checks missing indicator/answer references:

- **Error:** a missing reference in `condition`, `validation.condition`, nested option/row conditions, `score`/`scoring` strings (including `not_applicable`), or text highlight conditions.
- **Warning:** a missing reference in display fields (`title`, `text`, `info`, `background`, `tip_external`, `message`).
- `$Field` resolves within the same form; `meta$Field` resolves against selected metadata; `global$Field` resolves against publications. `config$...` belongs to configuration and is outside this check.
- Checkbox references use `<id>_<optionID>` and table references use `<id>_<rowID>`. Their bare parent IDs are not stored answers. Selected input comment keys and built-in record fields (`type`, `version`, `date_added`, `date_modified`, `position`, `CollectorURL`) are recognized, as are metadata `date_created` and the publication `Abstract` supplied by DOI lookup.
- Excluded indicators, their generated keys, and defaults left behind by filtering do not satisfy references. Indicators from unrelated output types cannot satisfy an unqualified reference either.

For example, setting `pub.exclude: ["P_Suitable"]` produces errors for selected indicators that still refer to `$P_Suitable`. Restore that dependency or update those references. Repeated uses of the same missing reference within a field produce one result.

The shipped software pack currently contains an unresolved `$S_Tests_URL` reference in `S_Tests_Quality.options[0].condition`. It is listed under *Not blocking* in the default setup, because software is inactive and the pack is alpha; switching `software: active: true` keeps it non-blocking but adds the `immature-pack` warning. This check reports declared references even in fields the current renderer/scorer does not enforce; it does not change their evaluation behavior.

Besides missing references, the validator checks each pack file as written and the forms assembled from the configuration; see [Validator rules](#validator-rules). In the collector, problems of elements removed by `include`/`exclude` are not reported, because those elements are not used. Pack files are checked as fetched, before presets change the elements. Results carry the pack file and, where possible, the line of the element in it.

Run the focused regression suite with:

```bash
node tests/verify-pack-validator.cjs
```

### Checking packs outside the collector

The same checks run in three places:

1. **In the collector:** the *Pack validation* dialog, for the configuration the app is running with (above).
2. **In the browser, without the collector:** [validator.html](../validator.html) checks this app's configuration, every configured and catalogued pack (`packs/info.json`) on its own, and a pack file you choose or drop onto the page. The file is read locally and never uploaded. Publication packs are checked together with `core-meta` and `core-pub` unless you untick that option, so references such as `$P_Suitable` resolve. The dialog in the collector links to this page.
3. **On the command line:** `scripts/validate-packs.cjs` needs Node.js only (no npm):

```bash
node scripts/validate-packs.cjs                      # the configuration, as the collector does
node scripts/validate-packs.cjs --all                # configuration plus every pack in packs/
node scripts/validate-packs.cjs packs/EP/EP-my_pack.json           # one pack, with core-meta and core-pub
node scripts/validate-packs.cjs --strict packs/dev/EP-my_pack.json # also fail on warnings and non-blocking errors
node scripts/validate-packs.cjs --alone --with packs/core-pub.json my-pack.json   # choose dependencies yourself
node scripts/validate-packs.cjs --format json --all  # machine-readable report
```

Exit code 0 means no blocking errors (with `--strict`: no errors and no warnings at all), 1 means problems were found, 2 is a usage error. Notices are only counted unless `--notices` is given. An alpha pack therefore passes without `--strict` even with errors; use `--strict` while developing a pack, and to decide whether it can be marked stable.

`.github/workflows/validate-packs.yml` runs `--all --format github` and the validator tests on every push and pull request that changes packs, configuration or validator code; problems appear as annotations on the changed lines. A fork has to enable workflows once in its *Actions* tab.

### Validator rules

Each result has a `code`, a severity and a fix hint. **Errors** can produce wrong data, wrong scores or a broken form; they block when they occur in a stable pack of an active output type (see the table above). **Warnings** are probable mistakes. **Notices** are informational: shown collapsed, never counted in the footer link, never blocking. There is no way to silence a rule: a production deployment should simply have no errors and no warnings among its current problems. Archived packs (`packs/archive/`) are frozen history and only checked for valid JSON.

*Pack file* rules look at one file on its own:

| Code | Severity | What it finds | Why it matters |
| --- | --- | --- | --- |
| `invalid-json` | error | The file is not valid JSON (with line number). | The collector cannot start. |
| `pack-structure` | error | Not an object; missing `prefix` (letters/digits), `title` or `elements` list; an element that is not an object. | The pack cannot be assembled or named. |
| `pack-metadata` | warning | `version` is not a string of numbers such as `"1.0.0"`; `date` is not `YYYY-MM-DD`. | Versions are stored with every answer. |
| `invalid-pack-status` | error | `status` is not `alpha`, `beta` or `stable`. | The pack is then treated as stable. |
| `unknown-field` | warning | A field the app does not know, with a "did you mean" suggestion (e.g. `conditon`). | Misspelled fields are silently ignored. |
| `ignored-field` | notice | `eval_dimension`, `min_selected`, option `explanation_required`, option `condition`, `score.op`, `score.factor`. | Accepted, but nothing enforces or scores them. |
| `missing-element-id` | error | An element, option or table row without `id`. | It has no answer key. |
| `id-charset` | error | An ID with characters other than letters, digits and `_`. | IDs must work in conditions, JavaScript and R. |
| `id-prefix` | warning | An element ID that does not start with `<prefix>_`. The 37 long-standing IDs of `core-meta` and `core-pub` (`DOI`, `Title`, `RaterType`, …) are a fixed exception in the validator. | Unprefixed IDs can collide with other packs. |
| `duplicate-id` | error | Two elements with one ID (also across packs of an output type). | Both answers share one field. |
| `duplicate-option-id` | error | Two options or rows of an element with one ID. | The answers cannot be told apart. |
| `unknown-element-type` | error | A `type` the collector does not render. | The element is not shown. |
| `field-type` | error | A condition that is not a string (e.g. `false` instead of `"false"`), `options`/`rows` that are not lists, a `score`/`validation` that is not an object. | The expression or list is not evaluated as intended. |
| `missing-options` | error | A radio, checkbox, dropdown or table without options, or a table without rows. | Nothing can be answered. |
| `option-value-type` | error | An option `value` that is not a number of 0 or more (e.g. `"1"`). | Points are computed incorrectly. |
| `option-value-incomplete` | error | Some options of a radio/checkbox have a `value`, others do not. | Give every option a value once one has points, also `0` (#136). |
| `unscored-type-with-values` | warning | Points on a dropdown or table. | Only radio and checkbox elements are scored. |
| `score-without-points` | warning | A `score` block on an element that cannot earn points. | The block has no effect. |
| `expression-syntax` | error | A condition, scoring rule or highlight condition that is not a valid expression after shorthand expansion. Expressions are compiled, never run. | Evaluation fails. |
| `array-comparison` | error | A comparison with a list, such as `$CP_RCT != ['Yes']` (RESQUER#39). | Works only by type coercion. |
| `sugar-pitfall` | warning (error for `=\|= []`) | An empty `=\|=` list, any `=&=`, a quoted value containing a comma, or a left side that is not a single field. | The shorthand is expanded incorrectly (guide section 5.7). |
| `config-in-scoring` | error | `config$` inside `score`. | The scorer cannot resolve it. |
| `validation-pattern` | error | A `validation.pattern` that is not a valid regular expression. | The form fails when it checks the answer. |

*Form* rules look at the packs of one output type together:

| Code | Severity | What it finds | Why it matters |
| --- | --- | --- | --- |
| `missing-indicator-reference` | error (warning in display text) | A reference to an indicator that is not part of the selected forms (described above; covers excluded parents, #126 and #130). | Conditions and scoring rules silently fail. |
| `unknown-option-literal` | error (warning in highlight text) | A comparison with an option ID that the referenced element does not have, e.g. `$P_Data_Open === 'yes'` or `meta$RaterType === 'Applicnt'`, also across packs; and checkbox answers compared with text. | The comparison never matches. |
| `generated-key-collision` | error | Two elements producing the same answer key: checkbox option `Other` of `X` and an element `X_Other` (#133), table rows, `_Comment` fields. | Both answers share one field. |
| `duplicate-source` | error | The same pack listed twice under `sources`. | Its indicators appear and count twice. |
| `prefix-collision` | error | Two packs with the same prefix in one output type. | Only one version is recorded. |
| `forward-reference` | notice | A visibility condition that depends on an element further down (#14). | Usually confusing; the core does it deliberately for the "no DOI" checkbox. |
| `immature-pack` | warning | An active output type uses an alpha or beta pack. | Its listed problems do not block. |

*Configuration* rules look at `config.yaml`:

| Code | Severity | What it finds | Why it matters |
| --- | --- | --- | --- |
| `invalid-preset` | error | A preset for an unknown or excluded indicator, an unknown option, a non-list checkbox value. | The preset is not applied. |
| `selection-matches-nothing` | warning | An `include`/`exclude` entry that matches no ID prefix, with a suggestion. | A typo silently does nothing. |
| `include-ignored` | warning | `include` together with `exclude` (even an empty one). | `exclude` wins; `include` is ignored. |
| `category-cue` | warning (error if the cue is not a valid regular expression) | A score category whose `cue` matches no scored indicator, or a scored indicator in no category. | Points count toward the total but appear in no chart category (#130). |

New rules are added to `rules` in `utils/pack-validator.js` (code, severity, hint) and to this table; `tests/verify-pack-validator.cjs` checks that both lists agree.

## 9. Text shorthand, completion, and export

### Dynamic text and highlighting

Text preprocessing is separate from expression evaluation. Existing packs use substitutions such as `$Title`, `$date_added@datetime`, and `config$max_top_papers`. The top-paper title also uses `global$P_TopPaper_Select@paper_count` to count selected publications.

Conditional highlighting uses braces:

```text
{ $P_Data === 'Yes' | This text is highlighted when data are used. }
```

If the condition is false, the text still appears, without highlighting. With an indicator context, the shorter form is available:

```text
{:'Lead', 'Equal' | This text is highlighted for either selected role.}
```

The colon shorthand means “the current indicator equals one of these values.” It is used in CRediT row information and relies on the renderer passing that row’s full ID. It is not a standalone `condition` syntax. The highlight parser uses `|` as its delimiter, so use ordinary comparisons or the colon form rather than embedding `=|=` or `||` inside the brace condition.

### Completion is separate from scoring

The completion check examines visible, nonoptional inputs, excluding checkboxes, information elements, and separators. It does not gate score calculation. Validation warnings and word limits also do not automatically block scoring or export.

There are still completion defects: the code checks a table’s parent key instead of its row keys, and `undefined !== ""` causes absent scalar keys to count as filled. With no required elements, the ratio and displayed percentage become `NaN`. See **UI-01**; preserving defaults is not a substitute for checking actual answer keys.

### Export is condition-sensitive, but not uniform

`filterExport()` first replaces blank answers with their defaults (section 7), then builds an allowlist from visible elements, their checkbox/row keys, comments, selected metadata fields, and “unreachable” default keys. It does not simply serialize only what is on screen, and an exported `""` now means “no answer and no default”, not “default not applied”.

In the current implementation, generated checkbox and table keys are often classified as unreachable because they are compared with parent element IDs. Hidden checkbox values can therefore survive export, while hidden scalar fields may be omitted even if they have an explicit default. See **DATA-01** before relying on export to remove hidden answers. Since checkbox initialization is now complete, all generated checkbox default keys take part in this ownership problem, not just explicitly selected defaults.

Source: [completion logic](../index.html), [text helpers](../index.html), [export filtering](../index.html).

## 10. A practical authoring workflow

1. Choose a unique pack prefix and noncolliding element/option IDs. Preserve IDs when revising wording; changing an ID changes the data key.
2. Choose the control type and write the answer keys it will generate before writing conditions.
3. Define visibility independently for each element. Include parent requirements explicitly.
4. Put numeric point values on radio/checkbox options. Define `score.not_applicable` for exclusion and `score.condition` for evidence gates. Repeat required parent checks in child scoring rules.
5. For each scored item, check five states: unanswered, negative answer, positive answer without evidence, positive answer with evidence, and justified not applicable.
6. Enter a positive answer, then change the parent so the child is hidden. Check whether its stored answer should still earn points, retain its denominator, or be excluded. Encode that decision explicitly.
7. Add the pack to `sources`, and to `info.json` if it should be discoverable in the preview. Add category cues if its points should appear in a chart.
8. Check a fresh record and an export/import round trip. Verify both item scores and the denominator; a plausible percentage alone can conceal a mistake.
9. Keep `"status": "alpha"` while the pack is in development (or develop it in `packs/dev/`). Its problems then never block a deployment, yet **Pack validation** lists them under *Not blocking*. Before a release, run `node scripts/validate-packs.cjs --strict <pack>` (or check the file in `validator.html`), fix every error and warning, and set `"status"` to `"beta"` or `"stable"`.

## 11. Running the verifier and interpreting results

From the repository root:

```bash
node tests/verify-packs.cjs
node tests/verify-packs.cjs . > tests/verification-results.json
node tests/verify-packs.cjs --strict
node tests/verify-pack-validator.cjs   # rules of the pack validator, validator.html logic
node tests/verify-validate-cli.cjs     # the command-line validator (fixtures in tests/fixtures/)
```

No npm installation/build is required. The script defaults to the checkout containing it, independent of the current working directory. An optional repository-root argument selects another checkout. Do not use `node /tests/verify-packs.cjs .`, which points to an unrelated filesystem-root directory.

The JSON report separates three kinds of checks:

| Kind | What success means |
| --- | --- |
| `regression` | A supported behavior or confirmed fix still works, including canonical/legacy publication configuration, source assembly, current/default preview resolution, import normalization, corrected defaults, configuration-file error reporting, and the rule that no library, stylesheet, or font is loaded from a CDN. |
| `known-issue` | A documented defect was reproduced; this is not an acceptance pass. |
| `characterization` | A limitation or assessment-policy choice still behaves as documented, such as early theory denominators. |

Every pack JSON file is parsed, including archives and the catalog. Invalid JSON and failed checks cause a nonzero exit, without preventing later checks from being reported. `--strict` additionally exits nonzero while known issues remain reproduced. Invocation/setup errors exit 2. When fixing application behavior, update the associated expectation and promote it to a regression; do not restore an old defect merely to make characterization checks pass.

The verifier executes actual source excerpts with mocked stores/storage and file-backed fetches in Node. It does not prove browser rendering, external service integration, or downstream RESQUER compatibility. Browser smoke testing was attempted for this review but navigation was blocked by environment policy, so no browser pass is claimed.

See the [findings report](RESQUE-Pack-Findings.md) and [recorded verification results](../tests/verification-results.json) for the reviewed snapshot. The report distinguishes fixed issues from remaining defects and decisions, rather than carrying the earlier list forward unchanged.
