const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const { ethers } = require("hardhat");
const EventEmitter = require('events');
const sleep = require('util').promisify(setTimeout);

// Location of fetched data for each CID from edge
const dataDownloadDir = path.join(__dirname, 'download');
const edgeDealInfosEndpoint = process.env.EDGE_DEAL_INFOS_ENDPOINT;
const edgeDealUploadEndpoint = process.env.EDGE_DEAL_UPLOAD_ENDPOINT;
const edgeDealDownloadEndpoint = process.env.EDGE_DEAL_DOWNLOAD_ENDPOINT;
if (!edgeDealDownloadEndpoint || !edgeDealInfosEndpoint || !edgeDealUploadEndpoint) {
    throw new Error("Missing environment variables: data endpoints");
}

let stateFilePath = "./cache/edge_agg_state.json";

/// A new aggregator implementation should be created for each aggregator contract
class EdgeAggregator {
    constructor() {
        // Each job is an object with the following properties:
        // txID: the transaction ID of the job
        // cid: the CID of the file
        // contentID: the content ID of the file
        this.eventEmitter = new EventEmitter();
        // Load previous app job state
        this.aggregatorJobs = this.loadState();
        console.log("Loaded previous EdgeAggregator state: ", this.aggregatorJobs);
        // Upload any files that don't have a content ID yet (in case of interruption)
        // For any files that do, poll the deal status
        if (!process.env.EDGE_API_KEY) {
            throw new Error("Missing environment variable: EDGE_API_KEY");
        }
        this.apiKey = process.env.EDGE_API_KEY;
        this.aggregatorJobs.forEach(async job => {
            if (!job.contentID) {
                console.log("Redownloading file with CID: ", job.cid);
                await this.downloadFile(job.cid);
                const contentID = await this.uploadFileAndMakeDeal(path.join(dataDownloadDir, job.cid));
                job.contentID = contentID;
                this.saveState();
            }
            this.processDealInfos(18, 1000, job.contentID);
        });
        console.log("Aggregator initialized, polling for deals...");
    }

    async processFile(cid, txID) {
        let downloaded_file_path;
        let contentID;

        // Try to download the file only if the cid is new
        if (!this.aggregatorJobs.some(job => job.cid == cid)) {
            try {
                downloaded_file_path = await this.downloadFile(cid);
                this.enqueueJob(cid, txID)
                this.saveState();
            } catch (err) {
                // If an error occurred, log it
                console.error(`Failed to download file: ${err}`);
                return;
            }
        } else {
            // If the file has already been downloaded, use the existing file
            downloaded_file_path = path.join(dataDownloadDir, cid);
            // Update the txID for the job
            this.aggregatorJobs.find(job => job.cid == cid).txID = txID;
        }

        // Upload the file (either the downloaded one or the error file)
        contentID = await this.uploadFileAndMakeDeal(downloaded_file_path);

        // Find the job with the matching CID and update the contentID
        // ContentID depends on whether or not content was uploaded to edge or lighthouse.
        this.aggregatorJobs.find(job => job.cid == cid).contentID = contentID;
        this.saveState();

        return contentID;
    }

    async processDealInfos(maxRetries, initialDelay, contentID) {
        // Get deal's information from the response and send it to the aggregator contract
        // This endpoint: curl https://hackfs-coeus.estuary.tech/edge/open/status/content/<ID> 
        // should return the cid, dealID, verifier_data, inclusion_proof of the uploaded data
        // Emit an event once the dealID becomes nonzero - we must retry the poll since it may take
        // up to 24 hours to get a nonzero dealID
        let delay = initialDelay;

        for (let i = 0; i < maxRetries; i++) {
            let response = await axios.get(`${edgeDealInfosEndpoint}${contentID}`, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`
                },
            });
            let job = this.aggregatorJobs.find(job => job.contentID == contentID);
            if (!job.txID) {
                console.log("Warning: Contract may not have received deal. Please resubmit. No txID found for contentID: ", contentID);
                this.aggregatorJobs = this.aggregatorJobs.filter(job => job.contentID != contentID);
                return;
            }
            let dealInfos = {
                txID: parseInt(job.txID.hex, 16),
                dealID: response.data.data.deal_info.dealID,
                inclusion_proof: response.data.data.sub_piece_info.inclusion_proof,
                verifier_data: response.data.data.sub_piece_info.verifier_data,
                miner: response.data.data.content_info.miner.replace("t0", ""),
            }
            if (dealInfos.dealID != 0) {
                this.eventEmitter.emit('DealReceived', dealInfos);
                // Remove the job from the list
                this.aggregatorJobs = this.aggregatorJobs.filter(job => job.contentID != contentID);
                this.saveState();
                return;
            }
            console.log(`Processing deal with Edge ContentID ${contentID}. Retrying... Attempt number ${i + 1}`);

            // Double the delay for the next loop iteration.
            await sleep(delay);
            delay *= 2;
        }
        this.eventEmitter.emit('error', new Error('All retries failed, totaling: ', maxRetries));
    }

    async uploadFileAndMakeDeal(filePath) {
        try {
            let formData = new FormData();
            formData.append('data', fs.createReadStream(filePath));
            formData.append('miners', process.env.MINER);

            let response = await axios.post(`${edgeDealUploadEndpoint}`, formData, {
                headers: {
                    ...formData.getHeaders(),
                    'Authorization': `Bearer ${this.apiKey}`
                },
            });

            let contentID = response.data.contents[0].ID;
            
            console.log('Deal uploaded successfully, contentID: ', contentID);
            return contentID;
        } catch (error) {
            console.error('An error occurred:', error);
        }
    }

    async downloadFile(cid, filePath = path.join(dataDownloadDir, cid)) {
        console.log("Downloading file with CID: ", cid);
        let response;
    
        // Ensure 'download' directory exists
        fs.mkdir(dataDownloadDir, {
            recursive: true
        }, (err) => {
            if (err) {
                console.error(err);
            }
        });

        // Use Axios to access the file uploaded by user
        response = await axios({
            method: 'GET',
            url: `${edgeDealDownloadEndpoint}${cid}`,
            responseType: 'stream',
        });

        try {
            const filePath = await this.saveResponseToFile(response, filePath);
            console.log(`File saved at ${filePath}`);
        } catch (err) {
            console.error(`Error saving file: ${err}`);
        }
        
        return filePath;
    }

    loadState() {
        // check if the state file exists
        if (fs.existsSync(stateFilePath)) {
            // if it exists, read it and parse the JSON
            const rawData = fs.readFileSync(stateFilePath);
            return JSON.parse(rawData);
        } else {
            // if it doesn't exist, return an empty array
            return [];
        }
      }
      
    saveState() {
        // write the current state to the file
        const data = JSON.stringify(this.aggregatorJobs);
        fs.writeFileSync(stateFilePath, data);
    }

    enqueueJob(cid, txID) {
        this.aggregatorJobs.push({
            cid: cid,
            txID: txID,
        });
    }

    dequeueJob(cid, txID) {
        this.aggregatorJobs = this.aggregatorJobs.filter(job => job.txID != txID && job.cid != cid);
    }

    saveResponseToFile(response, filePath) {
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
    }
}

module.exports = EdgeAggregator;