// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// Uncomment this line to use console.log
// import "hardhat/console.sol";

import "./interfaces/IAggregatorOracle.sol";

contract DealStatus {

    IAggregatorOracle public edgeAggregatorOracle;

    event ActiveDeals(uint64[] activeDealIDs);
    event ExpiringDeals(uint64[] expiringDealIDs);

    constructor(address _edgeAggregatorOracle) {
        edgeAggregatorOracle = IAggregatorOracle(_edgeAggregatorOracle);
    }

    // getActiveDeals should return all the _cid's active dealIds
    function getActiveDeals(bytes memory _cid) external returns (uint64[] memory activeDealIDs) {
        // get all the deal ids for the cid
        activeDealIDs = edgeAggregatorOracle.getAllDeals(_cid);

        for (uint i = 0; i < activeDealIDs.length; i++) {
            uint64 dealID = activeDealIDs[i];
            // get the deal's expiration epoch
            MarketTypes.GetDealActivationReturn memory dealActivationStatus = MarketAPI.getDealActivation(dealID);
            
            if (dealActivationStatus.terminated > 0 && dealActivationStatus.activated == -1) {
                delete activeDealIDs[i];
            }
        }

        emit ActiveDeals(activeDealIDs);
    }

    // getExpiringDeals should return all the deals' dealIds if they are expiring within `epochs`
    function getExpiringDeals(bytes memory _cid, uint64 epochs) external returns (uint64[] memory expiringDealIDs) {
        // the logic is similar to the above, but use this api call: 
        // https://github.com/Zondax/filecoin-solidity/blob/master/contracts/v0.8/MarketAPI.sol#LL110C9-L110C9
        expiringDealIDs = edgeAggregatorOracle.getAllDeals(_cid);

        for (uint i = 0; i < expiringDealIDs.length; i++) {
            uint64 dealID = expiringDealIDs[i];
            // get the deal's expiration epoch
            MarketTypes.GetDealTermReturn memory dealTerm = MarketAPI.getDealTerm(dealID);
            
            if (block.timestamp < uint64(dealTerm.end) - epochs) {
                delete expiringDealIDs[i];
            }
        }

        emit ExpiringDeals(expiringDealIDs);
    }
}