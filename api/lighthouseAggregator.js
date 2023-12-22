const axios = require("axios")
const fs = require("fs")
const path = require("path")
const { ethers } = require("hardhat")
const EventEmitter = require("events")
const sleep = require("util").promisify(setTimeout)
const lighthouse = require("@lighthouse-web3/sdk")
const logger = require("./winston")
// Location of fetched data for each CID from edge
const dataDownloadDir = path.join(__dirname, "download")
const lighthouseDealDownloadEndpoint = process.env.LIGHTHOUSE_DEAL_DOWNLOAD_ENDPOINT
const lighthouseDealInfosEndpoint = process.env.LIGHTHOUSE_DEAL_INFOS_ENDPOINT
const lighthousePinEndpoint = process.env.LIGHTHOUSE_PIN_ENDPOINT
const { getDealInfo } = require("./lotusApi.js")
const { needRenewal } = require("./repairAndRenewal.js")
if (!lighthouseDealDownloadEndpoint) {
    throw new Error("Missing environment variables: data endpoints")
}

let stateFilePath = "./cache/lighthouse_agg_state.json"
let dealFilePath = "./cache/deal_state.json"
/// A new aggregator implementation should be created for each aggregator contract
class LighthouseAggregator {
    constructor() {
        // Each job is an object with the following properties:
        // txID: the transaction ID of the job
        // cid: the CID of the file
        // lighthouse_cid: the lighthouse CID of the file
        this.eventEmitter = new EventEmitter()
        // Load previous app job state
        this.aggregatorJobs = this.loadState()
        this.dealNodeJobs = this.loadDealState()
        logger.info("Loaded previous LighthouseAggregator state: ", this.aggregatorJobs)
        // Upload any files that don't have a content ID yet (in case of interruption)
        // For any files that do, poll the deal status
        // this.aggregatorJobs.forEach(async (job) => {
        //     // if (!job.lighthouse_cid) {
        //     //     const lighthouse_cid = await this.pinCIDAndMakeDeal(job.cid)
        //     //     job.lighthouse_cid = lighthouse_cid
        //     //     this.saveState()
        //     // }
        //     this.processDealInfos(18, 1000, job.cid, job.txID)
        // })
        logger.info("Aggregator initialized, polling for deals...")
    }

    async processFile(cid, txID, replicationtarget) {
        // Queue jobs only if the cid is new
        if (!this.aggregatorJobs.some((job) => job.cid == cid)) {
            this.enqueueJob(cid, txID, replicationtarget)
            this.saveState()
        } else {
            // Update the txID for the job
            this.aggregatorJobs.find((job) => job.cid == cid).txID = txID
            //can be improved
            this.aggregatorJobs.find((job) => job.cid == cid).replication_target +=
                replicationtarget
        }

        // Pin cid to lighthouse
        // This function makes deal with the current cid with lighthouse
        // Ideally it should be called as per the replication target
        const lighthouse_cid = await this.pinCIDAndMakeDeal(cid)

        // Find the job with the matching CID and update the lighthouse_cid
        // lighthouse_cid depends on whether or not content was uploaded to edge or lighthouse.
        this.aggregatorJobs.find((job) => job.cid == cid).lighthouse_cid = lighthouse_cid
        this.saveState()

        return cid
    }

    async processDealInfos(lighthouse_cid, transactionId) {
        // let delay = initialDelay

        // for (let i = 0; i < maxRetries; i++) {
        // try {
        let response = await this.getLighthouseCidInfo(lighthouse_cid)
        if (!response.data) {
            logger.info("No deal found polling lighthouse for lighthouse_cid: " + lighthouse_cid)
        } else {
            // console.log("Lighthouse deal infos received: ", response.data)
            // First need to strip t0 from the front of the miner address
            // The stripped miner string should then be converted to an integer
            let job = this.aggregatorJobs.find((job) => job.lighthouse_cid == lighthouse_cid)
            // console.log("job: ", job)
            if (!job.txID) {
                logger.info(
                    "Warning: Contract may not have received deal. Please resubmit. No txID found for contentID: ",
                    contentID
                )
                this.aggregatorJobs = this.aggregatorJobs.filter(
                    (job) => job.contentID != contentID
                )
                return
            }
            let dealIds = []
            let miner = []
            let expirationEpoch = []
            let inclusion_proof = []
            let verifier_data = []
            // logger.info("response.data.dealInfo: " + response.data.dealInfo)
            if (!response.data.dealInfo) {
                logger.info("Waiting for nonzero dealID: " + lighthouse_cid)
                return
            }
            console.log("response.data.dealInfo: ", response.data.dealInfo[0])
            try {
                await Promise.all(
                    response.data.dealInfo.map(async (item) => {
                        const dealInfo = await getDealInfo(Number(item.dealId))
                        const x = await needRenewal(item.dealId)
                        if (dealInfo && !x) {
                            dealIds.push(item.dealId)
                            inclusion_proof.push(item.proof.inclusionProof)
                            verifier_data.push(item.proof.verifierData)
                            if (item.storageProvider.startsWith("f0")) {
                                miner.push(item.storageProvider.replace("f0", ""))
                            } else {
                                miner.push(item.storageProvider.replace("t0", ""))
                            }
                            expirationEpoch.push(dealInfo.Proposal.EndEpoch)
                        }
                    })
                )
            } catch (error) {
                logger.error(error)
            }
            // console.log("dealIds: ", dealIds)
            let dealInfos = {
                txID: transactionId,
                dealID: dealIds,
                inclusion_proof: inclusion_proof,
                verifier_data: verifier_data,
                // For each deal, the miner address is returned with a t0 prefix
                // Replace the t0 prefix with an empty string to get the address
                miner: miner,
            } // If we receive a nonzero dealID, emit the DealReceived event
            if (dealInfos.dealID[0] != null) {
                logger.info(
                    "Lighthouse deal infos processed after receiving nonzero dealID: " + dealInfos
                )
                this.eventEmitter.emit("DealReceived", dealInfos)

                //important
                //reduces replication target by 1 or removes job if it reaches 0

                // currently Remove the job from the list

                this.aggregatorJobs = this.aggregatorJobs.filter(
                    (job) => job.lighthouse_cid != lighthouse_cid
                )
                this.saveState()

                // Assuming dealInfos.dealID is an array of deal IDs
                dealInfos.dealID.forEach((dealID, i) => {
                    const dealObject = { transactionId: transactionId, cid: lighthouse_cid }
                    let dealIndex = this.dealNodeJobs.findIndex((deal) => deal.dealId === dealID)

                    if (dealIndex !== -1) {
                        // If the dealID exists in dealNodeJobs, find the index of an object with the same cid
                        let cidIndex = this.dealNodeJobs[dealIndex].cids.findIndex(
                            (obj) => obj.cid === lighthouse_cid
                        )

                        if (cidIndex !== -1) {
                            // If an object with the same cid exists, check if the transactionId is the same
                            if (
                                this.dealNodeJobs[dealIndex].cids[cidIndex].transactionId !==
                                transactionId
                            ) {
                                // If the transactionId is not the same, replace it with the current one
                                this.dealNodeJobs[dealIndex].cids[cidIndex].transactionId =
                                    transactionId
                            }
                        } else {
                            // If no object with the same cid exists, append the current dealObject
                            this.dealNodeJobs[dealIndex].cids.push(dealObject)
                        }
                    } else {
                        // If the dealID does not exist in dealNodeJobs, add it with the dealObject in an array
                        this.dealNodeJobs.push({
                            dealId: dealID,
                            cids: [dealObject],
                            expirationEpoch: expirationEpoch[i],
                        })
                    }
                })
                this.dealNodeJobs.sort((a, b) => a.expirationEpoch - b.expirationEpoch)
                this.saveDealState()

                return
            } else {
                logger.info("Waiting for nonzero dealID: " + lighthouse_cid)
            }
        }
        // }
        // catch (e) {
        //     console.log("Error polling lighthouse for lighthouse_cid: ", lighthouse_cid + e)
        // }
        // await sleep(delay)
        // delay *= 2
        // }
        // this.eventEmitter.emit("error", new Error("All retries failed, totaling: " + maxRetries))
    }

    async uploadFileAndMakeDeal(filePath) {
        try {
            const dealParams = {
                miner: [process.env.MINER],
                repair_threshold: null,
                renew_threshold: null,
                network: process.env.NETWORK,
            }
            const response = await lighthouse.upload(
                filePath,
                process.env.LIGHTHOUSE_API_KEY,
                false,
                dealParams
            )
            const lighthouse_cid = response.data.Hash
            console.log("Uploaded file, lighthouse_cid: ", lighthouse_cid)
            return lighthouse_cid
        } catch (error) {
            logger.error("An error occurred:" + error)
        }
    }

    async pinCIDAndMakeDeal(cidString) {
        try {
            const data = {
                cid: cidString,
                raas: {
                    network: "calibration",
                },
            }
            const pinResponse = await axios.post(lighthousePinEndpoint, data, {
                headers: {
                    Authorization: `Bearer ${process.env.LIGHTHOUSE_API_KEY}`,
                },
            })
            return cidString
        } catch (error) {
            logger.error("An error occurred:" + error)
        }
    }

    async lighthouseProcessWithRetry(cidString, transactionId, _replication_target) {
        let retries = 1 // Number of retries

        while (retries >= 0) {
            try {
                const lighthouseCID = await this.processFile(
                    cidString,
                    transactionId,
                    _replication_target
                )
                return lighthouseCID // Return the result if successful
            } catch (error) {
                logger.error(error)
                if (retries === 0) {
                    throw error // If no more retries left, rethrow the error
                }
            }

            retries-- // Decrement the retry counter
        }
    }

    loadState(path = stateFilePath) {
        // check if the state file exists
        if (fs.existsSync(path)) {
            // if it exists, read it and parse the JSON
            const rawData = fs.readFileSync(path)
            return JSON.parse(rawData)
        } else {
            // if it doesn't exist, return an empty array
            return []
        }
    }

    loadDealState(path = dealFilePath) {
        // check if the state file exists
        if (fs.existsSync(path)) {
            // if it exists, read it and parse the JSON
            const rawData = fs.readFileSync(path)
            return JSON.parse(rawData)
        } else {
            // if it doesn't exist, return an empty array
            return []
        }
    }
    saveState(path = stateFilePath) {
        // write the current state to the file
        if (path != undefined) {
            stateFilePath = path
        }
        const data = JSON.stringify(this.aggregatorJobs)
        fs.writeFileSync(path, data)
    }

    saveDealState(path = dealFilePath) {
        // write the current state to the file
        if (path != undefined) {
            dealFilePath = path
        }
        const data = JSON.stringify(this.dealNodeJobs)
        fs.writeFileSync(path, data)
    }

    enqueueJob(cid, txID, replicationtarget) {
        this.aggregatorJobs.push({
            cid: cid,
            txID: txID,
            replication_target: replicationtarget,
        })
    }

    dequeueJob(cid, txID) {
        this.aggregatorJobs = this.aggregatorJobs.filter(
            (job) => job.txID != txID && job.cid != cid
        )
    }

    saveResponseToFile(response, filePath) {
        const writer = fs.createWriteStream(filePath)

        // Pipe the response data to the file
        response.data.pipe(writer)

        return new Promise((resolve, reject) => {
            writer.on("finish", () => resolve(filePath))
            writer.on("error", (err) => {
                logger.error("Error saving response to file: " + err)
                reject(err)
            })
        })
    }
    async getLighthouseCidInfo(lighthouse_cid) {
        const response = await axios.get(lighthouseDealInfosEndpoint, {
            params: {
                cid: lighthouse_cid,
                network: "testnet", // Change the network to mainnet when ready
            },
        })
        return response
    }
}

module.exports = LighthouseAggregator
