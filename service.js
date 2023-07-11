const express = require('express')
const { ethers } = require("hardhat");

const app = express()
const port = 3000

let jobs = []; // List to store the jobs
let aggregator_contract = 

// This file is an example of a service that works with an aggregator, an aggregator contract, and a developer contract
// to renew expiring storage deals or replicate storage deals to desiring number of replications.
// Please refer to this [doc](https://www.notion.so/pl-strflt/Data-FVM-234b7f4c17624cd8b972f92806732ca9) to understand more.
//
// Aggregator: https://github.com/application-research/edge-ur/blob/car-gen/docs/aggregation.md
// Aggregator contract: https://github.com/application-research/fevm-data-segment/blob/main/contracts/aggregator-oracle/EdgeAggregatorOracle.sol
// Developer contract: https://github.com/filecoin-project/raas-starter-kit/blob/main/contracts/DealStatus.sol

// @api {POST} /api/register_job Register a new job
// @apiName RegisterJob
//
// @apiParam {String} cid CID of the data
// @apiParam {String} end_date The date that the job should stop and the worker should stop checking the status of the deals (YYYY-MM-DD format)
// @apiParam {String} job_type Type of the job. Possible values are 'renew' or 'replication'
// @apiParam {Number} replication_target Number of replications. This should be empty for 'renew' jobs
app.post('/api/register_job', (req, res) => {
  // Saves the provided CID, end_date, and job_type. 
  // The registered jobs should be periodically executed by the node, e.g. every 12 hours, until the specified end_date is reached.
  // Extract the parameters from request
  let cid = req.query.cid;
  let end_date = req.query.end_date;
  let job_type = req.query.job_type;
  let replication_target = req.query.replication_target;

  // Create a new job object
  let newJob = {
    cid: cid,
    endDate: end_date,
    jobType: job_type,
    replicationTarget: replication_target,
  };

  // Push the job into the jobs list
  jobs.push(newJob);

  // Send a response back to the client
  res.json({ message: "Job registered successfully." });
})


function worker_replication_job() {
  // The replication_job should retrieve all active storage deals for the provided cid from the aggregator contract.
  // If the number of active storage deals is smaller than the replication target,
  // the worker sends the cid to the aggregator smart contract,
  // and the worker_deal_creation_job will submit it to the aggregator to create a new storage deal.
  //
  // Fetch jobs of type 'replication'
  let replicationJobs = jobs.filter(job => job.jobType == 'replication');
  
  // for each replication job, check the current number of replications for the CID
  // If the number of replications is less than the target, call aggregator contract to initiate a new deal
  for (job in replicationJobs) {
    const numReplications = fetchNumReplications(job.cid);
    if (numReplications < job.replicationTarget) {
      callAggregatorContract(job.cid);
    }
  }
}

function worker_renewal_job() {
  // The renewal job should retrieve all expiring storage deals of the cid.
  // For the expiring storage deals, the worker sends the cid to the aggregator smart contract,
  // and the worker_deal_creation_job will submit it to the aggregator to create a new storage deal.
  //
  // TODO: to be implemented
  let renewalJobs = jobs.filter(job => job.jobType == 'renew');
  // Similar to above in terms of pseudocode
}

function worker_deal_creation_job() {
  // The worker should listen to the `SubmitAggregatorRequest` event in aggregator smart contract, and trigger the following workflow whenever it sees a new `SubmitAggregatorRequest` event
  //
  // 1. Once a new `SubmitAggregatorRequest` event comes in, save the `txId` and `cid`, and proceed to the next step
  // 2. Create a new deal with an aggregator by retrieving and uploading the data identified by `cid` (The response contains an `ID`, which is the `content_id`)
  // 3. Periodically use the content_id to check the status of the upload, and once `deal_id` becomes non-zero, proceed to the next step
  // 4. Post the `deal_id`, `inclusion_proof`, and `verifier_data` to the aggregator contract by calling the `complete` method
  //
  // TODO: to be implemented
}


app.listen(port, () => {
  console.log(`app started and is listening on port ${port}`)
})
