const { getDealInfo, getBlockNumber } = require("./lotusApi.js")
async function executeRepairJobs(lighthouseAggregator) {
    const REPAIR_EPOCHS = 1000 // Replace with the actual value
    const dealInfos = lighthouseAggregator.loadDealState()
    // Traverse through all the dealIds in dealNodeJobs
    for (const dealId in dealInfos) {
        // Run getDealInfo for all deal ids
        const dealInfo = await getDealInfo(dealId)

        // Check if the response.data.result.state.slashepoch - EPOCHs < getBlockNumber()
        const blockNumber = await getBlockNumber()
        if (
            dealInfo.State.SectorStartEpoch > -1 &&
            dealInfo.State.SlashEpoch != -1 &&
            blockNumber - dealInfo.State.SlashEpoch > EPOCHS
        ) {
            // Call lighthouseProcessWithRetry for all cids in that deal of dealNodeJobs with their transactionId and replicationtarget as 1
            for (const deal of dealInfos[dealId]) {
                await lighthouseAggregator.lighthouseProcessWithRetry(
                    deal.cid,
                    deal.transactionId,
                    1
                )
            }
        }
    }
}

async function executeRenewalJobs(lighthouseAggregator) {
    const RENEWAL_EPOCHS = 1000 // Replace with the actual value
    const dealInfos = lighthouseAggregator.loadDealState()

    // Traverse through all the dealIds in dealNodeJobs
    for (const dealId in dealInfos) {
        // Run getDealInfo for all deal ids
        let dealInfo

        try {
            dealInfo = await getDealInfo(Number(dealId))
        } catch (error) {
            return
        }

        // Check if the response.data.result.state.slashepoch - EPOCHs < getBlockNumber()
        const blockNumber = await getBlockNumber()
        if (!dealInfo) {
            return
        }
        if (dealInfo.Proposal.EndEpoch - blockNumber > RENEWAL_EPOCHS) {
            // Call lighthouseProcessWithRetry for all cids in that deal of dealNodeJobs with their transactionId and replicationtarget as 1
            for (const deal of dealInfos[dealId]) {
                await lighthouseAggregator.lighthouseProcessWithRetry(
                    deal.cid,
                    deal.transactionId,
                    1
                )
            }
        }
    }
}

module.exports = { executeRepairJobs, executeRenewalJobs }
