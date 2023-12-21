require("hardhat-deploy")
require("hardhat-deploy-ethers")

const { networkConfig } = require("../helper-hardhat-config")

const private_key = network.config.accounts[0]
const wallet = new ethers.Wallet(private_key, ethers.provider)

module.exports = async ({ deployments }) => {
    // ethers is available in the global scope
    const [deployer] = await ethers.getSigners()
    console.log("Deploying the contracts with the account:", await deployer.getAddress())

    console.log("Account balance:", (await deployer.getBalance()).toString())

    const accounts = await ethers.getSigners()
    //console.log(accounts[0])

    console.log("Wallet Ethereum Address:", wallet.address)

    //deploy DealStatus
    const dealStatus = await ethers.getContractFactory("DealStatus", accounts[0])
    console.log("Deploying DealStatus...")
    const dealstatus = await dealStatus.deploy()
    await dealstatus.deployed()
    console.log("DealStatus deployed to:", dealstatus.address)
}
