const { getDealInfo, getBlockNumber } = require("./lotusApi.js")
const logger = require("./winston")
async function executeRepairJobs(lighthouseAggregator) {
    const REPAIR_EPOCHS = 1000 // Replace with the actual value
    const dealInfos = lighthouseAggregator.loadDealState()
    // Traverse through all the dealIds in dealNodeJobs
    for (const index in dealInfos) {
        const deal = dealInfos[index]
        try {
            logger.info("Running repair job for deal: " + deal.dealId)
            // Run getDealInfo for all deal ids
            const dealInfo = await getDealInfo(Number(deal.dealId))

            // Check if the response.data.result.state.slashepoch - EPOCHs < getBlockNumber()
            const blockNumber = await getBlockNumber()
            if (
                dealInfo.State.SectorStartEpoch > -1 &&
                dealInfo.State.SlashEpoch != -1 &&
                blockNumber - dealInfo.State.SlashEpoch > REPAIR_EPOCHS
            ) {
                // Call lighthouseProcessWithRetry for all cids in that deal of dealNodeJobs with their transactionId and replicationtarget as 1
                for (const cid of deal.cids) {
                    await lighthouseAggregator.lighthouseProcessWithRetry(
                        cid.cid,
                        cid.transactionId,
                        1
                    )
                }
                lighthouseAggregator.dealNodeJobs = lighthouseAggregator.dealNodeJobs.filter(
                    (dealJob) => dealJob.dealId !== deal.dealId
                )
                lighthouseAggregator.saveDealState()
            }
        } catch (error) {
            logger.error(error)
        }
    }
}

async function executeRenewalJobs(lighthouseAggregator) {
    const RENEWAL_EPOCHS = 1000 // Replace with the actual value
    const dealInfos = lighthouseAggregator.loadDealState()

    // Traverse through all the dealIds in dealNodeJobs
    for (const index in dealInfos) {
        // Run getDealInfo for all deal ids
        const deal = dealInfos[index]
        logger.info("Running renewal job for deal: " + deal.dealId)
        try {
            const x = await needRenewal(deal.dealId)
            if (x) {
                // console.log("Renewal job found", dealId)
                // Call lighthouseProcessWithRetry for all cids in that deal of dealNodeJobs with their transactionId and replicationtarget as 1
                for (const cid of deal.cids) {
                    await lighthouseAggregator.lighthouseProcessWithRetry(
                        cid.cid,
                        cid.transactionId,
                        1
                    )
                }
                lighthouseAggregator.dealNodeJobs = lighthouseAggregator.dealNodeJobs.filter(
                    (dealJob) => dealJob.dealId !== deal.dealId
                )
                lighthouseAggregator.saveDealState()
            }
        } catch (error) {
            logger.error(error)
        }
    }
}
async function needRenewal(dealId) {
    try {
        const RENEWAL_EPOCHS = 1000 // Replace with the actual value
        const dealInfo = await getDealInfo(Number(dealId))
        const blockNumber = await getBlockNumber()
        if (dealInfo.Proposal.EndEpoch - blockNumber < RENEWAL_EPOCHS) {
            return true
        }
        return false
    } catch (error) {
        logger.error(error)
        throw error
    }
}

module.exports = { executeRepairJobs, executeRenewalJobs, needRenewal }
