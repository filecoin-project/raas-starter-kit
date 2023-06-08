# Replication/Renewal-as-a-Service Starter Kit

## Introduction

This repository consists of two components to build a tool to renew or replicate storage deals.

* DealStatus Contract: a smart contract to query the status of storage deals.
* Service.js: a RaaS aplication that renew or replicate storage deals when necessary. It is not implemented and a few comments were provided.

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

## Use Ngrok

You may use [ngrok](https://ngrok.com/docs/getting-started/) to expose your localhost for public access
