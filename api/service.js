const express = require('express')
const { ethers } = require("hardhat");

const { networkConfig } = require("../helper-hardhat-config")

const axios = require('axios');
const app = express();
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const sleep = require('util').promisify(setTimeout);

const port = 1337;
const contractName = "DealStatus";
const contractInstance = "0x6ec8722e6543fB5976a547434c8644b51e24785b"; // The user will also input
const EdgeAggregator = require('./edgeAggregator.js');
const LighthouseAggregator = require('./lighthouseAggregator.js');
const upload = multer({ dest: 'temp/' }); // Temporary directory for uploads

let stateFilePath = "./cache/service_state.json";
let storedNodeJobs;
let edgeAggregatorInstance;
let lighthouseAggregatorInstance;
let isDealCreationListenerActive = false;

app.listen(port, () => {
  if (!isDealCreationListenerActive) {
    isDealCreationListenerActive = true;
    initializeDealCreationListener();
    initializeDataRetrievalListener();
    storedNodeJobs = loadJobsFromState(); 
    edgeAggregatorInstance = new EdgeAggregator();
    lighthouseAggregatorInstance = new LighthouseAggregator();
  }

  console.log(`App started and is listening on port ${port}`);
  console.log("Existing jobs on service node: ", storedNodeJobs)
  
  setInterval(async () => {
    console.log("Executing jobs");
    await executeJobs();
  }, 50000); // 43200000 = 12 hours
});

app.use(
  express.urlencoded({ extended: true }),
);

// Registers jobs for node to periodically execute jobs (every 12 hours)
app.post('/api/register_job', upload.none(), async (req, res) => {
  // Capture when the request was received for default enddate
  const requestReceivedTime = new Date();
  // Default end date is 1 month from the request received time
  const defaultEndDate = requestReceivedTime.setMonth(requestReceivedTime.getMonth() + 1);

  // Create a new job object from the request body
  // If certain fields are not present, use hardcoded defaults.
  let newJob = {
    cid: req.body.cid,
    endDate: req.body.endDate || defaultEndDate,
    jobType: req.body.jobType || "all",
    replicationTarget: req.body.replicationTarget || 2,
    aggregator: req.body.aggregator || "lighthouse",
    epochs: req.body.epochs || 100000,
  };

  if (newJob.cid != null && newJob.cid != "") {
    try {
      ethers.utils.toUtf8Bytes(newJob.cid); // this will throw an error if cid is not valid bytes or hex string
    } catch {
      console.log("Error: CID must be a hexadecimal string or bytes");
      return res.status(400).json({
          error: 'CID must be of a valid deal'
      });
    }
  } else {
    return res.status(400).json({
      error: 'CID cannot be empty'
    });
  }

  console.log("Submitting job to aggregator contract with CID: ", newJob.cid);
  await registerJob(newJob);

  return res.status(201).json({
    message: "Job registered successfully."
  });
});

// Uploads a file to the aggregator if it hasn't already been uploaded
app.post('/api/uploadFile', upload.single('file'), async (req, res) => {
  // At the moment, this only handles lighthouse.
  // Depending on the functionality of the Edge aggregator in the future, may or may not match compatibility.
  console.log("Received file upload request");

  // req.file.path will contain the local file path of the uploaded file on the server
  const filePath = req.file.path;

  try {
    // Upload the file to the aggregator
    const lighthouse_cid = await lighthouseAggregatorInstance.uploadFileAndMakeDeal(filePath);
    // Optionally, you can remove the file from the temp directory if needed
    fs.unlinkSync(filePath);

    return res.status(201).json({
      message: "Job registered successfully.",
      cid: lighthouse_cid
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('An error occurred');
  }
});

// Queries the status of a deal with the provided CID
app.get('/api/deal_status', async (req, res) => {
  const cid = req.query.cid;
  try {
    ethers.utils.toUtf8Bytes(cid); // this will throw an error if cid is not valid bytes or hex string
  } catch {
    console.log("Error: CID must be a hexadecimal string or bytes");
    return res.status(400).json({
        error: 'CID must be of a valid deal'
    });
  }
  const dealStatus = await ethers.getContractAt(contractName, contractInstance)
  // Find the job with the matching CID in the queue. If there is no job, return 400
  const job = storedNodeJobs.find(job => job.cid === cid);
  if (!job) {
    return res.status(400).json({
      error: 'An error occurred while retrieving the deal status. Please re-register the jobs.'
    });
  }
  let activeDeals;
  try {
    activeDeals = await dealStatus.callStatic.getActiveDeals(ethers.utils.toUtf8Bytes(job.cid));
  }
  catch (err) {
    console.log("An error has occurred when retrieving deal status: ", err);
    activeDeals = 0;
  }
  return res.status(200).json({
    dealInfos: job.dealInfos,
    jobType: job.jobType,
    replicationTarget: job.replicationTarget,
    epochs: job.epochs,
    currentActiveDeals: activeDeals,
  });
});

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

function loadJobsFromState() {
  if (fs.existsSync(stateFilePath)) {
      const rawData = fs.readFileSync(stateFilePath);
      return JSON.parse(rawData);
  } else {
      return [];
  }
}

function saveJobsToState() {
  const data = JSON.stringify(storedNodeJobs);
  fs.writeFileSync(stateFilePath, data);
}

async function registerJob(newJob) {
  // TODO: Add validation for the new job, for example:
  // 1. Check if newJob is an object with all the required properties
  // 2. Check if newJob.cid is a hexadecimal string
  // 3. Check if newJob.endDate is a valid date
  // 4. Check if newJob.jobType is either 'renew' or 'replication'
  // 5. Check if newJob.replicationTarget is a number
  console.log("Executing deal creation job with CID: ", newJob.cid);

  const dealStatus = await ethers.getContractAt(contractName, contractInstance);
  await dealStatus.submit(ethers.utils.toUtf8Bytes(newJob.cid));

  if (!storedNodeJobs.some(job => job.cid == newJob.cid)) {
    storedNodeJobs.push(newJob);
    saveJobsToState();
  }
}

// Executes the replication job
// The replication_job should retrieve all active storage deals for the provided cid from the aggregator contract.
// If the number of active storage deals is smaller than the replication target,
// the worker sends the cid to the aggregator smart contract,
// and the worker_deal_creation_job will submit it to the aggregator to create a new storage deal.
async function executeReplicationJob(job) {
  const dealStatus = await ethers.getContractAt(contractName, contractInstance);
  try {
    ethers.utils.toUtf8Bytes(job.cid); // this will throw an error if cid is not valid bytes or hex string
  } catch {
    console.log("Error: CID must be a hexadecimal string or bytes");
  }
  const activeDeals = await dealStatus.callStatic.getActiveDeals(ethers.utils.toUtf8Bytes(job.cid));
  console.log(`Deal ${job.cid} at ${activeDeals.length} replications`);
  if (activeDeals.length < job.replicationTarget) {
    // Repeat the submission for as many times as the difference between the replication target and the number of active deals
    console.log(`Replicating deal ${job.cid} to ${job.replicationTarget} replications. Currently at ${activeDeals.length} replications.`);
    for (let i = 0; i < job.replicationTarget - activeDeals.length; i++) {
      await sleep(2000000);
      try {
        console.log(`Submitting replication deal`)
        await dealStatus.submit(ethers.utils.toUtf8Bytes(job.cid));
        // Wait a minute before submitting another.
      } catch (error) {
        console.log("Error replicating: ", error);
      }
    }
  }
  console.log("Replication successful");
}

// Execute the renewal job
// The renewal job should retrieve all expiring storage deals of the cid.
// For the expiring storage deals, the worker sends the cid to the aggregator smart contract,
// and the worker_deal_creation_job will submit it to the aggregator to create a new storage deal.
async function executeRenewalJob(job) {
  const dealStatus = await ethers.getContractAt(contractName, contractInstance);
  // Get all expiring deals for the job's CID within a certain epoch
  const expiringDeals = await dealStatus.callStatic.getExpiringDeals(ethers.utils.toUtf8Bytes(job.cid), job.epochs ? job.epochs : 1000);
  console.log(`Deal ${job.cid} has ${expiringDeals.length} expiring deals: renewing (if any).`);
  for (let i = 0; i < expiringDeals.length; i++) {
    try {
      await dealStatus.submit(ethers.utils.toUtf8Bytes(job.cid));
      await sleep(20000);
    } catch (error) {
      console.log("Error renewing: ", error);
    }
  }
  console.log("Renewal successful");
}

// Execute the repair job
// The renewal job should retrieve all expiring storage deals of the cid.
// For the expiring storage deals, the worker sends the cid to the aggregator smart contract,
// and the worker_deal_creation_job will submit it to the aggregator to create a new storage deal.
async function executeRepairJob(job) {
  const dealStatus = await ethers.getContractAt(contractName, contractInstance);
  const method = "Filecoin.StateMarketStorageDeal";
  // Get all (deal_id, miner) containing the data’s cid
  const allDeals = await dealStatus.callStatic.getAllDeals(ethers.utils.toUtf8Bytes(job.cid));
  console.log(`Deal ${job.cid} has ${allDeals.length} deals: repairing if any are broken.`);
  allDeals.forEach(async deal => {
    // Takes integer format (need to prefix f0 for API call).
    const dealId = deal.dealId.toNumber();
    const params = [dealId, null];

    const body = {
      jsonrpc: '2.0',
      id: 1,
      method: method,
      params: params
    };
    
    const response = await axios.post(process.env.LOTUS_RPC, body, {
        headers: {
            'Content-Type': 'application/json'
        }
    })

    const currentBlockHeight = await getBlockNumber();

    if ((response.data.result.State.SectorStartEpoch > -1 && response.data.result.State.SlashEpoch != -1) && currentBlockHeight - response.data.result.State.SlashEpoch > job.epochs)
    {
      try {
        await dealStatus.submit(ethers.utils.toUtf8Bytes(job.cid));
      } catch (error) {
        console.log("Error repairing: ", error);
      }
    }
  });
  console.log("Repair successful");
}

// Initialize the listener for the Deal Creation event
async function initializeDealCreationListener() {
  const dealStatus = await ethers.getContractAt(contractName, contractInstance);
  let processedTransactionIds = new Set();

  /// Logic for handling SubmitAggregatorRequest events
  function handleEvent(transactionId, cid) {
    console.log(`Received SubmitAggregatorRequest event: (Transaction ID: ${transactionId}, CID: ${cid})`);
    // Store the txID of the job in the job queue
    storedNodeJobs.forEach(job => {
      if (job.cid === ethers.utils.toUtf8String(cid)) {
        job.txID = transactionId;
      }
    });

    if (processedTransactionIds.has(transactionId)) {
        console.log(`Ignoring already processed transaction ID: ${transactionId}`);
        return;
    }

    processedTransactionIds.add(transactionId);
    const cidString = ethers.utils.toUtf8String(cid);

    (async () => {
      // Match CID to aggregator type by first finding the matching job in jobs list
      const job = storedNodeJobs.find(job => job.cid === cidString);
      // Once the deal returned by getDealInfos no longer contains a deal_id of 0, complete the deal
      // Should be working alongside other instances of invocations of this function
      // To process the dealInfos before completion of deal is handled at dataRetrievalListener
      // Max retries: 18 (48 hours)
      // Initial delay: 1000 ms
      if (job === undefined) {
        // If the CID lookup doesn't yield a job
        console.log("Error: Aggregator type not specified for job with CID: ", cidString);
        // Remove the job if the aggregator type is not specified
        storedNodeJobs.splice(storedNodeJobs.indexOf(job), 1);
        saveJobsToState();
      } else {
        if (job.aggregator === 'edge') {
          const contentID = await edgeAggregatorInstance.processFile(cidString, transactionId);
          edgeAggregatorInstance.processDealInfos(18, 1000, contentID);
        }
        else if (job.aggregator === 'lighthouse') {
          try {
            const result = await lighthouseProcessWithRetry(cidString, transactionId);
            return result;
          } catch (error) {
            console.error('File processing error. Please try again:', error);
            storedNodeJobs.splice(storedNodeJobs.indexOf(job), 1);
            saveJobsToState();
          }
        }
        else {
          console.log("Error: Invalid aggregator type for job with CID: ", cidString);
          // Remove the job if the aggregator type is invalid
          storedNodeJobs.splice(storedNodeJobs.indexOf(job), 1);
          saveJobsToState();
        }
      }
      
      // After processing this event, reattach the event listener
      if (dealStatus.listenerCount("SubmitAggregatorRequest") === 0) {
        dealStatus.once("SubmitAggregatorRequest", handleEvent);
      }
    })();
  }

  // Start listening to the first event and recursively handle the next events
  if (dealStatus.listenerCount("SubmitAggregatorRequest") === 0) {
    dealStatus.once("SubmitAggregatorRequest", handleEvent);
  }
}

async function lighthouseProcessWithRetry(cidString, transactionId) {
  let retries = 1; // Number of retries

  while (retries >= 0) {
    try {
      const lighthouseCID = await lighthouseAggregatorInstance.processFile(cidString, transactionId);
      await lighthouseAggregatorInstance.processDealInfos(18, 1000, lighthouseCID);
      return lighthouseCID; // Return the result if successful
    } catch (error) {
      console.error('An error occurred:', error);
      if (retries === 0) {
        throw error; // If no more retries left, rethrow the error
      }
    }

    retries--; // Decrement the retry counter
  }
}

// Initialize the listener for the Data Retrieval event
async function initializeDataRetrievalListener() {
  // Create a listener for the data retrieval endpoints to complete deals
  // Event listeners for the 'done' and 'error' events
  const dealStatus = await ethers.getContractAt(contractName, contractInstance);

  // Listener for edge aggregator
  edgeAggregatorInstance.eventEmitter.on('DealReceived', async dealInfos => {
    // Process the dealInfos
    let txID = dealInfos.txID;
    let dealID = dealInfos.dealID;
    let miner = dealInfos.miner;
    let inclusionProof = {
      proofIndex: {
        index: dealInfos.inclusion_proof.proofIndex.index,
        path: dealInfos.inclusion_proof.proofIndex.path.map(value => ethers.utils.toUtf8Bytes(value)),
      },
      proofSubtree: {
        index: dealInfos.inclusion_proof.proofSubtree.index,
        path: dealInfos.inclusion_proof.proofSubtree.path.map(value => ethers.utils.toUtf8Bytes(value)),
      },
    }
    let verifierData = dealInfos.verifier_data;
    try {
      const auxData = await dealStatus.complete(txID, dealID, miner, inclusionProof, verifierData);
      console.log("Deal completed with inclusion aux data: ", auxData);
    }
    catch (err) {
      console.log("Error: ", err);
    }
  });

  edgeAggregatorInstance.eventEmitter.on('Error', error => {
    console.error('An error occurred:', error);
  });

  // Listener for edge aggregator
  lighthouseAggregatorInstance.eventEmitter.on('DealReceived', async dealInfos => {
    // Process the dealInfos
    let txID = dealInfos.txID.toString();
    let dealIDs = dealInfos.dealID;
    let miners = dealInfos.miner;
    let inclusionProof = {
      proofIndex: {
        index: '0x' + dealInfos.inclusion_proof.proofIndex.index,
        path: dealInfos.inclusion_proof.proofIndex.path.map(value => '0x' + value),
      },
      proofSubtree: {
        index: '0x' + dealInfos.inclusion_proof.proofSubtree.index,
        path: dealInfos.inclusion_proof.proofSubtree.path.map(value => '0x' + value),
      },
    }
    let verifierData = dealInfos.verifier_data;
    verifierData.commPc = '0x' + verifierData.commPc;
    // The size piece is originally in hex. Convert it to a number.
    verifierData.sizePc = parseInt(verifierData.sizePc, 16);
    // Add on the dealInfos to the existing job stored inside the storedNodeJobs.
    storedNodeJobs.forEach(job => {
      if (job.txID === dealInfos.txID) {
        job.dealInfos = dealInfos;
      }
    });
    saveJobsToState();
    console.log("Deal received with dealInfos: ", dealInfos)
    try {
      // For each dealID, complete the deal
      for (let i = 0; i < dealIDs.length; i++) {
        console.log("Completing deal with deal ID: ", dealIDs[i]);
        await dealStatus.complete(txID, dealIDs[i], miners[i], inclusionProof, verifierData);
        console.log("Deal completed for deal ID: ", dealIDs[i]);
      }
    }
    catch (err) {
      console.log("Error submitting file for completion: ", err);
      // Remove the job at this stage if the deal cannot be completed
      storedNodeJobs = storedNodeJobs.filter(job => job.txID != txID);
      saveJobsToState();
    }
  });

  lighthouseAggregatorInstance.eventEmitter.on('Error', error => {
    console.error('An error occurred:', error);
  });
}

async function getBlockNumber() {
  const url = 'https://api.node.glif.io';
  const data = {
    "jsonrpc": "2.0",
    "method": "eth_blockNumber",
    "params": [],
    "id": 1
  };

  try {
    const response = await axios.post(url, data);

    // convert the result to a number
    const blockNumber = parseInt(response.data.result, 16);
    return blockNumber;

  } catch (error) {
    console.error(error);
  }
}

async function getMessagesInTipset() {
  const url = 'https://api.node.glif.io';
  const data = {
    "jsonrpc": "2.0",
    "method": "Filecoin.ChainGetMessagesInTipset",
    "params": [
      [
        {
          "/": "-1",
        }
      ]
    ],
  };

  try {
    const response = await axios.post(url, data);
    return response.data;
  } catch (error) {
    console.error(error);
  }
}

async function executeJobs() {
  storedNodeJobs.forEach(async job => {
    if (job.endDate < Date.now()) {
      storedNodeJobs.splice(storedNodeJobs.indexOf(job), 1);
      saveJobsToState();
    }
    if (job.jobType == 'all') {
      console.log("Processing all");
      try {
        await executeReplicationJob(job);
        await executeRenewalJob(job);
        await executeRepairJob(job);
      }
      catch (err) {
        console.log("An unexpected error has occurred when executing jobs: ", err);
      }
    }
    else if (job.jobType == 'replication') {
      console.log("Processing replication");
      try {
        await executeReplicationJob(job);
      }
      catch (err) {
        console.log("An unexpected error has occurred when executing jobs: ", err);
      }
    } else if (job.jobType == 'renew') {
      console.log("Processing renewal");
      try {
        await executeRenewalJob(job);
      }
      catch (err) {
        console.log("An unexpected error has occurred when executing jobs: ", err);
      }
    } else if (job.jobType == 'repair') {
      console.log("Processing repair");
      try {
        await executeRepairJob(job);
      }
      catch (err) {
        console.log("An unexpected error has occurred when executing jobs: ", err);
      }
    } else {
      console.log("Error: Invalid job type");
      storedNodeJobs.splice(storedNodeJobs.indexOf(job), 1);
      saveJobsToState();
    }
  });
}