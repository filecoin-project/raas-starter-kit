// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// Uncomment this line to use console.log
// import "hardhat/console.sol";

import "./interfaces/IAggregatorOracle.sol";

contract DealStatus {

    IAggregatorOracle public deltaAggregatorOracle;
    mapping(bytes => uint64[]) public cidToActiveDealIDs;
    mapping(bytes => uint64[]) public cidToExpiringDealIDs;

    constructor(address _deltaAggregatorOracle) {
        deltaAggregatorOracle = IAggregatorOracle(_deltaAggregatorOracle);
    }

    // getActiveDeals should return all the _cid's active dealIds
    function getActiveDeals(bytes memory _cid) external returns (uint64[] memory) {
        // get all the deal ids for the cid
        uint64[] memory allDealIDs = deltaAggregatorOracle.getAllDeals(_cid);

        for (uint i = 0; i < allDealIDs.length; i++) {
            uint64 dealID = allDealIDs[i];
            // get the deal's expiration epoch
            MarketTypes.GetDealActivationReturn memory dealActivationStatus = MarketAPI.getDealActivation(dealID);
            
            if (dealActivationStatus.terminated == -1 && dealActivationStatus.activated != -1) {
                cidToActiveDealIDs[_cid].push(dealID);
            }
        }

        return cidToActiveDealIDs[_cid];
    }

    // getExpiringDeals should return all the deals' dealIds if they are expiring within `epochs`
    function getExpiringDeals(bytes memory _cid, uint64 epochs) external returns (uint64[] memory) {
        // the logic is similar to the above, but use this api call: 
        // https://github.com/Zondax/filecoin-solidity/blob/master/contracts/v0.8/MarketAPI.sol#LL110C9-L110C9
        uint64[] memory allDealIDs = deltaAggregatorOracle.getAllDeals(_cid);

        for (uint i = 0; i < allDealIDs.length; i++) {
            uint64 dealID = allDealIDs[i];
            // get the deal's expiration epoch
            MarketTypes.GetDealTermReturn memory dealTerm = MarketAPI.getDealTerm(dealID);
            
            if (block.timestamp > uint64(dealTerm.end) - epochs) {
                cidToExpiringDealIDs[_cid].push(dealID);
            }
        }

        return cidToExpiringDealIDs[_cid];
    }
}