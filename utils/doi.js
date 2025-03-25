export const fetchInformationUsingDOI = async (doi) => {
    return await fetch("https://doi.org/" + doi, {
        headers: {
            Accept: 'application/vnd.citationstyles.csl+json'
        }
    })
        .then(response => response.json())
        .then(response => {
            const authors = response.author;

            let authorString;

            switch (authors.length) {
                case 0:
                    authorString = 'No author';
                    break;
                case 1:
                    authorString = authors[0].family;
                    break;
                case 2:
                    authorString = authors.map(a => a.family).join(' & ');
                    break;
                default:
                    authorString = authors[0].family + ' et al.';
                    break;
            }

            const year = response.published?.["date-parts"][0][0] || response.issued?.["date-parts"][0][0] || null;

            return {
                title: `${authorString} (${year}): ${response.title}`,
                year: year,
                DOI: response.DOI,
                abstract: response.abstract
            }
        })
        .catch((e) => {
            console.error(e);
            return {
                error: true,
                title: '',
                year: undefined,
                DOI: doi,
                abstract: undefined
                
            }
        })
}