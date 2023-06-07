// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// Uncomment this line to use console.log
// import "hardhat/console.sol";

import "./interfaces/IAggregatorOracle.sol";
import "./data-segment/Proof.sol";

import {MarketAPI} from "./mocks/MarketAPIMock.sol";
import { MarketTypes } from "@zondax/filecoin-solidity/contracts/v0.8/types/MarketTypes.sol";

// Delta that implements the AggregatorOracle interface
contract EdgeAggregatorOracle is IAggregatorOracle, Proof {

    uint256 private transactionId;
    mapping (uint256 => bytes) private txIdToCid;
    mapping (bytes => uint64[]) private cidToDealIds; 

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

    function complete(uint256 _id, uint64 _dealId, InclusionProof memory _proof, InclusionVerifierData memory _verifierData) external returns (InclusionAuxData memory) {
        require(_id <= transactionId, "Delta.complete: invalid transaction id");
        // Emit the event
        emit CompleteAggregatorRequest(_id, _dealId);

        // save the _dealId if it is not already saved
        bytes memory cid = txIdToCid[_id];
        for (uint i = 0; i < cidToDealIds[cid].length; i++) {
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
        return cidToDealIds[_cid];
    }
}