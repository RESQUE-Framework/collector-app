# RESQUE Collector App

A web app for applicants: Enter the [RESQUE](https://www.resque.info) indicators for your 10 best papers.

The live version of the RESQUE Collector App can be found here: [https://resque-framework.github.io/collector-app/](https://resque-framework.github.io/collector-app/).

If you want to create a customized copy of the Collector App, follow the instructions in [How to fork the Collector App repository](How_to_fork.md).

## Some preliminary documentation

- The `index.html` is the work horse of the app. It contains the main structure and logic.
- Items are defined in the json files within the `/packs` directory.
  - Most items are in the core-XXX.json files, the expansion packs with discipline-specific items are in the `/packs/EP` subfolder.