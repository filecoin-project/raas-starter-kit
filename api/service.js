const express = require('express')
const { ethers } = require("hardhat");

const { networkConfig } = require("../helper-hardhat-config")

const app = express();
const port = 1337;
const contractName = "DealStatus";
const deploymentInstance = "0xfFc3401D5cf95D559FdAee4df72F769190b26b5d";
const EdgeAggregator = require('./edgeaggregator.js');
const edgeAggregatorInstance = new EdgeAggregator();
let jobs = [];

app.listen(port, () => {
  workerDealCreationJob().catch(console.error);

  console.log(`app started and is listening on port ${port}`);
  
  setInterval(async () => {
    jobs.forEach(async job => {
        console.log("Executing on jobs");
        await executeJob(job);
    });
  }, 100000);
});
app.post('/api/register_job', async (req, res) => {
  // Saves the provided CID, end_date, and job_type.
  // The registered jobs should be periodically executed by the node, e.g. every 12 hours, until the specified end_date is reached.

  // Check if cid is a string
  let cidBytes; 
  try {
    cidBytes = ethers.utils.toUtf8Bytes(req.query.cid); // this will throw an error if cid is not valid bytes or hex string
  } catch {
    console.log("Error: CID must be a hexadecimal string or bytes");
    return res.status(400).json({
        error: 'CID must be a hexadecimal string or bytes'
    });
  }
  // Create a new job object from the request
  let newJob = {
    cid: cidBytes,
    endDate: req.query.end_date,
    jobType: req.query.job_type,
    replicationTarget: req.query.replication_target,
  };

  // Register the job
  console.log("Submitting job to aggregator contract with CID: ", ethers.utils.toUtf8String(newJob.cid));
  await registerJob(newJob);

  // Send a response back to the client
  return res.status(201).json({
    message: "Job registered successfully."
  });
});

async function registerJob(newJob) {
  // TODO: Add validation for the new job, for example:
  // 1. Check if newJob is an object with all the required properties
  // 2. Check if newJob.cid is a hexadecimal string
  // 3. Check if newJob.endDate is a valid date
  // 4. Check if newJob.jobType is either 'renew' or 'replication'
  // 5. Check if newJob.replicationTarget is a number

  // Register the job's CID in the aggregator contract
  console.log("Executing deal creation job from API request with CID: ", ethers.utils.toUtf8String(newJob.cid));

  let dealstatus = await ethers.getContractAt(contractName, deploymentInstance);
  await dealstatus.submit(newJob.cid);
  // Push the job into the jobs array if it doesn't already exist (unique by CID)
  if (!jobs.some(job => job.cid == newJob.cid)) {
    jobs.push(newJob);
  }
}

// The replication_job should retrieve all active storage deals for the provided cid from the aggregator contract.
// If the number of active storage deals is smaller than the replication target,
// the worker sends the cid to the aggregator smart contract,
// and the worker_deal_creation_job will submit it to the aggregator to create a new storage deal.
async function workerReplicationJob(job) {
  let dealstatus = await ethers.getContractAt(contractName, deploymentInstance);
  let cid = job.cid;
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

async function workerDealCreationJob() {
  let dealstatus = await ethers.getContractAt(contractName, deploymentInstance);
  let contentID;
  let apiKey = process.env.API_KEY;

  dealstatus.on("SubmitAggregatorRequest", async (txId, cid) => {
    // console.log(dealstatus.listenerCount("SubmitAggregatorRequest"));
    // Don't register duplicate jobs
    if (jobs.some(job => job.txId == txId)) {
      return;
    }
    let cidString = ethers.utils.toUtf8String(cid);
    console.log(`Received SubmitAggregatorRequest event: (${txId}, ${cidString}})`);

    contentID = await edgeAggregatorInstance.processFile(cidString, apiKey);
    const dealInfos = edgeAggregatorInstance.getDealInfos(contentID, apiKey);
    await dealstatus.complete(txId, dealInfos.deal_id, dealInfos.inclusion_proof, dealInfos.verifier_data);
  });
}

async function executeJob() {
  jobs.forEach(async job => {
    if (job.endDate < Date.now()) {
      jobs.splice(jobs.indexOf(job), 1);
    }
    if (job.jobType == 'replication') {
      console.log("Processing replication");
      // await workerReplicationJob(job);
    } else if (job.jobType == 'renew') {
      // await workerRenewalJob(job);
    } else {
      console.log("Error: Invalid job type");
      jobs.splice(jobs.indexOf(job), 1);
    }
  });
}
