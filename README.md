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
