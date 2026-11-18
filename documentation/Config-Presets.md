# Configuration presets (`preset`)

Implemented on 2026-11-12 against `collector-app` at commit `11213d7`.

## Problem

A deployment sometimes knows an answer that other indicators depend on. The motivating case is a hiring committee: everybody who fills in the form is the applicant, so the `RaterType` question ("Who enters the data?") should not be asked - but `packs/core-meta.json` and `packs/core-pub.json` use `meta$RaterType` in four conditions each, and the applicant-only questions must stay visible.

Neither existing mechanism solves this:

- `exclude` removes the indicator from the selected form. Its default answer does survive assembly (defaults are built before filtering), but `PackValidator` deliberately does not count defaults, so every reference to it becomes a startup error. Relying on that side effect would also be undocumented behavior.
- `"condition": "false"` in the pack contradicts the design rule that deployments edit `config.yaml` only, and a condition-false element is dropped from the export, which would lose the self-reported/external-rater provenance.
- `exists()` cannot help: absence is not equality. With `meta$RaterType` undefined, the negative condition (`meta$RaterType != 'Applicant'`) fires and all applicant-only branches go false.

## Design

`preset` is a per-output-type map in `config.yaml` that **answers** an indicator instead of asking it:

```yaml
meta:
  sources: ["packs/core-meta.json"]
  exclude: []
  preset:
    RaterType: "Applicant"
```

The principle is that a configuration cannot hide an indicator, only answer one; hiding is the consequence of answering. "Hidden but undefined" is therefore unrepresentable, and no separate `hide` key exists.

| | Shown in the form | Available to conditions and scoring | In the export |
| --- | --- | --- | --- |
| Normal indicator | Yes | Yes | Yes, if its condition is true |
| `preset` | No | Yes, the configured value | Yes |
| `exclude` | No | No | No |

## Implementation

| File | Change |
| --- | --- |
| `menu.js` | `applyPresets(pack, typeConfig)` and `presetValueIssue(element, value)`. `menu()` applies presets after `pickAccordingToConfig()`, so a preset can only answer a selected indicator. Valid presets replace `default`, set `hidden: true`, and are expanded with `getDefaultValues()` into `defaultValues` and `presetValues`; the configured values are kept in `presets`, rejected ones in `presetIssues`. |
| `utils/pack-validator.js` | Reports `presetIssues` as `invalid-preset` errors (`field: 'preset'`, `location: config.<type>.preset.<id>`) for every configured output type. Assembly is never blocked by a bad preset. |
| `index.html` | Form loop skips `elem.hidden`; `checkCompletion()` ignores hidden elements; `enforcePresets()` applies preset values to new, restored, imported, and DOI-added records and records the applied presets on the metadata record as `presets`; `filterExport()` keeps that key. |
| `preview.html` | Loads the same configuration (`config.yaml`, falling back to `config-default.yaml`), maps the previewed pack to its configuration section, applies presets, and marks the element with a *hidden · preset: value* badge; the DOCX manual gets the same note. |
| `styles.css` | `.preset-badge`. |
| `config/config-default-committee.yaml` | Committee template: committee limits enabled, welcome message shown, beta warning hidden, example `main_title`, no logo URL, `meta.preset.RaterType: "Applicant"`. |

Preset IDs are matched exactly; `include`/`exclude` match ID prefixes. Presets overwrite answers from local storage and from loaded files, because a hidden answer cannot be corrected in the form. Invalid presets - unknown ID, excluded ID, unknown option ID, a checkbox value that is not a list, `info`/`separator` elements - are skipped and reported.

`config/config-default-committee.yaml` is a template, not a selectable configuration: the loader reads `config/config.yaml` and falls back to `config/config-default.yaml`. Copy it to `config/config.yaml` for a committee deployment. A URL-selectable configuration variant was deliberately not added.

## Verification

- `node tests/verify-pack-validator.cjs`: 18 tests, 17 passed. The failing test (`all selected forms are checked even if the output type is inactive`) is the pre-existing mismatch between the inactive-type policy and `pack-validator.js`; it is unrelated to presets. Six new tests cover the committee configuration, the `exclude` contrast, unchanged pack files, checkbox/table expansion, rejected presets, and forms without preset support.
- `node tests/verify-packs.cjs .`: 61 checks, 0 failures (39 regressions, 16 reproduced known issues, 6 characterizations), exit code 0. New regressions: `PRESET-COMMITTEE`, `PRESET-COMPLETION`, `PRESET-EXPORT`, `PRESET-IMPORT`, `PRESET-NONE`, `PRESET-PREVIEW`.

Both suites run in a VM harness, not a browser; rendering was not verified automatically.

## Local browser check

From the repository root, run `python3 -m http.server 8000 --bind 127.0.0.1`, then:

1. Copy `config/config-default-committee.yaml` to `config/config.yaml` and open `http://127.0.0.1:8000/index.html`. The metadata form shows no "Who enters the data?" question, and the applicant-only merit statement and its separator are present.
2. Open `http://127.0.0.1:8000/preview.html?type=meta&showLabels=true`. `RaterType` carries the *hidden · preset: Applicant* badge.
3. Export the data and confirm that the metadata record contains `"RaterType": "Applicant"` and `"presets": {"meta": {"RaterType": "Applicant"}}`, and no `ExternalRaterName`.
4. Load that exported file after changing `RaterType` to `External` by hand: the form stays in applicant mode and the value is reset.
5. Set `preset: {RaterType: "Rater"}` and reload: the **Pack validation** modal opens with an `invalid-preset` error, and the form falls back to the pack default.
