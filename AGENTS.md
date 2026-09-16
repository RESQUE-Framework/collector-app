# RESQUE Collector App — agent guidance

Reviewed against the uploaded repository on 2026-09-16. Current findings and their verification cases are tracked in [documentation/RESQUE-Pack-Findings.md](documentation/RESQUE-Pack-Findings.md).

## Scope and source of truth

- The central pack is `packs/core-pub.json`; the active scorer is **`utils/score2.js`**. `utils/archive/score.js` is deprecated. Do not use it to infer current semantics or implement new scoring.
- `Documentation_notes.md` is incomplete and partly outdated, especially its explanation of `score.condition` and maximum points. Trace active code when resolving discrepancies.
- Keep edits focused on the task. Explain changes to both earned and possible points: applicability, weights, and aggregation are assessment-policy decisions, not merely UI changes.
- Preserve stable answer IDs and saved-data compatibility. For intentional renames, consider `utils/keyalias.js`, conditions, category cues, exports, and downstream consumers. Preserve pack provenance and citations.
- The developer uses macOS and Positron. Prefer portable commands, concise explanations, and English pack documentation.

## Software architecture and local development

Static browser application: Alpine.js, ordinary JavaScript, JSON packs, YAML configuration. The reviewed repository has no `package.json`, npm build, or configured test runner. Do not invent npm installation/build/test requirements.

| File | Responsibility |
| --- | --- |
| `index.html` | Collector entry point; Alpine stores/renderers; UI expression/text helpers; form assembly; completion, persistence, import/export |
| `menu.js` | Combine configured pack sources and apply include/exclude selection |
| `utils/score2.js` | `score(output, meta, categoriesOverride)`, `scoreAll(records, categories)`, separate scoring expression evaluator |
| `utils/packutils.js` | `getDefaultValues(elements)`; initializes answers, not expressions or scores |
| `utils/pack-validator.js` | Client-side missing-reference checks on selected forms; structured errors and warnings for the collector modal |
| `utils/prefixtree.js` | Visual indentation from ordered, underscore-separated IDs |
| `utils/keyalias.js` | Historical answer-key renaming on import |
| `utils/charts.js` | Chart.js category charts from score/max ratios |
| `utils/doi.js`, `utils/orcid.js` | External DOI metadata and ORCID requests |
| `preview.html`, `packs.html`, `builder.html` | Pack preview, pack listing, configuration-link builder |
| `config/config-default.yaml` | Default configuration; `config/config.yaml` overrides it when available |
| `styles.css`, `indicator-styles.css` | Application and indicator presentation |

- Bundled dependencies in `js/` include Alpine.js, Chart.js, Showdown 2.1.0, js-yaml, LZ-String, Driver.js, and JS-Confetti. Avoid editing bundled libraries for pack changes and prefer local dependencies. Do not claim the whole repository is offline-ready: `preview.html` still loads Alpine and its manual-export library from CDNs, `packs.html` fetches a remote legacy catalog, and the collector attempts analytics and a configured remote logo in addition to DOI/ORCID requests. See UI-03 and TOOL-01 in the findings report.
- `score2.js` is a **classic script**, not an ES module. Helpers such as `packutils.js` use ES exports; `index.html` imports them and exposes functions through `window`. Preserve this distinction when testing/refactoring.
- Serve over HTTP for `fetch()` and browser modules. With Python 3 available, run from the repository root:

  ```bash
  python3 -m http.server 8000 --bind 127.0.0.1
  ```

  Open `http://127.0.0.1:8000/index.html`. Preview the core with `preview.html?type=pub&showPoints=true&showLabels=true`; an extension with `preview.html?path=EP&type=EP-clinical_psychology&showPoints=true&showLabels=true`.
  
- Preview is for content/layout; test conditional behavior and scores in the collector with the required packs loaded. Collector `type`/`path`/`version` selection appends expansion/custom packs to `config.pub.sources`. For example, `?path=EP&type=EP-theory_development` retains the configured core and appends the theory pack; repeating that exact extension path does not append it again. This is not general source or ID deduplication (PUB-02).
- Explicit `core-*` selections replace publication sources. The selector operates on the publication form even for `meta`, `data`, or `software` aliases; configure those output types through their own sections instead. For historical publication packs, use the actual historical name, e.g. `?path=archive&type=core-pubs&version=0.8.2`. The canonical `type=pub` archive alias currently requests a nonexistent renamed file; old unversioned `type=core-pubs` links work in the collector but not preview (PUB-01). Custom configurations must retain the core when extensions depend on it.
- Alpine `<template>` output needs one root element; wrap siblings. Keep collector and preview option renderers consistent.
- `renderOptionText()` converts Markdown in `options[].text` and removes one outer paragraph wrapper. Dropdown, radio, checkbox, and tabular-radio options use it. Other text follows separate HTML/interpolation helpers.
- Pack content is trusted: it reaches `x-html`, and conditions reach `eval()`. Do not apply Markdown/HTML interpretation or expression evaluation to user-entered responses.
- `scripts/reexport.js` imports the nonexistent `utils/score` path, uses an old scoring API, mixes module conventions, and does not await its metadata updates before writing. It is not a current migration or validation command (TOOL-01).

## Packs and configuration

| Pack | Reviewed role/version |
| --- | --- |
| `packs/core-pub.json` | `P`, `0.9.0`; 99 elements, 12 scored elements |
| `packs/core-meta.json` | `M`, `0.3.0`; shared applicant/rater metadata |
| `packs/core-software.json` | `S`, `0.2`; research software, with scoring limitations below |
| `packs/core-data.json` | `D`, `0.0.1`; one unscored text field |
| `packs/user.json` | `U`; example custom questions |
| `packs/EP/EP-clinical_psychology.json` | `CP`, `0.2.1`; 16 elements, 5 scored elements; depends on publication-core answers |
| `packs/EP/EP-theory_development.json` | `TH`, `5.0.0`; 34 total elements: 25 scored checkboxes, 4 filter radios, 1 explanation, 1 info element, 3 separators |
| `packs/dev/` | Development packs for epistemic goals, multidisciplinarity, practical relevance, stimuli |
| `packs/archive/` | Historical definitions; some have incompatible top-level `scoring` structures |
| `packs/info.json` | Preview/discovery catalog array, not a questionnaire |

The theory checklist has five groups: theorizing (`T1`–`T5`), formalization (`F1`–`F5`), simulation (`S1`–`S5`), empirical evaluation (`E1`–`E5`), comparison (`C1`–`C5`). Preserve its filter dependencies.

- Packs normally define `prefix`, `version`, `date`, `title`, and ordered `elements`. License/creator/citation fields describe provenance, not scoring.
- Activate packs through configuration `sources`. For publication extensions, normally retain `packs/core-pub.json` first and append the extension. Adding to `info.json` alone does not load a pack in the collector.
- `use()` concatenates elements in source order, keeps the first title, records versions/dates by prefix, and merges defaults. It does not deduplicate IDs; later defaults overwrite earlier values with the same key.
- Configuration, stored publication records (`type: "pub"`), and assembled forms (`forms.pub`) use **`pub`**. The current file is **`packs/core-pub.json`**. Other types are `meta`, `software`, and `data`; pack prefix `P` and answer IDs have not been renamed.
- `normalizePublicationConfig()` uses legacy `pubs` only when `pub === undefined`; an existing `pub` section wins. It retains the legacy property rather than deleting it and maps the exact source `packs/core-pubs.json` to `packs/core-pub.json`. The config loader, `menu()`, and imported `forms.config` use this helper; `use()` also applies the exact source alias. This is not arbitrary path normalization, query-namespace migration, or migration of invented `type: "pubs"` records.
- Preserve `packs/archive/core-pubs-0_3_1.json`, `packs/archive/core-pubs-0_8_2.json`, their catalog entries, and historical changelog labels. Do not perform a global `pubs` replacement. Write new conditions as `config$pub.active` and per-type URL overrides as `pub:<setting>`. Avoid combining old and new spellings of the same source; normalized duplicates are currently loaded twice (PUB-02).
- Defaults enable publications and disable software/data. `menu()` still assembles inactive types' configured sources; `active: false` does not mean “skip loading.”
- `include`/`exclude` use `startsWith()`, not exact equality. Excluding `P_Data` also excludes descendants and any other IDs with that prefix.
- `exclude` wins over `include`, even when `exclude: []`. Remove it when using `include`. An empty `include: []` selects everything.
- Defaults are built **before** filtering and survive element exclusion. Dependencies are not automatically included: retain parent questions or deliberately provide suitable defaults.
- The collector validates selected forms after assembly with `PackValidator.validate(forms)`. Excluded indicators are reported even if their default answers survive. Missing expression/scoring references are errors; missing display-text references are warnings. All configured types are checked, including inactive types. The footer's **Pack validation** link rechecks and opens the results; startup errors automatically open the dialog after Alpine renders it. This check does not inspect saved answers or change scoring. Run `node tests/verify-pack-validator.cjs` for focused regressions.

## Schema, IDs, and answers

- Use unique prefixes and stable IDs such as `<Prefix>_<Name>_<Subcategory>`. `prefix` does not prepend or namespace IDs. Preserve established exceptions such as `DOI`, `Title`, and metadata keys.
- Use letters, digits, and underscores for expression-referenced IDs. Avoid collisions with generated option/row keys: checkbox `EX_Check` with option `A` already owns `EX_Check_A`.
- Element order controls display order. Underscores and neighboring IDs affect indentation only. Children do not inherit parent visibility, applicability, or scoring rules.

| Element type | Stored answer | Direct scoring |
| --- | --- | --- |
| `text`, `textbox`, `number`, `date` | `<id>` | None |
| `radio` | `<id>` = selected option ID | Selected option value |
| `dropdown` | `<id>` = selected option ID | None |
| `checkbox` | `<id>_<optionID>` = boolean per option | Sum of checked option values |
| `tabular_radio` | `<id>_<rowID>` = selected option ID per row | None |
| `info`, `separator` | Normally no answer | None |

- Radio answers store IDs, not labels/points. Checkbox groups are **not arrays** under a parent key.
- `number` currently renders a text input; answers may be numeric strings. Convert explicitly when strict numeric semantics matter.
- Presentation fields include `title`, `text` (info body), `info`, `background`, `tip_external`, `alignment`, `style_classes`, `no_comment`.
- `optional` affects completion, not scoring. `validation.pattern`/`condition`/`message` and textbox `maxwords` produce warnings; they do not automatically block scores/export. `maxwords` does not truncate text.
- `min_selected` and option-level `explanation_required` are not enforced. The scorer ignores `score.op`, `score.factor`, option-level `condition`, and legacy top-level `scoring` rules.

## Expression language

Conditions are **expression strings**. `index.html` and `score2.js` independently expand sugar, substitute references, then call JavaScript `eval()`. `packutils.js` does none of this.

| Reference | Meaning | Support |
| --- | --- | --- |
| `$Field` | Answer in the evaluated output | UI and scoring |
| `meta$Field` | Answer in the first metadata record | UI and scoring |
| `config$setting`, `config$pub.active` | Configuration, including nested paths | UI only |

```js
// Equals ANY listed scalar value:
$Answer =|= ['A', 'B']
// Expands to: ($Answer === 'A' || $Answer === 'B')

// Negated membership; explicit grouping is clearer:
!($Answer =|= ['A', 'B'])
// Existing !$Answer =|= ['A', 'B'] also negates the expanded group.

// All specified checkboxes selected:
$EX_Check_A && $EX_Check_B
```

- `=|=` and `=&=` are custom syntax, not JS operators. 
- Ordinary comparisons, `===`, `!==`, `&&`, `||`, `!`, and parentheses work after preprocessing. Prefer strict equality and grouping. Quote option IDs, usually with single quotes inside JSON strings.
- `exists(value)` is `!!value && value !== ""`: false for missing/null/false/numeric zero/empty string; true for `"0"`, `"No"`, whitespace, and arbitrary nonempty text. It does not validate URLs or explanations.
- Omitted/empty conditions evaluate as true. Use `"condition": "false"` for explicit false, not JSON boolean `false`.
- Missing `$Field` becomes `undefined`; `$Field !== 'No'` then passes. Bare `Field` generally throws a reference error.
- Sugar is regex replacement plus comma splitting, not a parser. Use one simple field token and a nonempty single-line list of simple literals. Avoid embedded commas, nested lists, complex operands, and dotted configuration paths with sugar. Empty `[]` becomes invalid `()`; replacements are not string-literal-aware. Evaluation errors are not caught locally.
- When changing expression support, inspect **both** evaluators. Do not use `config$...` in scoring until it is implemented explicitly.
- Text interpolation is separate: `$Title`, `$date_added@datetime`, `config$max_top_papers`, `global$P_TopPaper_Select@paper_count`.
- Highlighting uses `{ condition | text }`; false keeps unhighlighted text. Indicator-context shorthand `{:'Lead', 'Equal' | text}` compares that indicator's answer. Because `|` is the delimiter, avoid `=|=`/`||` inside the brace condition. Colon shorthand is not a general condition expression.

## Scoring semantics

| Field | Effect in shipped definitions |
| --- | --- |
| Element `condition` | Visibility, completion, parts of export; **not a scoring gate** |
| `score.condition` | Gates earned points; false **retains possible points** |
| `score.not_applicable` | True removes both earned and possible points |

- Hidden, unanswered, zero-point, and not-applicable are different states. Hiding does not clear answers. Parent rules do not propagate.
- First exclude items with a true `score.not_applicable`. Otherwise, radio maximum = highest option value; checkbox maximum = sum of all option values.
- Radio points come from the matching selected option. Checkbox points require exactly boolean `true`, not `"true"`. Missing/falsy option values contribute zero. Use finite nonnegative numeric values and nonempty option lists.
- A `score` object is not required: radio/checkbox option values alone activate scoring. Dropdown/table values are ignored.
- Missing/empty `score.condition` permits earning. False gives zero earned points with the full maximum. Unanswered items usually remain in the denominator.
- The early guard `if (el.score?.score && !evaluateCondition(el.score.condition)) return;` uses a property absent from shipped definitions. Do not add `score.score` as a workaround or mechanically change the guard without establishing denominator policy.
- Require evidence explicitly. For justified N/A, test the answer and explanation in `score.not_applicable`. To withhold points pending evidence, use `score.condition`. Neither labels nor `explanation_required` enforce these checks.

Example: `P_ReproducibleScripts` has maximum 1. `YesEntire` with an identifier earns 1/1; without it, 0/1. `YesParts` earns 0/1. `NotApplicable` without explanation gives 0/1; with a truthy explanation, exclusion.

Core maxima: `P_IndependentVerification` and `P_Preregistration` each 2; `P_ReproducibleScripts_FAIR` 1.4; these nine each 1: `P_Methods_PRISMA`, `P_Methods_MetaAnalysisRaters`, `P_Data_Open_AccessLevel`, `P_Data_Open_FAIR`, `P_ReproducibleScripts`, `P_OpenMaterials`, `P_Preregistration_Content`, `P_Preregistration_Replication`, `P_Methods_PowerAnalysis`.

Nominal sum: 14.4; actual denominator depends on applicability. `P_Suitable = 'No'` excludes all scored core publication items. Extensions add points to the same total, with no automatic equal pack weighting. Theory can add 25 points.

### Totals and categories

- `score()` reads **`meta.forms[output.type]`**, not pack files directly. Returns `max`, `score`, `relative`, one-decimal string `percentage`, `items`, `categories`, DOI, and `P_MultiStudy_Selected`. Study selection is carried through, not separately scored. Missing form returns `{}`; zero maximum produces relative 0 and `"0.0"`.
- `scoreAll()` treats record 0 as metadata, scores all subsequent records, and excludes missing forms/zero maxima from the overall mean. It does not restrict scoring to publications or top papers.
- Overall relative score is the **unweighted mean of output ratios**: 1/1 and 0/9 give 50%, not pooled-points 10%.
- `score_categories[].cue` is a regex on element IDs. Categories sum matching item points/maxima. Cues can overlap; unmatched items still affect the total.
- Overall categories pool category points/maxima across outputs, unlike the mean used for overall percentage. Charts need not average to the overall percentage.
- Nonempty category overrides win; otherwise use `meta.forms[type].config.score_categories`, falling back to `meta.forms.config.score_categories`. The collector passes publication categories to `scoreAll()` for every type.
- Default cues do not match `TH_...` items. Add a category if theory should appear in charts. Preserve established titles where downstream RESQUER reporting depends on them.

## Defaults and saved data

- Data is an array: metadata at index 0, then typed outputs. Metadata embeds assembled `forms` and query configuration.
- **The defaults defect formerly called F6 in this file is fixed.** `getDefaultValues()` detects own-property presence, preserves explicit scalar defaults including `0`, `false`, `""`, and `null`, and ignores inherited defaults. Missing scalar values start as `""`.
- Every checkbox option gets a boolean, including unselected options when an explicit selection is provided. Checkbox defaults must be arrays of valid option IDs; invalid shapes or unknown IDs throw. Missing/empty selections initialize all options to `false`.
- Table rows use their own default when present, including falsy values; otherwise they inherit the element default or `""`. Information elements and separators never initialize an answer, even with explicit defaults. Protect these fixes with the `DEFAULT-*` regression checks. Generated-key export handling is a separate, still-open problem (DATA-01).
- Visibility changes do not reset answers/defaults. Completion, validation, and scoring are independent.
- localStorage holds records under `'data ' + main_title`; sessionStorage holds current-tab state. Use an isolated browser profile/test data for fresh initialization checks and preserve real saved records.
- Existing records can retain old embedded form definitions while the UI uses newly loaded forms. Changing a pack does not guarantee old records use new scoring. Inspect embedded definitions and plan migrations deliberately.
- Import applies aliases/defaults, but currently obtains defaults from the previously open dataset's embedded form, not the incoming form. UI/completion/export use the current form store while scoring can use old embedded forms. Choose a deliberate form/version migration policy before changing this behavior (DATA-02).
- Export filters keys and embeds current forms. Hidden checkbox/table answers can survive filtering while hidden scalar defaults are omitted (DATA-01). Completion incorrectly counts missing scalar/table-parent keys as filled and divides by zero when there are no required fields (UI-01). Verify answer and score consistency across save/load/export/import, not just successful parsing.

## Verification workflow

Use checks proportional to the edit; wording-only changes do not need a new test suite. For behavior changes:

1. Parse changed JSON, e.g. `python3 -m json.tool packs/core-pub.json > /dev/null`. 
2. Check unique IDs, generated-key collisions, condition references, valid options/defaults, and core/extension dependencies. Update version/date for releases and catalog entries when appropriate.
3. Exercise unanswered, negative, positive-without-evidence, positive-with-evidence, and justified/unjustified N/A states. Assert **earned and possible points separately**.
4. Populate children, then change parent answers so children disappear. Check retained answers, points, denominator, completion, and export.
5. For defaults/import changes, cover falsy/empty defaults, table rows, older records, embedded form versions, and export/import score consistency.
6. For rendering changes, check collector and preview, including Markdown options and CRediT row help/highlighting. Use local fixtures for external metadata where possible.

The repository includes a dependency-free Node verifier:

```bash
# From the repository root; the default root is relative to the script itself.
node tests/verify-packs.cjs
node tests/verify-packs.cjs . > tests/verification-results.json

# Also fail when known defects are reproduced, not only on regressions/invalid JSON.
node tests/verify-packs.cjs --strict
```

From another directory, invoke the script by its path; an optional repository-root argument selects another checkout. Do not use `/tests/verify-packs.cjs` as a filesystem-root path.

The JSON report separates **regressions**, **known issues**, and **characterizations** (limitations/policy choices), parses all pack JSON including archives/catalog, and records runtime source hashes. Assertions continue after individual failures. Normal mode exits nonzero for failed checks or invalid JSON; `--strict` also exits nonzero for reproduced known issues. Setup/argument errors exit 2. A normal-mode exit 0 does **not** mean the application has no defects. After a runtime fix, update its expectation and promote the relevant check to a regression rather than restoring the defect.

The verifier executes actual helper/query-loader excerpts in isolated Node VM contexts with file-backed fetch and mock stores/storage. It is not a full browser test, DOM/layout audit, security sandbox, or external-report validation. The 2026-09-16 review attempted browser smoke tests but environment policy blocked navigation; do not describe them as passed. Use the fresh findings report for the measured results and remaining manual checks.



# Project Memory: RESQUE Collector App

- The web application entry point is `index.html`; it renders expansion-pack JSON forms with Alpine.js.
- `packs/EP/EP-theory_development.json` is the current theory-development expansion pack (version `5.0.0`, prefix `TH`). It implements the Theory Transparency Checklist v5.0 as 34 total elements: four filter radio controls, one not-applicable explanation text field, one info field, three separators, and 25 checklist checkboxes (`T1`–`T5`, `F1`–`F5`, `S1`–`S5`, `E1`–`E5`, `C1`–`C5`).
- `index.html` bundles Showdown 2.1.0 from `js/showdown.min.js`. The `renderOptionText()` helper converts Markdown in JSON `options[].text` fields, removing a single outer paragraph wrapper. Dropdown, radio, checkbox, and tabular-radio option renderers call this helper, so inline Markdown such as `*parsimony*` renders in the collector UI.
- Pack content is rendered through Alpine `x-html`; pack authors are therefore trusted. Do not apply Markdown conversion to user-entered responses.
