task("submit-raas", "Calls submit raas function of dealStatus")
    .addParam("contract", "The address of the deal status solidity")
    .addParam("pieceCid", "The piece CID of the deal you want the status of")
    .addParam("replications", "The number of replications needed")
    .setAction(async (taskArgs) => {
        const contractAddr = taskArgs.contract
        const cid = ethers.utils.toUtf8Bytes(taskArgs.pieceCid)
        const replications = taskArgs.replications

        const networkId = network.name
        console.log("Getting deal status on network", networkId)

        //create a new wallet instance
        const wallet = new ethers.Wallet(network.config.accounts[0], ethers.provider)

        //create a DealStatus contract factory
        const DealStatus = await ethers.getContractFactory("DealStatus")
        //create a DealStatus contract instance
        //this is what you will call to interact with the deployed contract
        const dealStatus = await DealStatus.attach(contractAddr)

        //send a transaction to call makeDealProposal() method
        transaction = await dealStatus.submitRaaS(cid, replications, 1000, 1000)
        transactionReceipt = await transaction.wait()
        // console.log(transactionReceipt)

        // let result = await dealStatus.pieceStatus(cidHex)
        // console.log("The deal status is:", result)
    })
