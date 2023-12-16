const express = require("express")
const { ethers } = require("hardhat")
const cors = require("cors")

const { networkConfig } = require("../helper-hardhat-config")

const axios = require("axios")
const app = express()
const fs = require("fs")
const path = require("path")
const multer = require("multer")
const sleep = require("util").promisify(setTimeout)

const port = 1337
const contractName = "DealStatus"
const contractInstance = "0x16c74b630d8c28bfa0f353cf19c5b114407a8051" // The user will also input
const LighthouseAggregator = require("./lighthouseAggregator.js")
const upload = multer({ dest: "temp/" }) // Temporary directory for uploads
const { executeRenewalJobs, executeRepairJobs } = require("./repairAndRenewal.js")
let stateFilePath = "./cache/service_state.json"

let storedNodeJobs
let lighthouseAggregatorInstance
let isDealCreationListenerActive = false

app.use(cors())
app.listen(port, () => {
    if (!isDealCreationListenerActive) {
        isDealCreationListenerActive = true
        initializeDealCreationListener()
        initializeDataRetrievalListener()
        storedNodeJobs = loadJobsFromState()
        lighthouseAggregatorInstance = new LighthouseAggregator()
    }

    console.log(`App started and is listening on port ${port}`)
    console.log("Existing jobs on service node: ", storedNodeJobs)

    setInterval(async () => {
        console.log("Executing jobs")
        // await executeRepairJobs(lighthouseAggregatorInstance)
        await executeRenewalJobs(lighthouseAggregatorInstance)
    }, 5000) // 43200000 = 12 hours
})

// app.use(express.urlencoded({ extended: true }))
app.use(express.static(path.join(__dirname, "public")))

app.use(express.json())
app.use(express.urlencoded({ extended: false }))

async function initializeDealCreationListener() {
    const dealStatus = await ethers.getContractAt(contractName, contractInstance)
    let processedTransactionIds = new Set()

    /// Logic for handling SubmitAggregatorRequestWithRaaS events
    function handleEvent(
        transactionId,
        cid,
        _replication_target,
        _repair_threshold,
        _renew_threshold
    ) {
        console.log(
            `Received SubmitAggregatorRequestWithRaaS event: (Transaction ID: ${transactionId}, CID: ${cid}), Replication target: ${_replication_target}, Repair threshold: ${_repair_threshold}, Renew threshold: ${_renew_threshold}`
        )
        // Store the txID of the job in the job queue
        storedNodeJobs.forEach((job) => {
            if (job.cid === ethers.utils.toUtf8String(cid)) {
                job.txID = transactionId
            }
        })

        if (processedTransactionIds.has(transactionId)) {
            console.log(`Ignoring already processed transaction ID: ${transactionId}`)
            return
        }

        processedTransactionIds.add(transactionId)
        const cidString = ethers.utils.toUtf8String(cid)

        ;(async () => {
            // Match CID to aggregator type by first finding the matching job in jobs list
            // const job = storedNodeJobs.find((job) => job.cid === cidString)
            // Once the deal returned by getDealInfos no longer contains a deal_id of 0, complete the deal
            // Should be working alongside other instances of invocations of this function
            // To process the dealInfos before completion of deal is handled at dataRetrievalListener
            // Max retries: 18 (48 hours)
            // Initial delay: 1000 ms
            // if (job === undefined) {
            //     // If the CID lookup doesn't yield a job
            //     console.log("Error: Aggregator type not specified for job with CID: ", cidString)
            // } else {
            // if (job.aggregator === "lighthouse") {
            // Reattach the event listener
            if (dealStatus.listenerCount("SubmitAggregatorRequestWithRaaS") === 0) {
                dealStatus.once("SubmitAggregatorRequestWithRaaS", handleEvent)
            }
            try {
                const result = await lighthouseAggregatorInstance.lighthouseProcessWithRetry(
                    cidString,
                    transactionId,
                    _replication_target
                )
                return result
            } catch (error) {
                console.error("File processing error. Please try again:", error)
                storedNodeJobs.splice(storedNodeJobs.indexOf(job), 1)
                saveJobsToState()
            }
            // }
            // else {
            //     console.log("Error: Invalid aggregator type for job with CID: ", cidString)
            //     // Remove the job if the aggregator type is invalid
            //     storedNodeJobs.splice(storedNodeJobs.indexOf(job), 1)
            //     saveJobsToState()
            // }
            // }
            if (dealStatus.listenerCount("SubmitAggregatorRequestWithRaaS") === 0) {
                dealStatus.once("SubmitAggregatorRequestWithRaaS", handleEvent)
            }
        })()
    }

    // Start listening to the first event and recursively handle the next events
    if (dealStatus.listenerCount("SubmitAggregatorRequestWithRaaS") === 0) {
        dealStatus.once("SubmitAggregatorRequestWithRaaS", handleEvent)
    }
}

// async function lighthouseProcessWithRetry(cidString, transactionId, _replication_target) {
//     let retries = 1 // Number of retries

//     while (retries >= 0) {
//         try {
//             // important
//             // call this function as many replications are needed
//             const lighthouseCID = await lighthouseAggregatorInstance.processFile(
//                 cidString,
//                 transactionId
//             )
//             await lighthouseAggregatorInstance.processDealInfos(18, 1000, lighthouseCID)
//             return lighthouseCID // Return the result if successful
//         } catch (error) {
//             console.error("An error occurred:", error)
//             if (retries === 0) {
//                 throw error // If no more retries left, rethrow the error
//             }
//         }

//         retries-- // Decrement the retry counter
//     }
// }

// Initialize the listener for the Data Retrieval event
async function initializeDataRetrievalListener() {
    // Create a listener for the data retrieval endpoints to complete deals
    // Event listeners for the 'done' and 'error' events
    const dealStatus = await ethers.getContractAt(contractName, contractInstance)

    // Listener for edge aggregator
    lighthouseAggregatorInstance.eventEmitter.on("DealReceived", async (dealInfos) => {
        // Process the dealInfos
        let txID = dealInfos.txID.toString()
        let dealIDs = dealInfos.dealID
        let miners = dealInfos.miner
        let inclusionProof = {
            proofIndex: {
                index: "0x" + dealInfos.inclusion_proof.proofIndex.index,
                path: dealInfos.inclusion_proof.proofIndex.path.map((value) => "0x" + value),
            },
            proofSubtree: {
                index: "0x" + dealInfos.inclusion_proof.proofSubtree.index,
                path: dealInfos.inclusion_proof.proofSubtree.path.map((value) => "0x" + value),
            },
        }
        let verifierData = dealInfos.verifier_data
        verifierData.commPc = "0x" + verifierData.commPc
        // The size piece is originally in hex. Convert it to a number.
        verifierData.sizePc = parseInt(verifierData.sizePc, 16)
        // Add on the dealInfos to the existing job stored inside the storedNodeJobs.
        storedNodeJobs.forEach((job) => {
            if (job.txID === dealInfos.txID) {
                job.dealInfos = dealInfos
            }
        })
        saveJobsToState()
        console.log("Deal received with dealInfos: ", dealInfos)
        try {
            // For each dealID, complete the deal
            for (let i = 0; i < dealIDs.length; i++) {
                // console.log("Completing deal with deal ID: ", dealIDs[i])
                // console.log(`txID: Type - ${typeof txID}, Value - ${txID}`)
                // console.log(`dealID: Type - ${typeof dealIDs[i]}, Value - ${dealIDs[i]}`)
                // console.log(`miner: Type - ${typeof miners[i]}, Value - ${miners[i]}`)
                console.log(
                    `inclusionProof: Type - ${typeof inclusionProof}, Value - ${Number(
                        inclusionProof.proofIndex.index
                    )}`,
                    inclusionProof.proofIndex.path,
                    Number(inclusionProof.proofSubtree.index),
                    inclusionProof.proofSubtree.path
                )
                console.log(
                    `verifierData: Type - ${typeof verifierData}, Value - ${verifierData.commPc}`,
                    verifierData.sizePc
                )

                await dealStatus.complete(
                    txID,
                    dealIDs[i],
                    miners[i],
                    [
                        [Number(inclusionProof.proofIndex.index), inclusionProof.proofIndex.path],
                        [
                            Number(inclusionProof.proofSubtree.index),
                            inclusionProof.proofSubtree.path,
                        ],
                    ],
                    [verifierData.commPc, verifierData.sizePc]
                )
                console.log("Deal completed for deal ID: ", dealIDs[i])
            }
        } catch (err) {
            console.log("Error submitting file for completion: ", err)
            // Remove the job at this stage if the deal cannot be completed
            storedNodeJobs = storedNodeJobs.filter((job) => job.txID != txID)
            saveJobsToState()
        }
    })

    lighthouseAggregatorInstance.eventEmitter.on("Error", (error) => {
        console.error("An error occurred:", error)
    })
}
function loadJobsFromState() {
    if (fs.existsSync(stateFilePath)) {
        const rawData = fs.readFileSync(stateFilePath)
        return JSON.parse(rawData)
    } else {
        return []
    }
}
function saveJobsToState() {
    const data = JSON.stringify(storedNodeJobs)
    fs.writeFileSync(stateFilePath, data)
}
