const express = require('express')
const { ethers } = require("hardhat");

const { networkConfig } = require("../helper-hardhat-config")

const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

// Location of fetched data for each CID from edge
const dataDownloadDir = path.join(__dirname, 'download');
// Contract deployment instance
const contractName = "DealStatus";
const deploymentInstance = "0x3F2f1e692816bd0c2056b482f5F69CcD06eDc94E";

class AggregatorBase {
  constructor(contractName, deploymentInstance, port) {
    this.app = express();
    this.contractName = contractName;
    this.deploymentInstance = deploymentInstance;
    this.jobs = [];
    this.port = port;
  }

  async start() {
    this.app.listen(this.port, () => {
      console.log(`app started and is listening on port ${this.port}`);
    });
    this.app.post('/api/register_job', async (req, res) => {
      // Saves the provided CID, end_date, and job_type. 
      // The registered jobs should be periodically executed by the node, e.g. every 12 hours, until the specified end_date is reached.
    
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
    
      // Register the job
      console.log("Submitting job to aggregator contract with CID: ", newJob.cid);
      await this.registerJob(newJob);
    
      // Send a response back to the client
      return res.status(201).json({ message: "Job registered successfully." });
    });

    setInterval(async () => {
      this.jobs.forEach(async job => {
        console.log("Executing on jobs");
        await this.executeJob(job);
      });
    }, 100000);
  }

  async registerJob(newJob) {
    // TODO: Add validation for the new job, for example:
    // 1. Check if newJob is an object with all the required properties
    // 2. Check if newJob.cid is a hexadecimal string
    // 3. Check if newJob.endDate is a valid date
    // 4. Check if newJob.jobType is either 'renew' or 'replication'
    // 5. Check if newJob.replicationTarget is a number

    // Register the job's CID in the aggregator contract
    console.log("Executing deal creation job from API request with CID: ", newJob.cid);

    let dealstatus = await ethers.getContractAt(this.contractName, this.deploymentInstance);
    try {
      await dealstatus.submit(newJob.cid);
      // Push the job into the jobs list
      this.jobs.push(newJob);
    }
    catch (err) {
      console.log("Error: ", err);
    }
  }

  async executeJob() {
    throw new Error("executeJob method must be implemented by subclass");
  }

}

class EdgeAggregator extends AggregatorBase {
  constructor(contractName, deploymentInstance, port) {
    super(contractName, deploymentInstance, port);
    // Start the deal creation listener during initialization
    this.workerDealCreationJob();
  }

  async workerReplicationJob(job) {
    let dealstatus = await ethers.getContractAt(this.contractName, this.deploymentInstance);
    let cid = job.cid;
    await dealstatus.getActiveDeals(cid);

    dealstatus.once("ActiveDeals", async (activeDealIDs) => {
      if (activeDealIDs.length < job.replicationTarget) {
        await this.workerDealCreationJob(job);
      }
    });
  }

  async workerRenewalJob(job) {
    let dealstatus = await ethers.getContractAt(this.contractName, this.deploymentInstance);
    await dealstatus.getExpiringDeals(job.cid);

    dealstatus.once("ExpiringDeals", (expiringDealIDs) => {
      expiringDealIDs.forEach(async () => {
        await this.workerDealCreationJob(job.cid)
      });
    });
  }

  async workerDealCreationJob() {
    let dealstatus = await ethers.getContractAt(this.contractName, this.deploymentInstance);
    let jobTxId;
    let jobCID;
    let contentID;
    let apiKey = process.env.API_KEY;

    dealstatus.on("SubmitAggregatorRequest", async (txId, cid) => {
      console.log(`Received SubmitAggregatorRequest event: (${txId}, ${cid}})`);
      jobTxId = txId;
      jobCID = cid;

      contentID = await this.processFile(jobCID, apiKey);
      const dealInfos = this.getDealInfos(contentID, apiKey);
      await dealstatus.complete(txId, dealInfos.deal_id, dealInfos.inclusion_proof, dealInfos.verifier_data);
    });
  }

  async processFile(cid, apiKey) {
    let downloaded_file_path;
    let contentID;
  
    try {
      // Try to download the file
      downloaded_file_path = await this.downloadFile(cid);
    } catch (err) {
      // If an error occurred, log it and set the path to a predefined error file path
      console.error(`Failed to download file: ${err}`);
      // If the downloaded file doesn't exist, check to see if the file by the CID name is already there
      // If it's there, upload that file instead.
      const directoryPath = path.join(__dirname, 'download');
      downloaded_file_path = path.join(directoryPath, cid);
      if (!fs.existsSync(downloaded_file_path)) {
        throw new Error('Downloaded file does not exist');
      }
    }
  
    console.log("Downloaded file path: ", downloaded_file_path)
  
    // Upload the file (either the downloaded one or the error file)
    contentID = await this.uploadFileAndMakeDeal(downloaded_file_path, apiKey);
    return contentID;
  }

  async getDealInfos(contentID, apiKey) {
    // Get deal's information from the response and send it to the aggregator contract
    // This endpoint: curl https://hackfs-coeus.estuary.tech/edge/open/status/content/<ID> 
    // should return the cid, deal_id, verifier_data, inclusion_proof of the uploaded data
    try {
      let response = await axios.get(`https://hackfs-coeus.estuary.tech/edge/open/status/content/${contentID}`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        },
      });
      console.log("Response: ", response);
    } catch (error) {
      console.error('An error occurred:', error);
    }
  }

  async uploadFileAndMakeDeal(file_path, apiKey) {
    try {
      let formData = new FormData();
      formData.append('data', fs.createReadStream(file_path));
      formData.append('miners', "t017840");

      let response = await axios.post('https://api.estuary.tech/content/add', formData, {
          headers: {
              ...formData.getHeaders(),
              'Authorization': `Bearer ${apiKey}`
          },
      });

      let contentID = response.data.contents.ID;

      console.log('Deal made successfully, contentID: ', contentID);
      return contentID;
    } catch (error) {
      console.error('An error occurred:', error);
    }
  }

  async downloadFile(cid) {
    console.log("Downloading file with CID: ", cid);
    try {
      let filePath = path.join(dataDownloadDir, cid);
  
      // Ensure 'download' directory exists
      fs.mkdir(dataDownloadDir, { recursive: true }, (err) => {
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

  async executeJob() {
    this.jobs.forEach(async job => {
      if (job.endDate < Date.now()) {
        this.jobs.splice(this.jobs.indexOf(job), 1);
      }
      if (job.jobType == 'replication') {
        await this.workerReplicationJob(job);
      }
      else if (job.jobType == 'renew') {
        await this.workerRenewalJob(job);
      }
      else {
        console.log("Error: Invalid job type");
        this.jobs.splice(this.jobs.indexOf(job), 1);
      }
    });
  }
}

const aggregator = new EdgeAggregator("DealStatus", "0x3F2f1e692816bd0c2056b482f5F69CcD06eDc94E", 1337);

// You can now use aggregator.start() to start listening to the specified port and processing jobs
aggregator.start();