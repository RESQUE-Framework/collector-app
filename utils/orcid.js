async function fetchAuthorByORCID(orcid) {
    const url = `https://pub.orcid.org/v3.0/${orcid}`;

    try {
        // Fetch data from ORCID API
        const response = await fetch(url, {
            headers: {
                'Accept': 'application/json' // Request JSON response
            }
        });

        if (!response.ok) {
            throw new Error(`Error: ${response.status}`);
        }

        const data = await response.json();

        // Extract author name
        const name = data['person']['name'];
        const author = {
            given: name['given-names'].value,
            family: name['family-name'].value
        };

        return author.given + ' ' + author.family;
    } catch (error) {
        console.error('Failed to fetch author:', error);
    }
}

async function fetchPapersByORCID(orcid) {    
    const url = `https://pub.orcid.org/v3.0/${orcid}/works`;

    try {
        // Fetch data from ORCID API
        const response = await fetch(url, {
            headers: {
                'Accept': 'application/json' // Request JSON response
            }
        });

        if (!response.ok) {
            throw new Error(`Error: ${response.status}`);
        }

        const data = await response.json();

        // Parse works and extract titles and DOIs
        const papers = data.group.map(group => {
            const summary = group['work-summary'][0];
            return {
                title: summary.title.title.value,
                doi: summary['external-ids']['external-id']
                    .find(id => id['external-id-type'] === 'doi')?.['external-id-value'] || null,
                year: summary['publication-date']?.year?.value || null
            };
        });

        return papers;
    } catch (error) {
        console.error('Failed to fetch papers:', error);
    }
}
