## Pack clean-up after the first validator run (2026-11-19)

Version numbers: a minor bump where scores or answer keys change, a patch bump for text and metadata. Packs that only gained a `status` field keep their version: `EP-clinical_psychology` (`stable`), `EP-theory_development` (`beta`), and `dev/EP-epistemic_goals` (`alpha`), `dev/EP-multidisciplinary` and `dev/EP-practical_relevance` (both `stable`).

- **core-pub 0.9.0 → 0.9.1**: The information text of `P_OpenMaterials` no longer highlights the removed options `YesParts`/`YesEntire`, and its typo is fixed ("beyond reproducible scripts"). Removed the fields `score.op` (`P_Data_Open_AccessLevel`) and `eval_dimension` (`P_IndependentVerification`), which no part of the app reads. Scoring is unchanged.
- **core-software 0.2 → 0.3** (alpha): This changes the scores.
  - `S_License` is now a radio question. An open-source license earns 1 point only together with a URL to the code (`S_URL`); `NoLicense`, `ClosedSource` and a missing URL earn 0. The former condition was inverted, and the license was not scored at all, because dropdowns are not scored (SCORE-06).
  - The `S_Documentation` options earn 0.5 each.
  - New text field `S_Tests_URL` for the URL of the test code.
  - Removed `score.factor`, which the scorer ignored.
- **core-data 0.0.1 → 0.1.0** (alpha): The data set name `D3` was renamed to `D_Name`. This changes the answer key.
- **dev/EP-stimuli 0.1.0 → 0.1.1**: Renamed the separator `stimsep2` to `ST_Stimuli_Separator2` (separators store no answers). Now declares `stable`.
- **user 0.1.0 → 0.1.1**: Renamed the separator `AKZEPTANZ_sep` to `U_AKZEPTANZ_sep`.

## core-software 0.2 and core-data 0.0.1: marked as alpha (2026-11-18)

No content changes and no version bump. Both packs now declare `"status": "alpha"`. Their known problems are listed by *Pack validation* but never block the collector, and `preview.html`/`packs.html` show an *alpha* badge (see `documentation/RESQUE-Pack-Guide.md`, "Pack metadata").

## core-pubs version 0.9.0 (2026-03-09)

No real content changes; just bumping the version to indicate the new scoring export (needs the RESQUER package >= 0.10.0)

## core-pubs version 0.8.2 (2025-11-19)

Add minor non-breaking changes based on FG Methoden feedback

## core-pubs version 0.8.1 (2025-11-18)

- Updates from the CP2 study + some minor updates from the TU Chemnitz.
- Updated Power Analysis item


## core-pubs version 0.7 (2025-03-28)

### New indicators

- Two items for meta-analysis quality criteria (P_Data_PRISMA and P_Data_MetaAnalysisRaters). For the moment they are assigned to the "P_Data" rigor category, but they could be moved to a new "P_Methods" rigor category.

### Adjusted indicators

- Added two new options to `P_Data_Open`:
  - {
        "id": "YesSynthetic",
        "text": "A synthesized dataset with statistical properties similar to the original data is available [provide doi or URL]"
    },
    {
        "id": "YesAggregate",
        "text": "Only aggregated data that could be shared is available, because primary data could not be shared [provide doi or URL]"
    }


### Improved / bigf fixes

- Improved wording based on feedback by Uni Eichstätt and Clinical OS group
- Fixed a special condition in P_Data_Open where points could be gained even without open data.