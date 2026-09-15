# RESQUE Collector App

A web app for applicants: Enter the [RESQUE](https://www.resque.info) indicators for your 10 best papers.

The live version of the RESQUE Collector App can be found here: [https://resque-framework.github.io/collector-app/](https://resque-framework.github.io/collector-app/).

If you want to create a customized copy of the Collector App, follow the instructions in [How to fork the Collector App repository](How_to_fork.md).

You can add custom items to `packs/user.json`, and include them in `config/config.yaml` in the respective section. For example, to add the user pack to the publications, add the following to `config/config.yaml`:

```yaml
pubs:
  sources: ["packs/core-pubs.json", "packs/user.json"]
  config:
    min_indicators_warning_threshold: 0
```

Then all user items will be presented at the bottom, after the core publication items.



## How to display a full list of indicators

An interactive preview of all indicator packs can be found here: [https://resque-framework.github.io/collector-app/preview.html](https://resque-framework.github.io/collector-app/preview.html)

Use the following URL parameters to customize the preview:

- `type`: The type of indicators to display. Possible values are `pubs` (Publications), `data` (Data Sets), `software` (Research Software), and `meta` (Author Metadata).
- `showPoints`: Whether to display the points for each indicator. Possible values are `true` and `false`.
- `showLabels`: Whether to display the labels for each indicator. Possible values are `true` and `false`.
- `version`: The version of the indicators to display. Possible values are `v0.3.1` and `v0.3.0`. If no version is specified, the latest version will be displayed.
- `path`: A specific path to the indicator pack. This should be relative to the `/packs` directory. For example, to display the archived indicators in `/packs/archive`, use `path=archive`. Defaults to the main `/packs` directory.
  
E.g.:
- https://resque-framework.github.io/collector-app/preview.html?type=pubs&showPoints=true&showLabels=true
- https://resque-framework.github.io/collector-app/preview.html?type=software&showPoints=false
- https://resque-framework.github.io/collector-app/preview.html?path=archive&type=pubs&showPoints=true&version=0.3.1
