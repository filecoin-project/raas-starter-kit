const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const { ethers } = require("hardhat");
const EventEmitter = require('events');
const sleep = require('util').promisify(setTimeout);
const { exec } = require('child_process');

// Location of fetched data for each CID from edge
// TODO: Lighthouse aggregator
const dataDownloadDir = path.join(__dirname, 'download');

class LighthouseAggregator {
    constructor() {
        this.jobs = [];
        this.eventEmitter = new EventEmitter();
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
        this.jobs.find(job => job.cid == cid).contentID = contentID;

        return contentID;
    }

    async processDealInfos(maxRetries, initialDelay, lighthouse_cid) {
        let delay = initialDelay;

        for (let i = 0; i < maxRetries; i++) {
            let dealInfos;
            try {
                await new Promise((resolve, reject) => {
                    exec(`lighthouse-web3 deal-status ${lighthouse_cid}`, (error, stdout, stderr) => {
                        if (error) {
                            console.error('An error occurred:', error);
                            reject(error);
                        } else if (stderr) {
                            console.error('An error occurred:', stderr);
                            reject(new Error(stderr));
                        } else {
                            // this may need to be adjusted depending on the actual output of the CLI command
                            let response = JSON.parse(stdout);
                            dealInfos = {
                                txID: this.jobs.find(job => job.contentID == contentID).txID,
                                deal_id: response.deal_info.deal_id,
                                inclusion_proof: response.sub_piece_info.inclusion_proof,
                                verifier_data: response.sub_piece_info.verifier_data,
                            };
                            resolve();
                        }
                    });
                });
            } catch (error) {
                console.error('An error occurred:', error);
                // If an error occurred, break the loop
                break;
            }
            if (dealInfos.deal_id != 0) {
                this.eventEmitter.emit('done', dealInfos);
                return;
            }
            console.log(`Retrying... Attempt number ${i + 1}`);

            // Double the delay for the next loop iteration.
            await sleep(delay);
            delay *= 2;
        }
        this.eventEmitter.emit('error', new Error(`All retries failed, totaling: ${maxRetries}`));
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

    async downloadFile(lighthouse_cid) {
        console.log("Downloading file with CID: ", lighthouse_cid);
        try {
            let filePath = path.join(dataDownloadDir, lighthouse_cid);

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
                url: `https://gateway.lighthouse.storage/ipfs/${lighthouse_cid}`,
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

module.exports = LighthouseAggregator;