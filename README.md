# Replication/Renewal-as-a-Service Starter Kit

## Introduction

This repository consists of two components to build a tool to renew or replicate storage deals.

* DealStatus Contract: a smart contract to query the status of storage deals.
* Service.js: a RaaS aplication that renew, replicate, or repair storage deals when necessary.

Please refer to this [doc](https://www.notion.so/pl-strflt/Data-FVM-234b7f4c17624cd8b972f92806732ca9) to understand more.

## Cloning the Repo

Open up your terminal (or command prompt) and navigate to a directory you would like to store this code on. Once there type in the following command:


```bash
git clone --recurse-submodules git@github.com:filecoin-project/raas-starter-kit.git
cd raas-starter-kit
yarn install
```


This will clone the hardhat kit onto your computer, switch directories into the newly installed kit, and install the dependencies the kit needs to work.


## Get a Private Key

You can get a private key from a wallet provider [such as Metamask](https://metamask.zendesk.com/hc/en-us/articles/360015289632-How-to-export-an-account-s-private-key).


## Setting Environment Variables

Add your private key as an environment variable inside the `.env` file:

```bash
PRIVATE_KEY='abcdef'
```

Don't commit and push any changes to .env files that may contain sensitive information, such as a private key! If this information reaches a public GitHub repository, someone can use it to check if you have any Mainnet funds in that wallet address, and steal them!


## Get the Deployer Address

Run this command:
```bash
yarn hardhat get-address
```

This will show you the ethereum-style address associated with that private key and the filecoin-style f4 address (also known as t4 address on testnets)! The Ethereum address can now be exclusively used for almost all FEVM tools, including the faucet.


## Fund the Deployer Address

Go to the [Calibrationnet testnet faucet](https://calibration.yoga/#faucet), and paste in the Ethereum address from the previous step. This will send some calibration testnet FIL to the account.


## Deploy the DealStatus Contract

Type in the following command in the terminal to deploy all contracts:

```bash
yarn hardhat deploy
```

This will compile the DealStatus contract and deploy it to the Calibrationnet test network automatically!

Keep note of the deployed contract address - the service node will need it to interact with the contract.
**Update the `contractInstance` variable in `api/service.js` with the deployed contract address.**

There's a contract interface in the `contracts/interfaces` directory that `DealStatus` inherits from. If you would like to create your own contract different from `DealStatus`, be sure to inherit from and override the methods in the interface.

## Interacting with the RaaS application

The RaaS application is a server that handles REST API requests for renewing, replicating, or repairing storage deals. It is located in the `api` directory.

Before starting the frontend, ensure that you have already started your RaaS node service.

To start the server, run the following commands:

```bash
yarn service # This starts up the node service backend. Must be performed before using the frontend.
yarn start # This starts up the frontend
```

You can access a frontend of the app at [localhost:1337](http://localhost:1337/). 

**Note: some processes that the service performs (such as uploading deals to lighthouse) may take up to 24 hours. Once you submit the deal, you do not need to keep the node running.** The node will attempt to finish incomplete jobs on startup by reading from the state-persisting files it creates in cache whenever jobs are registered.

Several test cases for the service's functionality are located in `api/tests`. To run them, run the following command:

```bash
# Tests the interaction for API calls into service
yarn test-service
# Tests interactions between service and aggregator nodes
yarn test-edge
yarn test-lighthouse
```

### How RaaS Works

To innovate new use cases, you'll have to take apart your app. The RaaS application has two components: the API frontend and the smart contract backend. 

The backend stores the CID of the file and the infos used to complete the storage deal (e.g. the proof that the file is included on chain). It also has functionality to return active deals made with a particular CID, as well as deals that are about to expire.

The API frontend performs the following:
- **Allows users to register various jobs to be performed by the service (performed by default every 12 hours)**.
  - **Replication**: When building a storage solution with FVM on Filecoin, storage deals need to be replicated across geo location, policy sizes and reputation. Replication deals ensure that data can be replicated N times across a number of storage providers.
  - **Renewal**: When building storage solutions with FVM on Filecoin, storage deals need to be live for a long time. This service should be able to take an existing deal and renew it with the same or a different storage provider.
  - **Repair**: When building storage solutions with FVM on Filecoin, storage deals need to be stable. Repair jobs ensure that data can be maintained when it comes close to the end of its lifetime, or if the data somehow becomes inactive and needs to be repaired via. another storage provider.
  - **Monitors Smart Contract**: The node listens to the `SubmitAggregatorRequest` event in aggregators’ smart contract, and trigger the following workflow whenever it sees a new SubmitAggregatorRequest event. 
    - 1. A new`SubmitAggregatorRequest` event comes in, the node saves save the `txId` and `cid`, and go to the next step
    - 2. Create a new deal with aggregators by retrieving and uploading the data
      - The response contains an ID, which is the `content_id`
    - 3. [Use the content_id to check the upload’s status](https://github.com/application-research/edge-ur/blob/car-gen/docs/aggregation.md#checking-the-status-by-content-id)
    - 4. Periodically poll the API above, and once `deal_id` becomes non-zero, proceed to the next step
    - 5. Post the `deal_id`, `inclusion_proof`, and `verifier_data` back to [the aggregators’ smart contract](https://github.com/application-research/fevm-data-segment/blob/main/contracts/aggregator-oracle/edge.sol#L52) by calling the `complete` method, along with the `txId` and `cid`

For a more detailed guide, check out the [documentation](https://www.notion.so/Renew-Replication-Starter-Kit-f57af3ebd221462b8b8ef2714178865a).

## API Usage

Once you start up the server, the POST endpoint will be available at the designated port.

You can then send jobs to the server with the following information:

```json
{
  "job": {
    "cid": "value_of_cid",
    "endDate": "value_of_end_date",
    "jobType": "value_of_job_type",
    "replicationTarget": "value_of_replication_target", // (required for replication jobs)
    "aggregator": "type_of_aggregator", // Recommended to be "lighthouse"
    "epochs": "value_of_epochs" // (required for renewal jobs)
    }
}
```

The below is an example of a POST request to the server:

```bash
curl --location 'http://localhost:1337/api/register_job' \
--header 'Accept: application/json' \
--header 'User-Agent: SMB Redirect/1.0.0' \
--header 'Content-Type: application/x-www-form-urlencoded' \
--header 'Authorization: Basic ZDU5MWYyYzQtMzk0MS00ZWM4LTkyNTQtYjgzZDg1NmI2YmU5Om1xZkU5eklsVFFOdGVIUnY2WDEwQXVmYkNlN0pIUXVC' \
--data-urlencode 'cid=QmYSNU2i62v4EFvLehikb4njRiBrcWqH6STpMwduDcNmK6' \
--data-urlencode 'endDate=2023-07-15' \
--data-urlencode 'jobType=replication' \
--data-urlencode 'replicationTarget=1' \
--data-urlencode 'aggregator=lighthouse' \
--data-urlencode 'epochs=1000'
```

The `aggregator` field can be one of the following: `edge`, or `lighthouse`. This changes the type of aggregator node that the service will use to interact with the Filecoin network.

The `jobType` field can be one of the following: `renew`, `replicate`, or `repair`. This changes the type of job that the service will perform.

Find more information [here](https://www.notion.so/Renew-Replication-Starter-Kit-f57af3ebd221462b8b8ef2714178865a#fc387e4c63114459b2583572c823a4c5)