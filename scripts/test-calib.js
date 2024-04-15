require("dotenv").config()
const { ethers } = require("ethers")
const CIDTool = require("cid-tool")

const dealStatusABI = require("./dealStatusABI")

const submit = async () => {
    const provider = new ethers.providers.JsonRpcProvider(
        "https://filecoin-calibration.chainup.net/rpc/v1"
    )
    const privateKey = process.env.PRIVATE_KEY
    const signer = new ethers.Wallet(privateKey, provider)
    // 0x6ec8722e6543fB5976a547434c8644b51e24785b
    const dealStatusContract = new ethers.Contract(
        "0xD4647276960E1B769a08E8f9f3Ecbd04b4475ED6",
        dealStatusABI,
        signer
    )
    // console.log("Get all deals")
    // cid = "QmPjPBsEjop5fvyocutSgftkKtE2YEoEG6EHNjRwzcrAPk"
    // let allDeals = await dealStatusContract.getAllDeals(ethers.utils.toUtf8Bytes(cid))
    // console.log("Deals : " + allDeals)
    // console.log("Submit A CID")

    // console.log("Executing Submit Function")
    // cid = "QmPjPBsEjop5fvyocutSgftkKtE2YEoEG6EHNjRwzcrAPk"
    // let tx1 = await dealStatusContract.submit(cid)
    // tx1 = await tx1.wait()
    // console.log("Transaction1 : " + tx1)
    // console.log("Submit A CID")

    // let allCIDs = await dealStatusContract.getAllCIDs()
    // console.log("AllCIDs: " + allCIDs)

    console.log("Get expiring deals")
    // let expDealsTx = await dealStatusContract.getExpiringDeals(ethers.utils.toUtf8Bytes(cid), 10000)
    // expDealsTx = await expDealsTx.wait()
    let dealInfo = await dealStatusContract.getDealExpiry(136287)
    console.log(JSON.stringify(dealInfo))
    // console.log("Expiring Deals : " + JSON.stringify(expDealsTx))
}

submit()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })
