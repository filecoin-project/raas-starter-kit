# Replication/Renewal-as-a-Service Starter Kit

## Introduction

This repository consists of two components to build a tool to renew or replicate storage deals.

* DealStatus Contract: a smart contract to query the status of storage deals.
* Service.js: a RaaS aplication that renew, replicate, or repair storage deals when necessary.

Please refer to this [doc](https://www.notion.so/pl-strflt/Data-FVM-234b7f4c17624cd8b972f92806732ca9) to understand more.

## Cloning the Repo

Open up your terminal (or command prompt) and navigate to a directory you would like to store this code on. Once there type in the following command:


```
git clone --recurse-submodules git@github.com:filecoin-project/raas-starter-kit.git
cd raas-starter-kit
yarn install
```


This will clone the hardhat kit onto your computer, switch directories into the newly installed kit, and install the dependencies the kit needs to work.


## Get a Private Key

You can get a private key from a wallet provider [such as Metamask](https://metamask.zendesk.com/hc/en-us/articles/360015289632-How-to-export-an-account-s-private-key).


## Add your Private Key as an Environment Variable

Add your private key as an environment variable by running this command:

 ```
export PRIVATE_KEY='abcdef'
```

If you use a .env file, don't commit and push any changes to .env files that may contain sensitive information, such as a private key! If this information reaches a public GitHub repository, someone can use it to check if you have any Mainnet funds in that wallet address, and steal them!


## Get the Deployer Address

Run this command:
```
yarn hardhat get-address
```

This will show you the ethereum-style address associated with that private key and the filecoin-style f4 address (also known as t4 address on testnets)! The Ethereum address can now be exclusively used for almost all FEVM tools, including the faucet.


## Fund the Deployer Address

Go to the [Calibrationnet testnet faucet](https://calibration.yoga/#faucet), and paste in the Ethereum address from the previous step. This will send some calibration testnet FIL to the account.


## Deploy the DealStatus Contract

Type in the following command in the terminal to deploy all contracts:

 ```
yarn hardhat deploy
```

This will compile the DealStatus contract and deploy it to the Calibrationnet test network automatically!

Keep note of the deployed contract address.

## Interacting with the RaaS application

The RaaS application is a server that handles REST API requests for renewing, replicating, or repairing storage deals. It is located in the `api` directory.

To start the server, run the following command:

```bash
yarn service
```

You can access a frontend of the app at [localhost:1337](http://localhost:1337/). 

Several test cases regarding the service's functionality are located in `api/tests`. To run them, run the following command:

```bash
# Tests the interaction for API calls into service
yarn test-service
# Tests interactions between service and aggregator nodes
yarn test-edge
yarn test-lighthouse
```

### Usage

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
curl --location 'http://localhost:1337/api/register_job?cid=QmbY5ZWR4RjxG82eUeWCmsVD1MrHNZhBQz5J4yynKLvgfZ&endDate=2023-07-15&jobType=replication&replication_target=1&aggregator=lighthouse&epochs=1000' \
--header 'Accept: application/json' \
--header 'User-Agent: SMB Redirect/1.0.0' \
--header 'Content-Type: application/json' \
--header 'Authorization: Basic ZDU5MWYyYzQtMzk0MS00ZWM4LTkyNTQtYjgzZDg1NmI2YmU5Om1xZkU5eklsVFFOdGVIUnY2WDEwQXVmYkNlN0pIUXVC' \
--data '    {
        "customerInternalReference": "JUMIOGENERATED",
        "userReference": "test"
    }'
```

Note: 
The `aggregator` field can be one of the following: `edge`, or `lighthouse`. This changes the type of aggregator node that the service will use to interact with the Filecoin network.

The `jobType` field can be one of the following: `renew`, `replicate`, or `repair`. This changes the type of job that the service will perform.

Find more information [here](https://www.notion.so/Renew-Replication-Starter-Kit-f57af3ebd221462b8b8ef2714178865a#fc387e4c63114459b2583572c823a4c5)