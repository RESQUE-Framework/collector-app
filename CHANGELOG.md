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