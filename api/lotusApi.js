// getDealInfo.js
const axios = require("axios")
require("dotenv").config()
const logger = require("./winston")
const url = process.env.LOTUS_RPC
function getData(method, params = []) {
    return {
        jsonrpc: "2.0",
        id: 1,
        method: method,
        params: params,
    }
}
async function getDealInfo(dealId) {
    const method = "Filecoin.StateMarketStorageDeal"
    const params = [dealId, []]

    const body = getData(method, params)
    // console.log("getDealInfo body: ", process.env.LOTUS_RPC, body)
    try {
        const response = await axios.post(url, body, {
            headers: {
                "Content-Type": "application/json",
            },
        })
        if (response.data.error) {
            logger.error(response.data.error.message)
            return null
        }
        // logger.info(response.data.result)
        return response.data.result
    } catch (error) {
        logger.error(error)
        throw error
    }
}

async function getBlockNumber() {
    const data = getData("eth_blockNumber")

    try {
        const response = await axios.post(url, data)

        // convert the result to a number
        const blockNumber = parseInt(response.data.result, 16)
        // logger.info(blockNumber)
        return blockNumber
    } catch (error) {
        logger.error(error)
        throw error
    }
}

// getDealInfo(147142)
// getBlockNumber()
module.exports = { getDealInfo, getBlockNumber }
