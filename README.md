# Replication/Renewal-as-a-Service Starter Kit

## Introduction

This repository consists of two components to build a tool to renew or replicate storage deals.

* DealStatus Contract: a smart contract to query the status of storage deals.
* eventListener.js: a demo RaaS aplication that renew, replicate, or repair storage deals when necessary.

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

The demo RaaS application is a server that handles REST API requests for renewing, replicating, or repairing storage deals. It is located in the `api` directory.

Before starting the frontend, ensure that you have already started your RaaS node service.

Configure all the environment variobles correctly form .env.example before starting the raas service.

To start the server, run the following commands:

```bash
yarn service # This starts up the node service backend. Must be performed before using the frontend.
yarn start # This starts up the frontend
```

You can access a frontend of the app at [localhost:1337](http://localhost:1337/). 

<!-- **Note: some processes that the service performs (such as uploading deals to lighthouse) may take up to 24 hours. Once you submit the deal, you do not need to keep the node running.** The node will attempt to finish incomplete jobs on startup by reading from the state-persisting files it creates in cache whenever jobs are registered.

Several test cases for the service's functionality are located in `api/tests`. To run them, run the following command:

```bash
# Tests the interaction for API calls into service
yarn test-service
# Tests interactions between service and aggregator nodes
yarn test-lighthouse
``` -->

### How RaaS Works

To innovate new use cases, you'll have to take apart your app. The RaaS application has two components: the API frontend and the smart contract backend. 

The backend stores the CID of the file and the infos used to complete the storage deal (e.g. the proof that the file is included on chain). It also has functionality to return active deals made with a particular CID, as well as deals that are about to expire.

The API frontend performs the following:
- **Allows users to register various jobs to be performed by the service**.
  - **Replication**: When building a storage solution with FVM on Filecoin, storage deals need to be replicated across geo location, policy sizes and reputation. Replication deals ensure that data can be replicated N times across a number of storage providers.
  - **Renewal**: When building storage solutions with FVM on Filecoin, storage deals need to be live for a long time. This service should be able to take an existing deal and renew it with the same or a different storage provider.
  - **Repair**: When building storage solutions with FVM on Filecoin, storage deals need to be stable. Repair jobs ensure that data can be maintained when it comes close to the end of its lifetime, or if the data somehow becomes inactive and needs to be repaired via. another storage provider.
  - **Monitors Smart Contract**: The node listens to the `SubmitAggregatorRequestWithRaaS` event in aggregators’ smart contract, and trigger the following workflow whenever it sees a new SubmitAggregatorRequestWithRaaS event. 
    - 1. A new`SubmitAggregatorRequestWithRaaS` event comes in, the node saves save the `txId` and `cid`, and go to the next step
    - 2. Create a new deal with aggregators (currently Lighthouse) by retrieving and uploading the data
    - 3. The status of cids and dealIds is stored locally into files
    - 4. Periodically check if the deal comes to repair or renewal and execute jobs when necessary.
    - 5. Post the `deal_id`, `inclusion_proof`, and `verifier_data` back to DealStatus Smart Contract by calling the `complete` method, along with the `txId` and `cid`

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

The `aggregator` field can be `lighthouse` for demo implementation. Feel free to integrate any other service for aggreagation as well.

The `jobType` field can be `all` but you can configure it to be any one of the following: `renew`, `replicate`, or `repair` so as to change the type of job that the service will perform.

## Using Lighthouse Raas Services

Lighthouse has deployed its own raas service on the Calibrationnet testnet as well as Filecoin Mainnet. You can Interact with the Lighthouse Raas service through the DealStatus contract deployed by Lighthouse at following addresses.

- Calibrationnet testnet: `0x4015c3E5453d38Df71539C0F7440603C69784d7a`

- Filecoin Mainnet:   `0xd928b92E6028463910b2005d118C2edE16C38a2a`

You can use the ILighthouseDealStatus interface [here](https://github.com/lighthouse-web3/raas-starter-kit/tree/raas-public/contracts/interfaces/ILighthouseDealStatus.sol) to use Lighthouse Raas service contract in your own contracts.

Also, you can directly call the submit-raas task as following to submit a job to Lighthouse Raas service.

```bash
yarn hardhat submit-raas --contract 0x4015c3E5453d38Df71539C0F7440603C69784d7a --piece-cid <Your-cid> --replications 2 --network calibrationnet
```
similarly for mainnet you can use the following command
```bash
yarn hardhat submit-raas --contract 0xd928b92E6028463910b2005d118C2edE16C38a2a --piece-cid <Your-cid> --replications 2 --network filecoinmainnet
```


Few things to keep in mind while using the Lighthouse Raas service:
- The params for renewal and repair have been decided by lighthouse universally for all the deals, thus giving different params would not modify those params. This is done to handle these jobs together easily for large number of cids.
- The cid uploaded for raas service must be pinned to IPFS so as to be retrieved by Lighthouse Deal Engine to execute raas jobs.
- Their is maxReplication param in LighthouseDealStatus contract which is currently set to 2 for both Calibrationnet testnet and Filecoin Mainnet. This means that you can only replicate your deal to 2 different miners using Lighthouse Raas service. This would be increased soon.

You can also interact with Lighthous verified contracts on Calibrationnet testnet and Filecoin Mainnet directly through Filfox. You can find the verified contracts here:

- [Calibrationnet testnet verified contracts](https://calibration.filfox.info/en/address/0x4015c3E5453d38Df71539C0F7440603C69784d7a)

- [Filecoin Mainnet verified contracts](https://filfox.info/en/address/0xd928b92E6028463910b2005d118C2edE16C38a2a)

## Run Your Own Raas and Innovate !!!

This repo has a basic demo implementation of Raas service. You can use this as a starting point to build your own Raas service. Few Ideas to build on could be:

- Build a Raas service that ensures that every file get replicated with different miners and with different raas params for different files.

- Set up on-chain payments for Raas service. Currently the Raas service is free to use. You can build a payment system on top of it.

-  You could come with innovative implementations of raas such that both data Providers and miners get paid for their services and slashed for their bad behavior using PoDSI integration in Raas service.



Find more information [here](https://www.notion.so/Renew-Replication-Starter-Kit-f57af3ebd221462b8b8ef2714178865a#fc387e4c63114459b2583572c823a4c5)
