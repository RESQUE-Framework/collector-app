# Client-side pack validator

## Pack status and blocking problems (2026-11-18)

Packs can declare their maturity, and only problems that matter for a deployment block the collector.

- **Pack files:** an optional top-level `"status"`: `"alpha"`, `"beta"` or `"stable"`. Without it, packs in `packs/dev/` count as alpha, all others (including `packs/archive/`) as stable. `packs/core-software.json` and `packs/core-data.json` are now `"status": "alpha"`.
- **`utils/pack-validator.js`:**
  - New helpers `packStatus(pack, source)`, `packInfo(pack, source)`, `packStatuses` and `statusNotes`.
  - `validate()` now checks every configured output type, including `active: false` ones. This resolves the old mismatch between code, test and documentation: the code skipped inactive types although everything else said they were checked.
  - Every issue gets `pack`, `packStatus`, `formActive`, `deferred` (`null`, `'inactive'`, `'alpha'` or `'beta'`) and `blocking`. Only errors in stable packs of active output types block. Preset errors block in any active type.
  - New result codes `immature-pack` (one current warning per alpha/beta pack in an active type) and `invalid-pack-status` (error).
  - The report adds `current`, `deferred` and `blocking`; `errors` and `warnings` still contain all issues.
- **`index.html`:**
  - `use()` records `packs` (source, prefix, version, status, `declaredStatus` if present, element IDs) on each assembled form, and the pick functions keep it. The list is exported with the forms; RESQUER does not read it.
  - The modal opens on startup, and the tour is skipped, only for **blocking** errors. The modal lists current problems first and collapses the rest under *Not blocking*, with the reason and an alpha/beta badge.
  - The footer link shows e.g. *(1 error, 2 warnings, 3 not blocking)*.
- **`preview.html`, `packs.html`, `styles.css`:** an *alpha*/*beta* badge and a short note next to the pack title. The preview's exported manual carries `[ALPHA]` and the note. Both pages load `utils/pack-validator.js` for the shared status logic.

Effect on the default setup: the `$S_Tests_URL` reference in the software pack is listed under *Not blocking* (software is inactive and alpha). The dialog does not open, contrary to what the 2026-09-16 notes below say.

Verification:
- `node tests/verify-pack-validator.cjs`: 28 tests, all pass (previously 17 of 18). Ten new tests cover:
  - status resolution
  - the shipped pack statuses
  - recorded provenance after include
  - the blocking matrix
  - an activated alpha software pack
  - presets in alpha packs
  - invalid status values
  - startup with alpha vs. stable errors and the footer counts
  - modal order
  - the preview/catalog badges
- A negative control, with the startup condition reverted to `errors`, fails the two startup/modal tests.
- `node tests/verify-packs.cjs .`: unchanged at 74 checks (52 regressions, 16 reproduced known issues, 6 characterizations), exit 0. Its VM context now loads `utils/pack-validator.js`, as `index.html` does.
- A jsdom render with the bundled Alpine confirmed the link text, summary, current/deferred lists and badges. Layout in a real browser was not checked.

## Initial version (2026-09-16)

Implemented against the supplied `Archiv(1).zip` on 2026-09-16.

- `utils/pack-validator.js` checks missing indicator references in the assembled forms after configuration selection. It runs in the browser without additional dependencies, network requests, or expression evaluation.
- `index.html` adds a **Pack validation** link in the menu footer and a modal listing all errors and warnings. Startup errors open it automatically after Alpine renders the dialog. Opening the link reruns validation.
- Missing condition/scoring references are errors; missing display-text references are warnings. Results identify the form, indicator, field, reference, and expression/text.
- Selected checkbox options, table rows, comments, metadata references, publication count references, and built-in record fields are recognized. Excluded elements cannot pass validation through leftover defaults.
- All configured output types are checked, including inactive types. Current definitions are checked independently of saved answers and older embedded forms.
- Pack definitions, selection rules, saved-data behavior, and scoring are unchanged.

The default configuration exposes an existing unresolved `$S_Tests_URL` reference in `packs/core-software.json`, at `S_Tests_Quality.options[0].condition`. Consequently, the default setup opens the errors modal even though software is inactive. *(Superseded: the code actually skipped inactive types, so the modal did not open; since 2026-11-18 the reference is listed as not blocking.)* The rule checks declared references, including fields the current renderer/scorer does not enforce.

## Verification

`node tests/verify-pack-validator.cjs`: **12 tests passed**. Covers real pack assembly, both shipped extensions, include/exclude behavior, retained defaults, generated keys, namespaces, nested expressions, warning severity, and simulated modal startup/reopening.

`node tests/verify-packs.cjs`: results unchanged from the supplied archive: 31 regression checks passed, 6 characterization checks passed, 15 known issues reproduced. Two pre-existing known-issue expectations fail (`PUB-ARCHIVE-ALIAS`, `PREVIEW-VERSION-POINTS`), so this existing suite still exits 1. They already failed before this change.

Visual browser verification remains outstanding: Playwright is available in the execution environment, but its Chromium executable is not installed. The modal lifecycle tests simulate the UI and do not verify layout, focus, or browser rendering.

## Local browser check

From the repository root, run `python3 -m http.server 8000 --bind 127.0.0.1` and open `http://127.0.0.1:8000/index.html`.

1. Confirm that the dialog does not open on startup and that the footer link reads *Pack validation (1 not blocking)*. Open it: the `$S_Tests_URL` error is under *Not blocking* with the reason "the software output type is inactive" and an *alpha* badge. Set `software: active: true` in `config/config.yaml`: the error stays non-blocking and an `immature-pack` warning appears among the current problems.
2. Copy `config/config-default.yaml` to `config/config.yaml` if no custom configuration exists. Add `P_Suitable` to `pub.exclude`. Reload and confirm the additional condition/scoring errors.
3. Restore the configuration. Confirm that `?path=EP&type=EP-theory_development` introduces no publication-reference errors when the core remains included.

See the **Browser pack validation** section of [RESQUE-Pack-Guide.md](RESQUE-Pack-Guide.md) for the rule boundaries and extension API.
