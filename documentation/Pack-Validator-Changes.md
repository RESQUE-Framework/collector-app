# Client-side pack validator

Implemented against the supplied `Archiv(1).zip` on 2026-09-16.

- `utils/pack-validator.js` checks missing indicator references in the assembled forms after configuration selection. It runs in the browser without additional dependencies, network requests, or expression evaluation.
- `index.html` adds a **Pack validation** link in the menu footer and a modal listing all errors and warnings. Startup errors open it automatically after Alpine renders the dialog. Opening the link reruns validation.
- Missing condition/scoring references are errors; missing display-text references are warnings. Results identify the form, indicator, field, reference, and expression/text.
- Selected checkbox options, table rows, comments, metadata references, publication count references, and built-in record fields are recognized. Excluded elements cannot pass validation through leftover defaults.
- All configured output types are checked, including inactive types. Current definitions are checked independently of saved answers and older embedded forms.
- Pack definitions, selection rules, saved-data behavior, and scoring are unchanged.

The default configuration exposes an existing unresolved `$S_Tests_URL` reference in `packs/core-software.json`, at `S_Tests_Quality.options[0].condition`. Consequently, the default setup opens the errors modal even though software is inactive. The rule checks declared references, including fields the current renderer/scorer does not enforce.

## Verification

`node tests/verify-pack-validator.cjs`: **12 tests passed**. Covers real pack assembly, both shipped extensions, include/exclude behavior, retained defaults, generated keys, namespaces, nested expressions, warning severity, and simulated modal startup/reopening.

`node tests/verify-packs.cjs`: results unchanged from the supplied archive: 31 regression checks passed, 6 characterization checks passed, 15 known issues reproduced. Two pre-existing known-issue expectations fail (`PUB-ARCHIVE-ALIAS`, `PREVIEW-VERSION-POINTS`), so this existing suite still exits 1. They already failed before this change.

Visual browser verification remains outstanding: Playwright is available in the execution environment, but its Chromium executable is not installed. The modal lifecycle tests simulate the UI and do not verify layout, focus, or browser rendering.

## Local browser check

From the repository root, run `python3 -m http.server 8000 --bind 127.0.0.1` and open `http://127.0.0.1:8000/index.html`.

1. Confirm that the existing software reference opens the error modal; close it and reopen it using **Pack validation**.
2. Copy `config/config-default.yaml` to `config/config.yaml` if no custom configuration exists. Add `P_Suitable` to `pub.exclude`. Reload and confirm the additional condition/scoring errors.
3. Restore the configuration. Confirm that `?path=EP&type=EP-theory_development` introduces no publication-reference errors when the core remains included.

See the **Browser pack validation** section of [RESQUE-Pack-Guide.md](RESQUE-Pack-Guide.md) for the rule boundaries and extension API.
