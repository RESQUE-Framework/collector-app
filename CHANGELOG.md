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