const express = require('express')
const { ethers } = require("hardhat");

const { networkConfig } = require("../helper-hardhat-config")

const axios = require('axios');
const app = express();
const fs = require('fs');
const path = require('path');
const port = 1337;
const contractName = "DealStatus";
const contractInstance = "0x65A1dC7FE50fe836145bd403746b73E89980E7ca";
const EdgeAggregator = require('./edgeAggregator.js');
const LighthouseAggregator = require('./lighthouseAggregator.js');

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
  }, 43200000);
});

app.use(
  express.urlencoded({ extended: true }),
);

// Registers jobs for node to periodically execute jobs (every 12 hours)
app.post('/api/register_job', async (req, res) => {
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
    replicationTarget: req.body.replicationTarget || 1,
    aggregator: req.body.aggregator || "lighthouse",
    epochs: req.body.epochs || 1000
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
  console.log("Executing deal creation job from API request with CID: ", newJob.cid);

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
  const activeDeals = await dealStatus.getActiveDeals(cid);
  if (activeDeals.length < job.replicationTarget) {
    try {
      await dealStatus.submit(cid);
    } catch (error) {
      console.log("Error: ", error);
    }
  }
}

// Execute the renewal job
// The renewal job should retrieve all expiring storage deals of the cid.
// For the expiring storage deals, the worker sends the cid to the aggregator smart contract,
// and the worker_deal_creation_job will submit it to the aggregator to create a new storage deal.
async function executeRenewalJob(job) {
  const dealStatus = await ethers.getContractAt(contractName, contractInstance);
  // Get all expiring deals for the job's CID within a certain epoch
  const expiringDeals = await dealStatus.getExpiringDeals(job.cid, job.epochs ? job.epochs : 1000);
  expiringDeals.forEach(async () => {
    try {
      await dealStatus.submit(job.cid);
    } catch (error) {
      console.log("Error: ", error);
    }
  });
}

// Execute the repair job
// The renewal job should retrieve all expiring storage deals of the cid.
// For the expiring storage deals, the worker sends the cid to the aggregator smart contract,
// and the worker_deal_creation_job will submit it to the aggregator to create a new storage deal.
async function executeRepairJob(job) {
  const dealStatus = await ethers.getContractAt(contractName, contractInstance);
  const method = "Filecoin.StateMarketStorageDeal";
  // Get all (deal_id, miner) containing the data’s cid
  const allDeals = await dealStatus.getAllDeals(job.cid);
  allDeals.forEach(async deal => {
    // Takes integer format (need to prefix f0 for API call).
    const miner = "f0" + deal.minerId;
    const dealId = deal.dealId;
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

    if (response.result.State.SectorStartEpoch > -1 && currentBlockHeight - deal.result.State.SlashEpoch > job.epochs)
    {
      try {
        await dealStatus.submit(job.cid);
      } catch (error) {
        console.log("Error: ", error);
      }
    }
  });
}

// Initialize the listener for the Deal Creation event
async function initializeDealCreationListener() {
  const dealStatus = await ethers.getContractAt(contractName, contractInstance);
  let processedTransactionIds = new Set();

  /// Logic for handling SubmitAggregatorRequest events
  function handleEvent(transactionId, cid) {
    console.log(`Received SubmitAggregatorRequest event: (Transaction ID: ${transactionId}, CID: ${cid})`);

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
      if (job.aggregator === 'edge') {
        const contentID = await edgeAggregatorInstance.processFile(cidString, transactionId);
        edgeAggregatorInstance.processDealInfos(18, 1000, contentID);
      }
      else if (job.aggregator === 'lighthouse') {
        const lighthouseCID = await lighthouseAggregatorInstance.processFile(cidString, transactionId);
        lighthouseAggregatorInstance.processDealInfos(18, 1000, lighthouseCID);
      }
      else {
        console.log("Error: Invalid aggregator type for job with CID: ", cidString);
        // Remove the job if the aggregator type is invalid
        storedNodeJobs.splice(storedNodeJobs.indexOf(job), 1);
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
    let dealID = dealInfos.dealID;
    let miner = dealInfos.miner;
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
    console.log(verifierData);
    try {
      await dealStatus.complete(txID, dealID, miner, inclusionProof, verifierData);
      console.log("Deal completed for deal ID: ", txID.toString());
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
    }
    if (job.jobType == 'all') {
      console.log("Processing all");
      await executeReplicationJob(job);
      await executeRenewalJob(job);
      await executeRepairJob(job);
    }
    if (job.jobType == 'replication') {
      console.log("Processing replication");
      await executeReplicationJob(job);
    } else if (job.jobType == 'renew') {
      console.log("Processing renewal");
      await executeRenewalJob(job);
    } else if (job.jobType == 'repair') {
      console.log("Processing repair");
      await executeRepairJob(job);
    } else {
      console.log("Error: Invalid job type");
      storedNodeJobs.splice(storedNodeJobs.indexOf(job), 1);
    }
  });
}