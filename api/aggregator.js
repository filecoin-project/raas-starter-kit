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
const lighthouseDealDownloadEndpoint = process.env.LIGHTHOUSE_DEAL_DOWNLOAD_ENDPOINT;
if (!edgeDealDownloadEndpoint || !edgeDealInfosEndpoint || !edgeDealUploadEndpoint || !lighthouseDealDownloadEndpoint) {
    throw new Error("Missing environment variables: data endpoints");
}

let stateFilePath = "./cache/agg_state.json";

// TODO: All API endpoints should be environment variables
class Aggregator {
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
                this.uploadFileAndMakeDeal(path.join(dataDownloadDir, job.cid), process.env.EDGE_API_KEY, job.aggregator);
            } else {
                this.processDealInfos(18, 1000, job.contentID, process.env.EDGE_API_KEY, job.aggregator);
            }
        });
        console.log("Aggregator initialized, polling for deals...");
    }

    async processFile(cid, apiKey, txID, aggregator) {
        let downloaded_file_path;
        let contentID;

        // If the txID isn't already registered in jobs, add it
        if (!this.jobs.some(job => job.txID == txID)) {
            this.jobs.push({
                txID: txID,
                cid: cid,
                aggregator: aggregator,
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
        contentID = await this.uploadFileAndMakeDeal(downloaded_file_path, apiKey, aggregator);

        // Find the job with the matching CID and update the contentID
        // ContentID depends on whether or not content was uploaded to edge or lighthouse.
        this.jobs.find(job => job.cid == cid).contentID = contentID;
        this.saveState();

        return contentID;
    }

    async processDealInfos(maxRetries, initialDelay, contentID, apiKey, aggregator) {
        // Get deal's information from the response and send it to the aggregator contract
        // This endpoint: curl https://hackfs-coeus.estuary.tech/edge/open/status/content/<ID> 
        // should return the cid, deal_id, verifier_data, inclusion_proof of the uploaded data
        // Emit an event once the deal_id becomes nonzero - we must retry the poll since it may take
        // up to 24 hours to get a nonzero deal_id
        let delay = initialDelay;

        for (let i = 0; i < maxRetries; i++) {
            if (aggregator == "edge") {
                let response = await axios.get(`${edgeDealInfosEndpoint}${contentID}`, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`
                },
                });
                let dealInfos = {
                    txID: this.jobs.find(job => job.contentID == contentID).txID,
                    deal_id: response.data.data.deal_info.deal_id,
                    inclusion_proof: response.data.data.sub_piece_info.inclusion_proof,
                    verifier_data: response.data.data.sub_piece_info.verifier_data,
                }
                if (dealInfos.deal_id != 0) {
                    this.eventEmitter.emit('DealReceived', dealInfos);
                    // Remove the job from the list
                    this.jobs = this.jobs.filter(job => job.contentID != contentID);
                    this.saveState();
                    return;
                }
            }
            else if (aggregator == "lighthouse") {
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
                                dealInfos = {
                                    txID: this.jobs.find(job => job.contentID == contentID).txID,
                                    deal_id: deal_id,
                                    inclusion_proof: response.sub_piece_info.inclusion_proof,
                                    verifier_data: response.sub_piece_info.verifier_data,
                                };
                                this.eventEmitter.emit('DealReceived', dealInfos);
                                // Remove the job from the list
                                this.jobs = this.jobs.filter(job => job.contentID != contentID);
                                this.saveState();
                                resolve();
                            }
                        }
                    });
                }).catch(() => {});
            }
            else {
                console.log("Invalid aggregator specified");
                // Remove job
                this.jobs = this.jobs.filter(job => job.contentID != contentID);
                this.saveState();
                return;
            }
            console.log(`Processing deal with ContentID ${contentID}. Retrying... Attempt number ${i + 1}`);

            // Double the delay for the next loop iteration.
            await sleep(delay);
            delay *= 2;
        }
        this.eventEmitter.emit('error', new Error('All retries failed, totaling: ', maxRetries));
    }

    async uploadFileAndMakeDeal(filePath, apiKey, aggregator) {
        try {
            if (aggregator == "edge") {
                let formData = new FormData();
                formData.append('data', fs.createReadStream(filePath));
                formData.append('miners', process.env.MINER);

                let response = await axios.post(`${edgeDealUploadEndpoint}`, formData, {
                    headers: {
                        ...formData.getHeaders(),
                        'Authorization': `Bearer ${apiKey}`
                    },
                });

                let contentID = response.data.contents[0].ID;

                console.log('Deal uploaded successfully, contentID: ', contentID);
                return contentID;
            }
            else if (aggregator == "lighthouse") {
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
            }
            else {
                throw new Error("Invalid aggregator specified");
            }
        } catch (error) {
            console.error('An error occurred:', error);
        }
    }

    async downloadFile(cid, aggregator) {
        console.log("Downloading file with CID: ", cid);
        let filePath = path.join(dataDownloadDir, cid);
        let response;
    
        // Ensure 'download' directory exists
        fs.mkdir(dataDownloadDir, {
            recursive: true
        }, (err) => {
            if (err) {
                console.error(err);
                return;
            }
        });

        if (aggregator == "edge") {
            // Use Axios to access the file uploaded by user
            response = await axios({
                method: 'GET',
                url: `${edgeDealDownloadEndpoint}${cid}`,
                responseType: 'stream',
            });
        } else if (aggregator == "lighthouse") {
            response = await axios({
                method: 'GET',
                url: `${lighthouseDealDownloadEndpoint}${lighthouse_cid}`,
                responseType: 'stream',
            });
        }
        else {
            // Remove job
            this.jobs = this.jobs.filter(job => job.cid != cid);
            throw new Error("Invalid aggregator specified");
        }

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

module.exports = Aggregator;