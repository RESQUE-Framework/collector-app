# RESQUE Collector App

A web app for applicants: Enter the [RESQUE](https://www.resque.info) indicators for your 10 best papers.

The live version of the RESQUE Collector App can be found here: [https://resque-framework.github.io/collector-app/](https://resque-framework.github.io/collector-app/).

If you want to create a customized copy of the Collector App, follow the instructions in [How to fork the Collector App repository](How_to_fork.md).

You can add custom items to `packs/user.json`, and include them in `config/config.yaml` in the respective section. For example, to add the user pack to the publications, add the following to `config/config.yaml`:

```yaml
pub:
  sources: ["packs/core-pub.json", "packs/user.json"]
  config:
    min_indicators_warning_threshold: 0
```

Then all user items will be presented at the bottom, after the core publication items.



## How to display a full list of indicators

An interactive preview of all indicator packs can be found here: [https://resque-framework.github.io/collector-app/preview.html](https://resque-framework.github.io/collector-app/preview.html)

Use the following URL parameters to customize the preview:

- `type`: The type of indicators to display. Possible values are `pub` (Publications), `data` (Data Sets), `software` (Research Software), and `meta` (Author Metadata).
- `showPoints`: Whether to display the points for each indicator. Possible values are `true` and `false`.
- `showLabels`: Whether to display the labels for each indicator. Possible values are `true` and `false`.
- `version`: The version suffix in the pack filename, without a leading `v` (for example, `0.3.1` for the archived publication pack). If no version is specified, the unversioned pack is displayed.
- `path`: A specific path to the indicator pack. This should be relative to the `/packs` directory. For example, to display the archived indicators in `/packs/archive`, use `path=archive`. Defaults to the main `/packs` directory.
  
E.g.:
- https://resque-framework.github.io/collector-app/preview.html?type=pub&showPoints=true&showLabels=true
- https://resque-framework.github.io/collector-app/preview.html?type=software&showPoints=false
- https://resque-framework.github.io/collector-app/preview.html?path=archive&type=pub&showPoints=true&version=0.3.1

## Demoing/Testing a specific pack

With the same query strings as above, you can extend the settings in `config.yaml` and tell the regular app to append a specific pack to the core-pub set, e.g.:

<https://resque-framework.github.io/collector-app/index.html?path=EP&type=EP-theory_development>
