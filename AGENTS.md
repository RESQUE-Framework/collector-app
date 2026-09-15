# Project Memory: RESQUE Collector App

- The web application entry point is `index.html`; it renders expansion-pack JSON forms with Alpine.js.
- `packs/EP/EP-theory_development.json` is the current theory-development expansion pack (version `5.0.0`, prefix `TH`). It implements the Theory Transparency Checklist v5.0 as 31 elements: four filter radio controls, one not-applicable explanation text field, one info field, and 25 checklist checkboxes (`T1`–`T5`, `F1`–`F5`, `S1`–`S5`, `E1`–`E5`, `C1`–`C5`).
- `index.html` bundles Showdown 2.1.0 from `js/showdown.min.js`. The `renderOptionText()` helper converts Markdown in JSON `options[].text` fields, removing a single outer paragraph wrapper. Dropdown, radio, checkbox, and tabular-radio option renderers call this helper, so inline Markdown such as `*parsimony*` renders in the collector UI.
- Pack content is rendered through Alpine `x-html`; pack authors are therefore trusted. Do not apply Markdown conversion to user-entered responses.
