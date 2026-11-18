# Client-side pack validator

## Full rule set, command line and validator page (2026-11-18)

Implements the validator wishlist (#136). Decisions: the dialog keeps opening on blocking errors (no new configuration key); the ID-prefix rule is a warning everywhere, with a fixed built-in list of the 37 existing unprefixed core IDs; there is no way to silence a rule; answer validation (#45, #103) stays a separate project.

- **Code moved out of `index.html`** (no behaviour change): `utils/expressions.js` (condition shorthand and reference substitution) and `utils/assemble.js` (`use()`, `pick*`), so the command line and `validator.html` run the same code.
- **`utils/pack-validator.js`:** a rule list (`rules`: code, severity, hint) and checks of each pack file (`lintPack`) and of the assembled forms (`validate`); `checkPackFiles` checks files outside a configuration. All rules are listed in [RESQUE-Pack-Guide.md](RESQUE-Pack-Guide.md#validator-rules). Results carry the pack file, line, rule code and fix hint. New severity *notice* (shown collapsed, never counted, never blocking). Expressions are compiled to check their syntax, never run. `use()` hands each fetched file to the validator, which checks the file as written (presets change the assembled elements); in the collector, problems of excluded elements are not reported. Archived packs are only checked for valid JSON.
- **Issue items covered:** missing dependencies (#126, #130), list comparisons such as `$CP_RCT != ['Yes']` (RESQUER#39), generated answer-key collisions such as option `Other` vs. element `X_Other` (#133), options without `value` once another option has points (#136), IDs without the pack prefix (#136), forward references in visibility conditions (#14, as notices).
- **Dialog:** line, rule code (linked to the guide), fix hint, a *Notices* group, a link to `validator.html`.
- **`validator.html`** (logic in `utils/validator-page.js`): checks this app's configuration, all configured and catalogued packs, and a pack file chosen or dropped by the user (read locally). Reports are built from text nodes only.
- **`scripts/validate-packs.cjs`:** configuration, `--all`, or given pack files (with core-meta/core-pub as companions; `--alone`, `--with`); `--format text|json|github`, `--strict`, `--notices`; exit codes 0/1/2.
- **`.github/workflows/validate-packs.yml`:** runs the command-line validator with GitHub annotations and the validator tests.

Findings in the shipped packs:
- The stable packs have no errors.
- `core-pub.json`: the information text of `P_OpenMaterials` highlights the option IDs `YesParts`/`YesEntire`, which no longer exist (2 warnings). Tracked as known issue PUB-03 (`OM-STALE-HIGHLIGHT` in `tests/verify-packs.cjs`); the pack text was not changed.
- `user.json`: `AKZEPTANZ_sep` lacks the `U_` prefix (warning).
- The alpha packs (`core-software`, `core-data`, `packs/dev/`) have known problems listed as not blocking.
- The default configuration has 0 blocking errors.

Verification:
- `node tests/verify-pack-validator.cjs`: 49 tests, all pass - rule tests (one clean and one failing case per rule), the shipped packs, the dialog markup and the validator page logic.
- `node tests/verify-validate-cli.cjs`: 9 tests, all pass - the command line with fixtures in `tests/fixtures/` (exit codes, formats, strict mode, alpha packs, invalid JSON, `--all`).
- `node tests/verify-packs.cjs .`: 75 checks (52 regressions, 17 reproduced known issues including the new PUB-03, 6 characterizations), exit 0.
- `validator.html` and the dialog were rendered in jsdom with the bundled scripts: configuration, all packs, an own file (including an HTML-injection attempt, which stays text). Layout in a real browser was not checked.

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
