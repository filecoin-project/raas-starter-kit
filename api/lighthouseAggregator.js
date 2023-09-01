const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { ethers } = require("hardhat");
const EventEmitter = require('events');
const sleep = require('util').promisify(setTimeout);
const lighthouse = require('@lighthouse-web3/sdk');

// Location of fetched data for each CID from edge
const dataDownloadDir = path.join(__dirname, 'download');
const lighthouseDealDownloadEndpoint = process.env.LIGHTHOUSE_DEAL_DOWNLOAD_ENDPOINT;
const lighthouseDealInfosEndpoint = process.env.LIGHTHOUSE_DEAL_INFOS_ENDPOINT;
if (!lighthouseDealDownloadEndpoint) {
    throw new Error("Missing environment variables: data endpoints");
}

let stateFilePath = "./cache/lighthouse_agg_state.json";

/// A new aggregator implementation should be created for each aggregator contract
class LighthouseAggregator {
    constructor() {
        // Each job is an object with the following properties:
        // txID: the transaction ID of the job
        // cid: the CID of the file
        // lighthouse_cid: the lighthouse CID of the file
        this.eventEmitter = new EventEmitter();
        // Load previous app job state
        this.aggregatorJobs = this.loadState();
        console.log("Loaded previous LighthouseAggregator state: ", this.aggregatorJobs);
        // Upload any files that don't have a content ID yet (in case of interruption)
        // For any files that do, poll the deal status
        this.aggregatorJobs.forEach(async job => {
            if (!job.lighthouse_cid) {
                console.log("Redownloading file with CID: ", job.cid);
                await this.downloadFile(job.cid);
                const lighthouse_cid = await this.uploadFileAndMakeDeal(path.join(dataDownloadDir, job.cid));
                job.lighthouse_cid = lighthouse_cid;
                this.saveState();
            }
            this.processDealInfos(18, 1000, job.lighthouse_cid);
        });
        console.log("Aggregator initialized, polling for deals...");
    }

    async processFile(cid, txID) {
        let downloaded_file_path;
        let lighthouse_cid;

        // Try to download the file only if the cid is new
        if (!this.aggregatorJobs.some(job => job.cid == cid)) {
            try {
                downloaded_file_path = await this.downloadFile(cid);
                this.enqueueJob(cid, txID);
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

        // Wait for the file to be downloaded
        await sleep(2500);

        // Upload the file (either the downloaded one or the error file)
        lighthouse_cid = await this.uploadFileAndMakeDeal(downloaded_file_path);

        // Find the job with the matching CID and update the lighthouse_cid
        // lighthouse_cid depends on whether or not content was uploaded to edge or lighthouse.
        this.aggregatorJobs.find(job => job.cid == cid).lighthouse_cid = lighthouse_cid;
        this.saveState();

        return lighthouse_cid;
    }

    async processDealInfos(maxRetries, initialDelay, lighthouse_cid) {
        let delay = initialDelay;
    
        for (let i = 0; i < maxRetries; i++) {
            try {
                let response = await axios.get(lighthouseDealInfosEndpoint, {
                    params: {
                        cid: lighthouse_cid,
                        network: "testnet" // Change the network to mainnet when ready
                    }
                })
                if (!response.data) {
                    console.log("No deal found polling lighthouse for lighthouse_cid: ", lighthouse_cid);
                } else {
                    console.log("Lighthouse deal infos received: ", response.data);
                    // First need to strip t0 from the front of the miner address
                    // The stripped miner string should then be converted to an integer
                    let job = this.aggregatorJobs.find(job => job.lighthouse_cid == lighthouse_cid);
                    if (!job.txID) {
                        console.log("Warning: Contract may not have received deal. Please resubmit. No txID found for contentID: ", contentID);
                        this.aggregatorJobs = this.aggregatorJobs.filter(job => job.contentID != contentID);
                        return;
                    }
                    let dealIds = [];
                    let miner = [];
                    response.data.dealInfo.forEach(item => {
                        dealIds.push(item.dealId);
                        miner.push(item.storageProvider.replace("t0", ""));
                    });
                    let dealInfos = {
                        txID: job.txID,
                        dealID: dealIds,
                        inclusion_proof: response.data.proof.fileProof.inclusionProof,
                        verifier_data: response.data.proof.fileProof.verifierData,
                        // For each deal, the miner address is returned with a t0 prefix
                        // Replace the t0 prefix with an empty string to get the address
                        miner: miner,
                    }
                    // If we receive a nonzero dealID, emit the DealReceived event
                    if (dealInfos.dealID[0] != null) {
                        console.log("Lighthouse deal infos processed after receiving nonzero dealID: ", dealInfos);
                        this.eventEmitter.emit('DealReceived', dealInfos);
                        // Remove the job from the list
                        this.aggregatorJobs = this.aggregatorJobs.filter(job => job.lighthouse_cid != lighthouse_cid);
                        this.saveState();
                        return;
                    }
                    else {
                        console.log("Waiting for nonzero dealID: ", lighthouse_cid);
                    }
                }
            } catch (e) {
                console.log("Error polling lighthouse for lighthouse_cid: ", lighthouse_cid + e);
            }
            await sleep(delay);
            delay *= 2;
        }
        this.eventEmitter.emit('error', new Error('All retries failed, totaling: ' + maxRetries));
    }    

    async uploadFileAndMakeDeal(filePath) {
        try {
            const dealParams = {miner:[ process.env.MINER ], repair_threshold: null, renew_threshold: null, network: process.env.NETWORK};
            const response = await lighthouse.upload(filePath, process.env.LIGHTHOUSE_API_KEY, false, dealParams);
            const lighthouse_cid = response.data.Hash;
            console.log("Uploaded file, lighthouse_cid: ", lighthouse_cid);
            return lighthouse_cid;
        } catch (error) {
            console.error('An error occurred:', error);
        }
    }

    async downloadFile(lighthouse_cid, downloadPath = path.join(dataDownloadDir, lighthouse_cid)) {
        console.log("Downloading file with CID: ", lighthouse_cid);
        let response;
    
        // Ensure 'download' directory exists
        fs.mkdir(dataDownloadDir, {
            recursive: true
        }, (err) => {
            if (err) {
                console.error(err);
            }
        });

        response = await axios({
            method: 'GET',
            url: `${lighthouseDealDownloadEndpoint}${lighthouse_cid}`,
            responseType: 'stream',
        });

        try {
            const filePath = await this.saveResponseToFile(response, downloadPath);
            console.log(`File saved at ${filePath}`);
            return filePath
        } catch (err) {
            console.error(`Error saving file: ${err}`);
        }
    }

    loadState(path=stateFilePath) {
        // check if the state file exists
        if (fs.existsSync(path)) {
            // if it exists, read it and parse the JSON
            const rawData = fs.readFileSync(path);
            return JSON.parse(rawData);
        } else {
            // if it doesn't exist, return an empty array
            return [];
        }
    }
      
    saveState(path=stateFilePath) {
        // write the current state to the file
        if (path != undefined) {
            stateFilePath = path;
        }
        const data = JSON.stringify(this.aggregatorJobs);
        fs.writeFileSync(path, data);
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

module.exports = LighthouseAggregator;