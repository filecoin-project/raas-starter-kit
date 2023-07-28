// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

// Uncomment this line to use console.log
// import "hardhat/console.sol";

import "./IAggregatorOracleMock.sol";
import "./ProofMock.sol";

import {MarketAPI} from "./MarketAPIMock.sol";
import {MarketTypes} from "@zondax/filecoin-solidity/contracts/v0.8/types/MarketTypes.sol";

// Delta that implements the AggregatorOracle interface
contract DealStatusMock is IAggregatorOracle, ProofMock {
    uint256 private transactionId;
    mapping(uint256 => bytes) private txIdToCid;
    mapping(bytes => uint64[]) private cidToDealIds;

    event ActiveDeals(uint64[] activeDealIDs);
    event ExpiringDeals(uint64[] expiringDealIDs);

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

    function complete(
        uint256 _id,
        uint64 _dealId,
        InclusionProof memory _proof,
        InclusionVerifierData memory _verifierData
    ) external returns (InclusionAuxData memory) {
        require(_id <= transactionId, "Delta.complete: invalid transaction id");
        // Emit the event
        emit CompleteAggregatorRequest(_id, _dealId);

        // save the _dealId if it is not already saved
        bytes memory cid = txIdToCid[_id];
        for (uint256 i = 0; i < cidToDealIds[cid].length; i++) {
            if (cidToDealIds[cid][i] == _dealId) {
                return this.computeExpectedAuxData(_proof, _verifierData);
            }
        }
        cidToDealIds[cid].push(_dealId);

        // Perform validation logic
        // return this.computeExpectedAuxDataWithDeal(_dealId, _proof, _verifierData);
        return this.computeExpectedAuxData(_proof, _verifierData);
    }

    // allDealIds should return all the deal ids created by the aggregator
    function getAllDeals(bytes memory _cid) external view returns (uint64[] memory) {
        // RETURN ALL MINERS TOO
        return cidToDealIds[_cid];
    }

    // getActiveDeals should return all the _cid's active dealIds
    function getActiveDeals(bytes memory _cid) external returns (uint64[] memory) {
        // get all the deal ids for the cid
        uint64[] memory activeDealIDs;
        activeDealIDs = this.getAllDeals(_cid);

        for (uint256 i = 0; i < activeDealIDs.length; i++) {
            uint64 dealID = activeDealIDs[i];
            // get the deal's expiration epoch
            MarketTypes.GetDealActivationReturn memory dealActivationStatus = MarketAPI.getDealActivation(dealID);

            if (dealActivationStatus.terminated > 0 || dealActivationStatus.activated == -1) {
                delete activeDealIDs[i];
            }
        }

        return activeDealIDs;
    }

    // getExpiringDeals should return all the deals' dealIds if they are expiring within `epochs`
    function getExpiringDeals(bytes memory _cid, uint64 epochs) external returns (uint64[] memory) {
        // the logic is similar to the above, but use this api call:
        // https://github.com/Zondax/filecoin-solidity/blob/master/contracts/v0.8/MarketAPI.sol#LL110C9-L110C9
        uint64[] memory expiringDealIDs;
        expiringDealIDs = this.getAllDeals(_cid);

        for (uint256 i = 0; i < expiringDealIDs.length; i++) {
            uint64 dealID = expiringDealIDs[i];
            // get the deal's expiration epoch
            MarketTypes.GetDealTermReturn memory dealTerm = MarketAPI.getDealTerm(dealID);

            if (block.timestamp < uint64(dealTerm.end) - epochs) {
                delete expiringDealIDs[i];
            }
        }

        return expiringDealIDs;
    }
}
