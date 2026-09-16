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
| `core-software.json` | Research software questionnaire. Prefix `S`, version `0.2`; some scoring fields are not implemented by `score2.js`. |
| `core-data.json` | A minimal data-set pack with one text field. Prefix `D`, version `0.0.1`; no points. |
| `user.json` | Example custom questions. Prefix `U`, version `0.1.0`. |
| `EP/EP-clinical_psychology.json` | Publication extension, prefix `CP`, version `0.2.1`; 16 elements, including 5 scored elements. |
| `EP/EP-theory_development.json` | Publication extension, prefix `TH`, version `5.0.0`; 34 elements: 25 scored checkboxes, 4 filter questions, 1 explanation, 1 information element, and 3 separators. |
| `dev/` | Development packs for epistemic goals, multidisciplinarity, practical relevance, and stimuli. |
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

For the UI, this logic lives in `index.html`. `score2.js` contains a separate implementation for scoring. `packutils.js` initializes defaults; it does not evaluate conditions.

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

Sources: [UI expression helpers](../index.html), [scoring expression helpers](../utils/score2.js).

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

Defaults are applied when creating outputs and filling missing keys during import; they are not recalculated when a visibility condition changes. The import handler still takes its default definitions from the previously open dataset, which can disagree with the incoming file (**DATA-02**). Generated checkbox/table keys still have a separate export-ownership problem (**DATA-01**); fixing initialization did not resolve that filtering behavior.

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

`use()` fetches the listed sources and concatenates their elements in source order. The assembled form uses the first pack’s title, keeps version/date maps keyed by pack prefix, and merges default values. It does not validate or resolve duplicate IDs; later defaults overwrite earlier ones with the same key. It aliases the exact old unversioned publication path before fetching but does not deduplicate equivalent sources. `menu()` currently fetches configured sources even for output types with `active: false`; all configured paths must be loadable.

`menu.js` then applies `include` or `exclude`. Both match **ID prefixes**, using `startsWith()`, rather than exact IDs. For example, excluding `P_Data` excludes `P_Data`, `P_Data_Source`, `P_Data_Open`, and their other elements.

Two important configuration details:

- If `exclude` exists, it takes precedence over `include`, even when it is `[]`. Remove `exclude` when using `include`.
- An empty `include: []` selects all elements, because `pick()` receives no filtering IDs.

Filtering occurs after defaults are built, so defaults for excluded elements remain in the assembled default map. Including a child does not automatically include the parent questions it depends on. Keep dependencies together. The browser validator reports references to excluded indicators even when their defaults remain; those defaults do not make the indicators part of the selected set.

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

Sources: [assembly helpers](../index.html), [configuration selection](../menu.js).

### Browser pack validation

The collector runs [utils/pack-validator.js](../utils/pack-validator.js) locally after the configured packs have been assembled and `include`/`exclude` applied. This includes extensions selected through the URL and all configured output types, even those marked `active: false`. Validation examines the current form definitions, not saved answers or older forms embedded in imported records. It does not evaluate expressions or make additional network requests.

Use **Pack validation** next to FAQ, Tour, and Privacy/Terms of Use to recheck and view all results. The modal opens automatically on startup if there are errors. Warnings alone do not open it. Each result identifies the form, indicator ID, field, missing reference, and original expression/text. Closing the modal allows continued use; validation does not change answers, scores, or configuration.

The first rule checks missing indicator/answer references:

- **Error:** a missing reference in `condition`, `validation.condition`, nested option/row conditions, `score`/`scoring` strings (including `not_applicable`), or text highlight conditions.
- **Warning:** a missing reference in display fields (`title`, `text`, `info`, `background`, `tip_external`, `message`).
- `$Field` resolves within the same form; `meta$Field` resolves against selected metadata; `global$Field` resolves against publications. `config$...` belongs to configuration and is outside this check.
- Checkbox references use `<id>_<optionID>` and table references use `<id>_<rowID>`. Their bare parent IDs are not stored answers. Selected input comment keys and built-in record fields (`type`, `version`, `date_added`, `date_modified`, `position`, `CollectorURL`) are recognized, as are metadata `date_created` and the publication `Abstract` supplied by DOI lookup.
- Excluded indicators, their generated keys, and defaults left behind by filtering do not satisfy references. Indicators from unrelated output types cannot satisfy an unqualified reference either.

For example, setting `pub.exclude: ["P_Suitable"]` produces errors for selected indicators that still refer to `$P_Suitable`. Restore that dependency or update those references. Repeated uses of the same missing reference within a field produce one result.

The shipped software pack currently contains an unresolved `$S_Tests_URL` reference in `S_Tests_Quality.options[0].condition`. It is reported even with `software.active: false`, because that configured pack is still assembled. This check reports declared references even in fields the current renderer/scorer does not enforce; it does not change their evaluation behavior.

This is a reference check, not a full schema, expression-syntax, scoring-policy, or load-error validator. Checks for additional problems can be added to the structured report (`issues`, `errors`, `warnings`) without changing the modal. Run the focused regression suite with:

```bash
node tests/verify-pack-validator.cjs
```

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

`filterExport()` builds an allowlist from visible elements, their checkbox/row keys, comments, selected metadata fields, and “unreachable” default keys. It does not simply serialize only what is on screen.

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

## 11. Running the verifier and interpreting results

From the repository root:

```bash
node tests/verify-packs.cjs
node tests/verify-packs.cjs . > tests/verification-results.json
node tests/verify-packs.cjs --strict
```

No npm installation/build is required. The script defaults to the checkout containing it, independent of the current working directory. An optional repository-root argument selects another checkout. Do not use `node /tests/verify-packs.cjs .`, which points to an unrelated filesystem-root directory.

The JSON report separates three kinds of checks:

| Kind | What success means |
| --- | --- |
| `regression` | A supported behavior or confirmed fix still works, including canonical/legacy publication configuration, source assembly, current/default preview resolution, import normalization, and corrected defaults. |
| `known-issue` | A documented defect was reproduced; this is not an acceptance pass. |
| `characterization` | A limitation or assessment-policy choice still behaves as documented, such as early theory denominators. |

Every pack JSON file is parsed, including archives and the catalog. Invalid JSON and failed checks cause a nonzero exit, without preventing later checks from being reported. `--strict` additionally exits nonzero while known issues remain reproduced. Invocation/setup errors exit 2. When fixing application behavior, update the associated expectation and promote it to a regression; do not restore an old defect merely to make characterization checks pass.

The verifier executes actual source excerpts with mocked stores/storage and file-backed fetches in Node. It does not prove browser rendering, external service integration, or downstream RESQUER compatibility. Browser smoke testing was attempted for this review but navigation was blocked by environment policy, so no browser pass is claimed.

See the [findings report](RESQUE-Pack-Findings.md) and [recorded verification results](../tests/verification-results.json) for the reviewed snapshot. The report distinguishes fixed issues from remaining defects and decisions, rather than carrying the earlier list forward unchanged.
