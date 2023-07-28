// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

// Uncomment this line to use console.log
// import "hardhat/console.sol";

import "./interfaces/IAggregatorOracle.sol";
import "./data-segment/Proof.sol";

import {MarketAPI} from "@zondax/filecoin-solidity/contracts/v0.8/MarketAPI.sol";
import {MarketTypes} from "@zondax/filecoin-solidity/contracts/v0.8/types/MarketTypes.sol";

// Delta that implements the AggregatorOracle interface
contract DealStatus is IAggregatorOracle, Proof {
    uint256 private transactionId;
    mapping(uint256 => bytes) private txIdToCid;
    mapping(bytes => Deal[]) private cidToDeals;

    constructor() {
        transactionId = 0;
    }

    function submit(bytes memory _cid) external returns (uint256) {
        // Increment the transaction ID
        transactionId++;

        // Save _cid
        txIdToCid[transactionId] = _cid;

        // Emit the event
        emit SubmitAggregatorRequest(transactionId, _cid);
        return transactionId;
    }

    // TODO: use _miner integer
    function complete(
        uint256 _id,
        uint64 _dealId,
        uint64 _miner,
        InclusionProof memory _proof,
        InclusionVerifierData memory _verifierData
    ) external returns (InclusionAuxData memory) {
        require(_id <= transactionId, "Delta.complete: invalid tx id");
        // Emit the event
        emit CompleteAggregatorRequest(_id, _dealId);

        // save the _dealId if it is not already saved
        bytes memory cid = txIdToCid[_id];
        for (uint256 i = 0; i < cidToDeals[cid].length; i++) {
            if (cidToDeals[cid][i].dealId == _dealId) {
                return this.computeExpectedAuxData(_proof, _verifierData);
            }
        }

        Deal memory deal = Deal(_dealId, _miner);
        cidToDeals[cid].push(deal);

        // Perform validation logic
        // return this.computeExpectedAuxDataWithDeal(_dealId, _proof, _verifierData);
        return this.computeExpectedAuxData(_proof, _verifierData);
    }

    // allDealIds should return all the deal ids created by the aggregator
    function getAllDeals(bytes memory _cid) external view returns (Deal[] memory) {
        return cidToDeals[_cid];
    }

    // getActiveDeals should return all the _cid's active dealIds
    function getActiveDeals(bytes memory _cid) external returns (Deal[] memory) {
        // get all the deal ids for the cid
        Deal[] memory activeDealIDs;
        activeDealIDs = this.getAllDeals(_cid);

        for (uint256 i = 0; i < activeDealIDs.length; i++) {
            uint64 dealID = activeDealIDs[i].dealId;
            // get the deal's expiration epoch
            MarketTypes.GetDealActivationReturn memory dealActivationStatus = MarketAPI.getDealActivation(dealID);

            if (dealActivationStatus.terminated > 0 || dealActivationStatus.activated == -1) {
                delete activeDealIDs[i];
            }
        }

        return activeDealIDs;
    }

    // getExpiringDeals should return all the deals' dealIds if they are expiring within `epochs`
    function getExpiringDeals(bytes memory _cid, uint64 epochs) external returns (Deal[] memory) {
        // the logic is similar to the above, but use this api call:
        // https://github.com/Zondax/filecoin-solidity/blob/master/contracts/v0.8/MarketAPI.sol#LL110C9-L110C9
        Deal[] memory expiringDealIDs;
        expiringDealIDs = this.getAllDeals(_cid);

        for (uint256 i = 0; i < expiringDealIDs.length; i++) {
            uint64 dealID = expiringDealIDs[i].dealId;
            // get the deal's expiration epoch
            MarketTypes.GetDealTermReturn memory dealTerm = MarketAPI.getDealTerm(dealID);

            if (block.timestamp < uint64(dealTerm.end) - epochs) {
                delete expiringDealIDs[i];
            }
        }

        return expiringDealIDs;
    }
}
