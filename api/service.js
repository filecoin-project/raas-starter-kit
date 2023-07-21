const express = require('express')
const { ethers } = require("hardhat");

const { networkConfig } = require("../helper-hardhat-config")

const app = express();
const fs = require('fs');
const port = 1337;
const contractName = "DealStatus";
const deploymentInstance = "0xfFc3401D5cf95D559FdAee4df72F769190b26b5d";
const EdgeAggregator = require('./edgeaggregator.js');
// Two aggregator types are provided: EdgeAggregator and LighthouseAggregator
// EdgeAggregator is the default aggregator
const edgeAggregatorInstance = new EdgeAggregator();
let stateFilePath = "./cache/state.json";
let jobs = loadState();
let dealCreationListenerSet = false;
// Store state in cache folder on shutdown
let apiKey = process.env.API_KEY;

app.listen(port, () => {
  if (!dealCreationListenerSet) {
    dealCreationListenerSet = true;
    workerDealCreationListener();
    dataRetrievalListener();
    // Call edge aggreagator's processDealInfos to handle
    // Incomplete deals from shutdown
    loadState();
    for (let job of edgeAggregatorInstance.jobs) {
      let jobContentID = job.contentID;
      edgeAggregatorInstance.processDealInfos(1, 1, jobContentID, null);
    }
  }

  console.log(`app started and is listening on port ${port}`);
  
  setInterval(async () => {
    jobs.forEach(async job => {
        console.log("Executing on jobs");
        await executeJob(job);
    });
  }, 43200000);
});
app.post('/api/register_job', async (req, res) => {
  // Saves the provided CID, end_date, and job_type.
  // The registered jobs should be periodically executed by the node, e.g. every 12 hours, until the specified end_date is reached.

  // Create a new job object from the request
  let newJob = {
    cid: req.query.cid,
    endDate: req.query.end_date,
    jobType: req.query.job_type,
    replicationTarget: req.query.replication_target,
  };

  // Register the job
  console.log("Submitting job to aggregator contract with CID: ", newJob.cid);
  await registerJob(newJob);

  // Send a response back to the client
  return res.status(201).json({
    message: "Job registered successfully."
  });
});

function loadState() {
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

function saveState() {
  // write the current state to the file
  const data = JSON.stringify(jobs);
  fs.writeFileSync(stateFilePath, data);
}

async function registerJob(newJob) {
  // TODO: Add validation for the new job, for example:
  // 1. Check if newJob is an object with all the required properties
  // 2. Check if newJob.cid is a hexadecimal string
  // 3. Check if newJob.endDate is a valid date
  // 4. Check if newJob.jobType is either 'renew' or 'replication'
  // 5. Check if newJob.replicationTarget is a number

  // Register the job's CID in the aggregator contract
  try {
    ethers.utils.toUtf8Bytes(newJob.cid); // this will throw an error if cid is not valid bytes or hex string
  } catch {
    console.log("Error: CID must be a hexadecimal string or bytes");
    return res.status(400).json({
        error: 'CID must be a hexadecimal string or bytes'
    });
  }
  console.log("Executing deal creation job from API request with CID: ", newJob.cid);

  let dealstatus = await ethers.getContractAt(contractName, deploymentInstance);
  await dealstatus.submit(ethers.utils.toUtf8Bytes(newJob.cid));
  // Push the job into the jobs array if it doesn't already exist (unique by CID)
  if (!jobs.some(job => job.cid == newJob.cid)) {
    // Update if there exists already (check for CID AND JOBTYPE)
    jobs.push(newJob);
    saveState();
  }
}

// The replication_job should retrieve all active storage deals for the provided cid from the aggregator contract.
// If the number of active storage deals is smaller than the replication target,
// the worker sends the cid to the aggregator smart contract,
// and the worker_deal_creation_job will submit it to the aggregator to create a new storage deal.
async function workerReplicationJob(job) {
  let dealstatus = await ethers.getContractAt(contractName, deploymentInstance);
  try {
    cid = ethers.utils.toUtf8Bytes(job.cid); // this will throw an error if cid is not valid bytes or hex string
  } catch {
    console.log("Error: CID must be a hexadecimal string or bytes");
  }
  let activeDealIDs = await dealstatus.getActiveDeals(cid);
  if (activeDealIDs.length < job.replicationTarget) {
    try {
      await dealstatus.submit(cid);
    } catch (err) {
      console.log("Error: ", err);
    }
  }
}

// The renewal job should retrieve all expiring storage deals of the cid.
// For the expiring storage deals, the worker sends the cid to the aggregator smart contract,
// and the worker_deal_creation_job will submit it to the aggregator to create a new storage deal.
async function workerRenewalJob(job) {
  let dealstatus = await ethers.getContractAt(contractName, deploymentInstance);
  let expiringDealIDs = await dealstatus.getExpiringDeals(job.cid);
  expiringDealIDs.forEach(async () => {
    try {
      await dealstatus.submit(job.cid);
    } catch (err) {
      console.log("Error: ", err);
    }
  });
}

async function workerDealCreationListener() {
  let dealstatus = await ethers.getContractAt(contractName, deploymentInstance);
  let contentID;
  let processedTxIds = new Set();

  /// Logic for handling SubmitAggregatorRequest events
  function handleEvent(txID, cid) {
    console.log(`Submit aggregator event received: (${txID}, ${cid})`);
    if (processedTxIds.has(txID)) {
      console.log(`Ignoring already processed txId: ${txID}`);
      return;
    }

    processedTxIds.add(txID);
    let cidString = ethers.utils.toUtf8String(cid);

    (async () => {
      contentID = await edgeAggregatorInstance.processFile(cidString, apiKey, txID);
      // Once the deal returned by getDealInfos no longer contains a deal_id of 0, complete the deal
      // Should be working alongside other instances of invocations of this function
      // To process the dealInfos before completion of deal is handled at dataRetrievalListener
      // Max retries: 2000
      // Initial delay: 1000 ms
      edgeAggregatorInstance.processDealInfos(2000, 1000, contentID, apiKey);
      
      // After processing this event, reattach the event listener
      if (dealstatus.listenerCount("SubmitAggregatorRequest") === 0) {
          dealstatus.once("SubmitAggregatorRequest", handleEvent);
      }
    })();
  }

  // Start listening to the first event
  // Recursively call back into handleEvent to process the next event
  if (dealstatus.listenerCount("SubmitAggregatorRequest") === 0) {
    dealstatus.once("SubmitAggregatorRequest", handleEvent);
  }
}

async function dataRetrievalListener() {
  // Create a listener for the data retrieval endpoint to complete deals
  // Event listeners for the 'done' and 'error' events
  let dealstatus = await ethers.getContractAt(contractName, deploymentInstance);
  edgeAggregatorInstance.eventEmitter.on('done', dealInfos => {
    // Process the dealInfos
    let txID = dealInfos.txID;
    let dealID = dealInfos.deal_id;
    let inclusionProof = {
      proofIndex: {
        index: dealInfos.inclusion_proof.proofIndex.index,
        path: dealInfos.inclusion_proof.proofIndex.path.map(value => ethers.utils.hexlify(value)),
      },
      proofSubtree: {
        index: dealInfos.inclusion_proof.proofSubtree.index,
        path: dealInfos.inclusion_proof.proofSubtree.path.map(value => ethers.utils.hexlify(value)),
      },
    }
    let verifierData = dealInfos.verifier_data;
    try {
      dealstatus.complete(txID, dealID, inclusionProof, verifierData);
    }
    catch (err) {
      console.log("Error: ", err);
    }
    console.log("Deal completed with TX ID: ", txID);
  });

  edgeAggregatorInstance.eventEmitter.on('error', error => {
    console.error('An error occurred:', error);
  });
}

async function executeJob() {
  jobs.forEach(async job => {
    if (job.endDate < Date.now()) {
      jobs.splice(jobs.indexOf(job), 1);
    }
    if (job.jobType == 'replication') {
      console.log("Processing replication");
      await workerReplicationJob(job);
    } else if (job.jobType == 'renew') {
      console.log("Processing renewal")
      await workerRenewalJob(job);
    } else {
      console.log("Error: Invalid job type");
      jobs.splice(jobs.indexOf(job), 1);
    }
  });
}
