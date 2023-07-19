const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const { ethers } = require("hardhat");

// Location of fetched data for each CID from edge
const dataDownloadDir = path.join(__dirname, 'download');
// Contract deployment instance

class EdgeAggregator {
    constructor() {
        this.jobs = [];
    }

    async processFile(cid, apiKey) {
        let downloaded_file_path;
        let contentID;

        try {
            // Try to download the file
            downloaded_file_path = await this.downloadFile(cid);
        } catch (err) {
            // If an error occurred, log it and set the path to a predefined error file path
            console.error(`Failed to download file: ${err}`);
            return;
        }

        console.log("Downloaded file path: ", downloaded_file_path)

        // Upload the file (either the downloaded one or the error file)
        contentID = await this.uploadFileAndMakeDeal(downloaded_file_path, apiKey);
        return contentID;
    }

    // TODO: KEEP THESE AS THE ONLY FUNCTIONALITIES IN THIS CLASS. (FILE DONWLOADING)
    // MOVE THE CONTRACTS RELATED TASKS OUTSIDE TO ONLY THE NODE.

    // TODO: Push contentIDs into a queue and continue checking for response until a valid dealID is returned (i.e. DEALID nonzero)
    async getDealInfos(contentID, apiKey) {
        // Get deal's information from the response and send it to the aggregator contract
        // This endpoint: curl https://hackfs-coeus.estuary.tech/edge/open/status/content/<ID> 
        // should return the cid, deal_id, verifier_data, inclusion_proof of the uploaded data
        try {
            let response = await axios.get(`https://hackfs-coeus.estuary.tech/edge/open/status/content/${contentID}`, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`
                },
            });
            console.log("Response: ", response);
        } catch (error) {
            console.error('An error occurred:', error);
        }
    }

    async uploadFileAndMakeDeal(file_path, apiKey) {
        try {
            let formData = new FormData();
            formData.append('data', fs.createReadStream(file_path));
            formData.append('miners', "t017840");

            let response = await axios.post('https://api.estuary.tech/content/add', formData, {
                headers: {
                    ...formData.getHeaders(),
                    'Authorization': `Bearer ${apiKey}`
                },
            });

            let contentID = response.data.contents.ID;

            console.log('Deal made successfully, contentID: ', contentID);
            return contentID;
        } catch (error) {
            console.error('An error occurred:', error);
        }
    }

    async downloadFile(cid) {
        console.log("Downloading file with CID: ", cid);
        try {
            let filePath = path.join(dataDownloadDir, cid);

            // Ensure 'download' directory exists
            fs.mkdir(dataDownloadDir, {
                recursive: true
            }, (err) => {
                if (err) {
                    console.error(err);
                    return;
                }
            });

            // Use Axios to download the file
            const response = await axios({
                method: 'GET',
                url: `https://hackfs-coeus.estuary.tech/edge/gw/${cid}`,
                responseType: 'stream',
            });

            const writer = fs.createWriteStream(filePath);

            // Pipe the response data to the file
            response.data.pipe(writer);

            return new Promise((resolve, reject) => {
                writer.on('finish', () => resolve(filePath));
                writer.on('error', (err) => {
                    console.error(err);
                    reject(err);
                });
            });
        } catch (error) {
            throw new Error(error);
        }
    }
}

module.exports = EdgeAggregator;