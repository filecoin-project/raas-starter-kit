const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { ethers } = require("hardhat");
const EventEmitter = require('events');
const sleep = require('util').promisify(setTimeout);
const { exec } = require('child_process');

// Location of fetched data for each CID from edge
const dataDownloadDir = path.join(__dirname, 'download');
const lighthouseDealDownloadEndpoint = process.env.LIGHTHOUSE_DEAL_DOWNLOAD_ENDPOINT;
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
        // contentID: the content ID of the file
        this.eventEmitter = new EventEmitter();
        // Load previous app job state
        this.jobs = this.loadState();
        console.log("Loaded previous aggregator state: ", this.jobs);
        // Upload any files that don't have a content ID yet (in case of interruption)
        // For any files that do, poll the deal status
        this.jobs.forEach(job => {
            if (!job.contentID) {
                this.uploadFileAndMakeDeal(path.join(dataDownloadDir, job.cid));
            } else {
                this.processDealInfos(18, 1000, job.contentID);
            }
        });
        console.log("Aggregator initialized, polling for deals...");
    }

    async processFile(cid, txID) {
        let downloaded_file_path;
        let contentID;

        // If the txID isn't already registered in jobs, add it
        if (!this.jobs.some(job => job.txID == txID)) {
            this.jobs.push({
                txID: txID,
                cid: cid,
            });
            this.saveState();
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
        contentID = await this.uploadFileAndMakeDeal(downloaded_file_path);

        // Find the job with the matching CID and update the contentID
        // ContentID depends on whether or not content was uploaded to edge or lighthouse.
        this.jobs.find(job => job.cid == cid).contentID = contentID;
        this.saveState();

        return contentID;
    }

    async processDealInfos(maxRetries, initialDelay, contentID) {
        let delay = initialDelay;
    
        for (let i = 0; i < maxRetries; i++) {
            await new Promise((resolve, reject) => {
                exec(`lighthouse-web3 deal-status ${lighthouse_cid}`, (error, stdout, stderr) => {
                    if (error) {
                        console.error('An error occurred:', error);
                        reject(error);
                    } else if (stderr) {
                        console.error('An error occurred:', stderr);
                        reject(new Error(stderr));
                    } else {
                        let response = JSON.parse(stdout);
                        let deal_id = response.deal_info.deal_id;
    
                        if (deal_id == 0) {
                            reject(new Error());
                        } else {
                            const dealInfos = {
                                txID: this.jobs.find(job => job.contentID == contentID).txID,
                                deal_id: deal_id,
                                inclusion_proof: response.sub_piece_info.inclusion_proof,
                                verifier_data: response.sub_piece_info.verifier_data,
                            };
                            this.eventEmitter.emit('DealReceived', dealInfos);
                            this.jobs = this.jobs.filter(job => job.contentID != contentID);
                            this.saveState();
                            resolve();
                        }
                    }
                });
            }).catch(() => {
                console.log(`Processing deal with ContentID ${contentID}. Retrying... Attempt number ${i + 1}`);
            });
    
            await sleep(delay);
            delay *= 2;
        }
        this.eventEmitter.emit('error', new Error('All retries failed, totaling: ' + maxRetries));
    }    

    async uploadFileAndMakeDeal(filePath) {
        try {
            return new Promise((resolve, reject) => {
                exec(`lighthouse-web3 upload ${filePath}`, (error, stdout, stderr) => {
                    if (error) {
                        console.error('An error occurred:', error);
                        reject(error);
                    } else if (stderr) {
                        console.error('An error occurred:', stderr);
                        reject(new Error(stderr));
                    } else {
                        let response = JSON.parse(stdout);
                        console.log(response);
                        resolve(response);
                    }
                });
            });
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
        response = await axios({
            method: 'GET',
            url: `${lighthouseDealDownloadEndpoint}${lighthouse_cid}`,
            responseType: 'stream',
        });

        saveResponseToFile(response, filePath)
            .then(filePath => console.log(`File saved at ${filePath}`))
            .catch(err => console.error(`Error saving file: ${err}`));
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
        const data = JSON.stringify(this.jobs);
        fs.writeFileSync(stateFilePath, data);
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