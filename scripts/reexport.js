import fs from 'fs';
import path from 'path';

import { fetchInformationUsingDOI } from "../utils/doi";
import { generateScoringRules } from "../utils/score";
import { renameOldKeys } from '../utils/keyalias';

const args = process.argv.slice(2);

let folder = args[0];

if (!folder) {
    console.error('🔴 No folder specified');
    process.exit(1);
}

const meta = require('../packs/core-meta.json');
const pub = require('../packs/core-pubs.json');
const software = require('../packs/core-software.json');
const data = require('../packs/core-data.json');

meta.scoring = generateScoringRules(meta.elements);
pub.scoring = generateScoringRules(pub.elements);
software.scoring = generateScoringRules(software.elements);
data.scoring = generateScoringRules(data.elements);

const forms = {
    meta,
    pub,
    software,
    data
};

console.log(`🟢 Loaded forms`);

console.log(`🟡 Looking at folder ${folder}`);

// for all files in the folder
fs.readdirSync(folder).forEach(async file => {
    const filePath = path.join(folder, file);
    console.log(`🟡 Reading file at: ${filePath}`);
    let data;

    try {
        data = require(filePath);
    } catch (error) {
        console.error(`🔴 Failed to read file: ${filePath}, skipping`);
        return;
    }

    console.log(`🟡 Processing file: ${file}`);
    console.log(`🟢 Found ${data.length - 1} research output(s) (+ meta)`);

    console.log(`  🟡 Adding 'forms' to meta, including scoring rules...`);
    data[0].forms = forms; // includes the generated scoring information

    console.log(`  🟡 Renaming old keys...`);
    data = data.map(renameOldKeys);

    data.forEach(async (ro, index) => {
        if (!ro.DOI) {
            console.log(`  🟡 No DOI at index ${index}, skipping`);
            return;
        }

        console.log(`  🟡 Fetching information for DOI: ${ro.DOI}`);

        const info = await fetchInformationUsingDOI(ro.DOI);
        console.log(`    🟢 Found: ${info.title}`);
        ro.Title = info.title;
        ro.Year = info.year;
        ro.Abstract = info.abstract;
    });

    let newData = JSON.stringify(data, null, 2);

    // write file with the same name to a new folder
    const newFolder = path.join(folder, 'reexported');
    if (!fs.existsSync(newFolder)) {
        fs.mkdirSync(newFolder);
    }

    const newFilePath = path.join(newFolder, file);

    console.log(`🟢 Writing file to: ${newFilePath}`);
    fs.writeFileSync(newFilePath, newData);

    console.log(`\n\n====== DONE ======\n\n`);
});
