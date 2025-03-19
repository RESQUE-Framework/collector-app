# How to create a customized copy ("fork") of the RESQUE Collector App

We assume the following:

- You have a GitHub account
- You have a basic understanding of Git


## Step 1: Fork the Collector App repository

1. Go to the [Collector App repository](https://github.com/RESQUE-Framework/collector-app)
2. Click on the "Fork" button in the top right corner of the page
3. Select your GitHub account as the destination for the fork

In the example, we used the GitHub organization `RESQUE-Framework` account to fork the Collector App repository. Choose a meaningful repository name for your fork, e.g., `collector-app-MYUNIVERSITY`. I chose the version for Uni Eichstätt as an example:

![](img/fork1.png)

Select "Copy the `main` branch only".

## Step 2: Enable GitHub Pages

In order to have a working website, you need to enable GitHub Pages for your fork.

1. Go to the *:gear: Settings* of your forked repository, and then on the left menu to *Pages*.
2. Select "Deploy from a branch", choose the `main` branch and select :file_folder: / (root). Click on the "Save" button:

![](img/fork2.png)

3. In the main tab menu, go back to the main page of your forked repository ("Code").
4. On the top right, click on the Gear icon to access the settings of your repository.

![](img/fork3.png)

5. Add a description. Select "Use your GitHub Pages website" (do not enter anything in the Website field; it will get disabled as soon as you click "Use your GitHub Pages website"). Click "Save changes".

![](img/fork4.png)

6. Go back to the main page of your repository and click on the link to your GitHub Pages website (below the gear on the right side). It should look like this: `https://<your-github-username>.github.io/collector-app-MYUNIVERSITY/`.

> :bulb: **This is the link you will distribute to your applicants.**


## Step 3: Customize the Collector App

1. In the main menu, go to the *Code* tab and click on the *menu.js* file
2. Click on the pencil icon to edit the file

![](img/fork5.png)

3. Make adjustments:
   1. In line 4, change `main_title: "RESQUE"` to `main_title: "RESQUE MYUNIVERSITY"`. This makes your app visually distinguishable from the generic Collector App.
   2. In line 5, you can change `max: 10` to the maximum number of publications that your committee expects.
   3. In line 6, you can change `maxTopPapers: 3` to how many papers can be selected as "best papers"

4. In the same way, edit the file `packs/core-meta.json`. Search for "AcademicAgeBonus" and change the field `"title"` of that node. Define which life circumstances are valid to count towards a reduction of academic age (e.g.: "We consider the following life circumstances as valid for a reduction of academic age: Parental leave, long-term illness, refugee or migrant status-related interruptions, and natural disasters or geopolitical events.").

5. Click on the green "Commit changes..." button at the top right of the page. In the pop-up window, you can add a description of the changes you made (or just keep the default commit message) and click "Commit changes". Then the changes are saved to your repository.

Of course, if you know git, you can clone the repository to your local machine and make the changes there. Then you can push the changes back to your forked repository.

> :bulb: Any changes will take a few minutes until they are visible online under your custom link. Furthermore, you have to do a **reload** in your browser to see the changes, as Github uses caching. Maybe you even have to **clear your browser cache** to see the changes.



## Advanced considerations

- You want your app to be stable while applicants enter their data. Therefore, you should not change the `main` branch of your Collector App fork after data collection started. Furthermore, **do not sync your fork with the original repository** - we might make breaking changes there, which can disrupt your data collection.
