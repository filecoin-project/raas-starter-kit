const express = require('express')
const { ethers } = require("hardhat");

const { networkConfig } = require("../helper-hardhat-config")

const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const app = express()
const port = 1337

// Location of fetched data for each CID from edge
const dataDownloadDir = path.join(__dirname, 'download');

// Job list to store each job
let jobs = [];

// TODO: DEFINE THE SAME INTERFACE AND CREATE DIFFERENT IMPLEMENTATIONS FOR EACH AGGREGATOR

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
app.post('/api/register_job', async (req, res) => {
  // Saves the provided CID, end_date, and job_type. 
  // The registered jobs should be periodically executed by the node, e.g. every 12 hours, until the specified end_date is reached.

  // TODO: Data validation
  // Check if cid is a hexadecimal string
  try {
    ethers.utils.arrayify(req.query.cid); // this will throw an error if cid is not valid bytes or hex string
  } catch {
    console.log("Error: CID must be a hexadecimal string or bytes");
    return res.status(400).json({ error: 'CID must be a hexadecimal string or bytes' });
  }
  // Create a new job object from the request
  let newJob = {
    cid: req.query.cid,
    endDate: req.query.end_date,
    jobType: req.query.job_type,
    replicationTarget: req.query.replication_target,
  };

  // Register the job's CID in the aggregator contract
  console.log("Executing deal creation job from API request with CID: ", newJob.cid);
  
  // Deployment instance of aggregator contract
  let dealstatus = await ethers.getContractAt("DealStatus", "0x4d0fB4EB0874d49AA36b5FCDb8321599817c723F");

  // The replication_job should first retrieve all active storage deals 
  // for the provided cid from the aggregator contract.
  console.log("Submitting job to aggregator contract with CID: ", newJob.cid);
  await dealstatus.submit(newJob.cid);

  // Send a response back to the client
  return res.status(201).json({ message: "Job registered successfully." });
})

async function worker_replication_job(job) {
  // Deployment instance of aggregator contract
  console.log("Executing replication job");
  let dealstatus = await ethers.getContractAt("DealStatus", "0x4d0fB4EB0874d49AA36b5FCDb8321599817c723F");

  // The replication_job should first retrieve all active storage deals 
  // for the provided cid from the aggregator contract.
  let cid = job.cid;

  // Periodically, ask for all the active deals that include the data’s cid
  await dealstatus.getActiveDeals(cid);

  const getActiveDealsPromise = new Promise((resolve, reject) => {
    dealstatus.once("ActiveDeals", async (activeDealIDs) => {
      // For each replication job, check the current number of replications for the CID
      console.log("Current active deals, ", activeDealIDs);
      // TODO: Should be read only
      if (activeDealIDs.length < job.replicationTarget) {
        // If the number of replications is less than the target, call aggregator contract to initiate a new deal
        // Send CID to the aggregator contract
        await worker_deal_creation_job();
      }
      resolve();
    });
  });

  // Wait for the event to be fired
  await getActiveDealsPromise;
}

async function worker_renewal_job(job) {
  // The renewal job should retrieve all expiring storage deals of the cid.
  // For the expiring storage deals, the worker sends the cid to the aggregator smart contract,
  // and the worker_deal_creation_job will submit it to the aggregator to create a new storage deal.

  // Deployment instance of aggregator contract
  console.log("Executing replication job");
  let dealstatus = await ethers.getContractAt("DealStatus", "0x4d0fB4EB0874d49AA36b5FCDb8321599817c723F");

  // The replication_job should first retrieve all active storage deals 
  // for the provided cid from the aggregator contract.
  await dealstatus.getExpiringDeals(job.cid);

  const getActiveDealsPromise = new Promise((resolve, reject) => {
    dealstatus.once("ExpiringDeals", (expiringDealIDs) => {
      // Sends the cid to the aggregator smart contract for each expiring deal
      expiringDealIDs.forEach(async () => {
        // TODO: Should be read only
        await worker_deal_creation_job(job.cid)
      });
      resolve();
    });
  });

  await getActiveDealsPromise;
}

async function worker_deal_creation_job() {
  // The worker should listen to the `SubmitAggregatorRequest` event in aggregator smart contract, and trigger the following workflow whenever it sees a new `SubmitAggregatorRequest` event
  //
  // 1. Once a new `SubmitAggregatorRequest` event comes in, save the `txId` and `cid`, and proceed to the next step
  // 2. Create a new deal with an aggregator by retrieving and uploading the data identified by `cid` (The response contains an `ID`, which is the `content_id`)
  // 3. Periodically use the content_id to check the status of the upload, and once `deal_id` becomes non-zero, proceed to the next step
  // 4. Post the `deal_id`, `inclusion_proof`, and `verifier_data` to the aggregator contract by calling the `complete` method
  console.log("Starting deal creation listener");
  
  // Deployment instance of aggregator contract
  let dealstatus = await ethers.getContractAt("DealStatus", "0x4d0fB4EB0874d49AA36b5FCDb8321599817c723F");
  let jobTxId;
  let jobCID;
  let contentID;
  let apiKey = process.env.API_KEY;

  const submitAggregatorRequestPromise = new Promise((resolve, reject) => {
    dealstatus.once("SubmitAggregatorRequest", async (txId, cid) => {
      // Push the job into the jobs list
      console.log(`SubmitAggregatorRequest event: (${txId}, ${cid}})`);
      jobTxId = txId;
      jobCID = cid;

      contentID = await processFile(jobCID, apiKey);
      const dealInfos = getDealInfos(contentID, apiKey);
      // Send the information to the aggregator contract
      await dealstatus.complete(txId, dealInfos.deal_id, dealInfos.inclusion_proof, dealInfos.verifier_data);
      resolve();
    });
  });
  // Wait for the event to be fired
  await submitAggregatorRequestPromise;
}

async function processFile(cid, apiKey) {
  let downloaded_file_path;
  let contentID;

  try {
    // Try to download the file
    downloaded_file_path = await downloadFile(cid);
  } catch (err) {
    // If an error occurred, log it and set the path to a predefined error file path
    console.error(`Failed to download file: ${err}`);
    // If the downloaded file doesn't exist, check to see if the file by the CID name is already there
    // If it's there, upload that file instead.
    
    downloaded_file_path = path.join(directoryPath, cid);
    if (!fs.existsSync(downloaded_file_path)) {
      throw new Error('Downloaded file does not exist');
    }
  }

  console.log("Downloaded file path: ", downloaded_file_path)

  // Upload the file (either the downloaded one or the error file)
  contentID = await uploadFileAndMakeDeal(downloaded_file_path, apiKey);
  return contentID;
}

async function uploadFileAndMakeDeal(filePath, apiKey) {
  try {
      let formData = new FormData();
      formData.append('data', fs.createReadStream(filePath));
      formData.append('miners', "t017840");

      let response = await axios.post('https://api.estuary.tech/content/add', formData, {
          headers: {
              ...formData.getHeaders(),
              'Authorization': `Bearer ${apiKey}`
          },
      });

      let contentId = response.data.contents.ID;

      console.log('Deal made successfully, contentID: ', contentId);
      return contentId;
  } catch (error) {
      console.error('An error occurred:', error);
  }
}

async function getDealInfos(contentId, apiKey) {
  // Get deal's information from the response and send it to the aggregator contract
  // This endpoint: curl https://hackfs-coeus.estuary.tech/edge/open/status/content/<ID> 
  // should return the cid, deal_id, verifier_data, inclusion_proof of the uploaded data
  try {
    let response = await axios.get(`https://hackfs-coeus.estuary.tech/edge/open/status/content/${contentId}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      },
    });
  } catch (error) {
    console.error('An error occurred:', error);
  }
}

async function downloadFile(cid) {
  try {
    let filePath = path.join(dataDownloadDir, cid);

    // Ensure 'download' directory exists
    fs.mkdir(directoryPath, { recursive: true }, (err) => {
      if (err) {
        console.error(err);
        return;
      }
    });

    // Use Axios to download the file
    const response = await axios({
      method: 'GET',
      url: `https://hackfs-coeus.estuary.tech/edge/gw/${cid}`,
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


app.listen(port, () => {
  console.log(`app started and is listening on port ${port}`)

  // Start the long-running deal creation job listener
  // TODO: ONLY TRIGGER ONCE FOR EACH AGG EVENT (ONE EVENT CREATES ONE DEAL)
  worker_deal_creation_job().catch(console.error);

  setInterval(async () => {
    // The registered jobs should be periodically executed by the node, 
    // e.g. every 12 hours, until the specified end_date is reached.
    // Extract the parameters from request
  
    jobs.forEach(async job => {
      console.log("Executing on jobs");
      //Remove the job if it's end date is reached
      if (job.endDate < Date.now()) {
        jobs.splice(jobs.indexOf(job), 1);
      }
      // Otherwise, execute on the jobs (Every 12 hours)
      if (job.jobType == 'replication') {
        await worker_replication_job(job);
      }
      else if (job.jobType == 'renew') {
        await worker_renewal_job(job);
      }
      else if (job.jobType == 'repair') {
        await worker_repair_job(job);
      }
      else {
        console.log("Error: Invalid job type");
        // Remove job from list
        jobs.splice(jobs.indexOf(job), 1);
      }
    });
  }, 5000 /*43_200_000*/); // 12 hours in MS
})
