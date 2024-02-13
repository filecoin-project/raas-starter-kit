const express = require("express")
const { ethers } = require("hardhat")
const cors = require("cors")

const app = express()
const fs = require("fs")
const path = require("path")
const multer = require("multer")
const sleep = require("util").promisify(setTimeout)
require("dotenv").config()
const port = 1337
const contractName = "DealStatus"
const contractInstance = process.env.DEAL_STATUS_ADDRESS // The user will also input
const LighthouseAggregator = require("./lighthouseAggregator.js")
const upload = multer({ dest: "temp/" }) // Temporary directory for uploads
const { executeRenewalJobs, executeRepairJobs } = require("./repairAndRenewal.js")

let lighthouseAggregatorInstance
let isDealCreationListenerActive = false

app.use(cors())
app.listen(port, () => {
    if (!isDealCreationListenerActive) {
        isDealCreationListenerActive = true
        initializeDealCreationListener()
        initializeDataRetrievalListener()
        // storedNodeJobs = loadJobsFromState()
        lighthouseAggregatorInstance = new LighthouseAggregator()
    }

    console.log(`App started and is listening on port ${port}`)
    // console.log("Existing jobs on service node: ", storedNodeJobs)
    setInterval(async () => {
        console.log("checking for deals")
        lighthouseAggregatorInstance.aggregatorJobs.forEach(async (job) => {
            lighthouseAggregatorInstance.processDealInfos(job.lighthouse_cid, job.txID)
        })

        setTimeout(async () => {
            console.log("Executing jobs")
            await executeRenewalJobs(lighthouseAggregatorInstance)
        }, 15000) // 5000 milliseconds = 5 seconds
    }, 30000) // 10000 milliseconds = 10 seconds

    setInterval(async () => {
        console.log("executing repair jobs")
        await executeRepairJobs(lighthouseAggregatorInstance)
    }, 200000) // 10000 milliseconds = 10 seconds
})

app.use(express.urlencoded({ extended: true }))

// Registers jobs for node to periodically execute jobs (every 12 hours)
app.post("/api/register_job", upload.none(), async (req, res) => {
    // Capture when the request was received for default enddate
    const requestReceivedTime = new Date()
    // Default end date is 1 month from the request received time
    const defaultEndDate = requestReceivedTime.setMonth(requestReceivedTime.getMonth() + 1)

    // Create a new job object from the request body
    // If certain fields are not present, use hardcoded defaults.
    let newJob = {
        cid: req.body.cid,
        endDate: req.body.endDate || defaultEndDate,
        jobType: req.body.jobType || "all",
        replicationTarget: req.body.replicationTarget || 2,
        aggregator: req.body.aggregator || "lighthouse",
        epochs: req.body.epochs || 4,
    }

    if (newJob.cid != null && newJob.cid != "") {
        try {
            ethers.utils.toUtf8Bytes(newJob.cid) // this will throw an error if cid is not valid bytes or hex string
        } catch {
            console.log("Error: CID must be a hexadecimal string or bytes")
            return res.status(400).json({
                error: "CID must be of a valid deal",
            })
        }
    } else {
        return res.status(400).json({
            error: "CID cannot be empty",
        })
    }

    console.log("Submitting job to aggregator contract with CID: ", newJob.cid)
    await registerJob(newJob)

    return res.status(201).json({
        message: "Job registered successfully.",
    })
})

// Uploads a file to the aggregator if it hasn't already been uploaded
app.post("/api/uploadFile", upload.single("file"), async (req, res) => {
    // At the moment, this only handles lighthouse.
    // Depending on the functionality of the Edge aggregator in the future, may or may not match compatibility.
    console.log("Received file upload request")

    // req.file.path will contain the local file path of the uploaded file on the server
    const filePath = req.file.path

    try {
        // Upload the file to the aggregator
        const lighthouse_cid = await lighthouseAggregatorInstance.uploadFileAndMakeDeal(filePath)
        // Optionally, you can remove the file from the temp directory if needed
        fs.unlinkSync(filePath)

        return res.status(201).json({
            message: "Job registered successfully.",
            cid: lighthouse_cid,
        })
    } catch (err) {
        console.error(err)
        res.status(500).send("An error occurred")
    }
})

// Queries the status of a deal with the provided CID
app.get("/api/deal_status", async (req, res) => {
    const cid = req.query.cid
    try {
        ethers.utils.toUtf8Bytes(cid) // this will throw an error if cid is not valid bytes or hex string
    } catch {
        console.log("Error: CID must be a hexadecimal string or bytes")
        return res.status(400).json({
            error: "CID must be of a valid deal",
        })
    }
    const response = await lighthouseAggregatorInstance.getLighthouseCidInfo(cid)
    const job = response.data
    // console.log("Job: ", job)
    const dealStatus = await ethers.getContractAt(contractName, contractInstance)
    let activeDeals
    try {
        activeDeals = await dealStatus.callStatic.getActiveDeals(ethers.utils.toUtf8Bytes(cid))
    } catch (err) {
        console.log("An error has occurred when retrieving deal status: ", err)
        activeDeals = 0
    }
    if (!job) {
        return res.status(200).json({
            dealInfos: [],
            jobType: "all",
            replicationTarget: "2",
            epochs: "1000",
            currentActiveDeals: activeDeals,
        })
    }
    return res.status(200).json({
        dealInfos: job.dealInfo,
        jobType: "all",
        replicationTarget: "2",
        epochs: "1000",
        currentActiveDeals: activeDeals,
    })
})

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
        // storedNodeJobs.forEach((job) => {
        //     if (job.cid === ethers.utils.toUtf8String(cid)) {
        //         job.txID = transactionId
        //     }
        // })

        if (processedTransactionIds.has(transactionId)) {
            console.log(`Ignoring already processed transaction ID: ${transactionId}`)
            return
        }

        processedTransactionIds.add(transactionId)
        const cidString = ethers.utils.toUtf8String(cid)

        ;(async () => {
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
                // storedNodeJobs.splice(storedNodeJobs.indexOf(job), 1)
                // saveJobsToState()
            }

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

// Initialize the listener for the Data Retrieval event
async function initializeDataRetrievalListener() {
    // Create a listener for the data retrieval endpoints to complete deals
    // Event listeners for the 'done' and 'error' events
    const dealStatus = await ethers.getContractAt(contractName, contractInstance)

    // Listener for edge aggregator
    lighthouseAggregatorInstance.eventEmitter.on("DealReceived", async (dealInfos) => {
        // Process the dealInfos
        let txID = dealInfos.txID
        let dealIDs = dealInfos.dealID
        let miners = dealInfos.miner

        let inclusion_proof = dealInfos.inclusion_proof
        let verifier_data = dealInfos.verifier_data
        inclusion_proof.forEach((value, index) => {
            inclusion_proof[index].proofIndex.index = "0x" + value.proofIndex.index
            inclusion_proof[index].proofIndex.path.forEach((value, i) => {
                inclusion_proof[index].proofIndex.path[i] = "0x" + value
            })
            inclusion_proof[index].proofSubtree.index = "0x" + value.proofSubtree.index
            inclusion_proof[index].proofSubtree.path.forEach((value, i) => {
                inclusion_proof[index].proofSubtree.path[i] = "0x" + value
            })
        })

        verifier_data.forEach((value, index) => {
            verifier_data[index].commPc = "0x" + value.commPc
            verifier_data[index].sizePc = parseInt(value.sizePc, 16)
        })
        console.log("Deal received with dealInfos: ", dealInfos)
        try {
            // For each dealID, complete the deal
            for (let i = 0; i < dealIDs.length; i++) {
                await dealStatus.complete(
                    txID,
                    dealIDs[i],
                    miners[i],
                    [
                        [
                            Number(inclusion_proof[i].proofIndex.index),
                            inclusion_proof[i].proofIndex.path,
                        ],
                        [
                            Number(inclusion_proof[i].proofSubtree.index),
                            inclusion_proof[i].proofSubtree.path,
                        ],
                    ],
                    [verifier_data[i].commPc, verifier_data[i].sizePc],
                    { gasLimit: ethers.utils.parseUnits("5000000", "wei") }
                )
                console.log("Deal completed for deal ID: ", dealIDs[i])
            }
        } catch (err) {
            console.log("Error submitting file for completion: ", err)
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
async function registerJob(newJob) {
    // TODO: Add validation for the new job, for example:
    // 1. Check if newJob is an object with all the required properties
    // 2. Check if newJob.cid is a hexadecimal string
    // 3. Check if newJob.endDate is a valid date
    // 4. Check if newJob.jobType is either 'renew' or 'replication'
    // 5. Check if newJob.replicationTarget is a number
    console.log("Executing deal creation job with CID: ", newJob.cid)

    const dealStatus = await ethers.getContractAt(contractName, contractInstance)
    try {
        await dealStatus.submitRaaS(
            ethers.utils.toUtf8Bytes(newJob.cid),
            newJob.replicationTarget,
            newJob.epochs,
            100,
            { gasLimit: 10000000000 }
        )
    } catch (error) {
        console.log("Error submitting deal creation job: ", error)
    }
}
