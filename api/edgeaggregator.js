const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const { ethers } = require("hardhat");
const EventEmitter = require('events');

// Location of fetched data for each CID from edge
// TODO: Lighthouse aggregator
const dataDownloadDir = path.join(__dirname, 'download');

class EdgeAggregator {
    constructor() {
        this.jobs = [];
        this.eventEmitter = new EventEmitter();
    }

    async processFile(cid, apiKey, txID) {
        let downloaded_file_path;
        let contentID;

        // If the txID isn't already registered in jobs, add it
        if (!this.jobs.some(job => job.txID == txID)) {
            this.jobs.push({
                txID: txID,
                cid: cid,
            });
        }

        // Try to download the file only if the txID is new
        if (!this.jobs.some(job => job.cid == cid)) {
            try {
                downloaded_file_path = await this.downloadFile(cid);
            } catch (err) {
                // If an error occurred, log it
                console.error(`Failed to download file: ${err}`);
                return;
            }
        } else {
            // If the file has already been downloaded, use the existing file
            downloaded_file_path = path.join(dataDownloadDir, cid);
            // Update the txID for the job
            this.jobs.find(job => job.cid == cid).txID = txID;
        }

        // Upload the file (either the downloaded one or the error file)
        contentID = await this.uploadFileAndMakeDeal(downloaded_file_path, apiKey);

        // Find the job with the matching CID and update the contentID
        this.jobs.find(job => job.cid == cid).contentID = contentID;

        return contentID;
    }

    async processDealInfos(maxRetries, initialDelay, contentID, apiKey) {
        // Get deal's information from the response and send it to the aggregator contract
        // This endpoint: curl https://hackfs-coeus.estuary.tech/edge/open/status/content/<ID> 
        // should return the cid, deal_id, verifier_data, inclusion_proof of the uploaded data
        // Emit an event once the deal_id becomes nonzero - we must retry the poll since it may take
        // up to 24 hours to get a nonzero deal_id
        let delay = initialDelay;

        for (let i = 0; i < maxRetries; i++) {
            let response = await axios.get(`https://hackfs-coeus.estuary.tech/edge/open/status/content/${contentID}`, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`
                },
            });
            console.log("Response: ", response.data);
            let dealInfos = {
                cid: response.data.data.content_info.cid,
                deal_id: response.data.data.deal_info.deal_id,
                inclusion_proof: response.data.data.sub_piece_info.inclusion_proof,
                verifier_data: response.data.data.sub_piece_info.verifier_data,
            }
            console.log("Deal infos: ", dealInfos);
            if (dealInfos.deal_id != 0) {
                eventEmitter.emit('done', dealInfos);
                return;
            }
            console.log(`Retrying... Attempt number ${i + 1}`);

            // Double the delay for the next loop iteration.
            await sleep(delay);
            delay *= 2;
        }
        eventEmitter.emit('error', new Error('All retries failed, totaling: ', maxRetries));
    }

    async uploadFileAndMakeDeal(filePath, apiKey) {
        console.trace();
        try {
            let formData = new FormData();
            formData.append('data', fs.createReadStream(filePath));
            formData.append('miners', "t017840");

            let response = await axios.post('https://hackfs-coeus.estuary.tech/edge/api/v1/content/add', formData, {
                headers: {
                    ...formData.getHeaders(),
                    'Authorization': `Bearer ${apiKey}`
                },
            });

            let contentID = response.data.contents[0].ID;

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