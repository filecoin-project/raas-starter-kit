// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {ProofData, InclusionProof, InclusionVerifierData, InclusionAuxData, SegmentDesc, Fr32} from "../data-segment/ProofTypes.sol";

// Behavioral Interface for an aggregator oracle
interface IAggregatorOracle {
    struct Deal {
        // A unique identifier for the deal.
        uint64 dealId;
        // The miner that is storing the data for the deal.
        uint64 minerId;
    }

    // Emitted when a new request is submitted with an ID and content identifier (CID).
    event SubmitAggregatorRequest(uint256 indexed id, bytes cid);

    // Emitted when a request is completed, providing the request ID and deal ID.
    event CompleteAggregatorRequest(uint256 indexed id, uint64 indexed dealId);

    // Function that submits a new request to the oracle
    function submit(bytes memory _cid) external returns (uint256);

    // Callback function that is called by the aggregator
    function complete(
        uint256 _id,
        uint64 _dealId,
        uint64 _minerId,
        InclusionProof memory _proof,
        InclusionVerifierData memory _verifierData
    ) external returns (InclusionAuxData memory);

    function getAllCIDs() external view returns (bytes[] memory);

    // Get all deal IDs for a specified cid
    function getAllDeals(bytes memory _cid) external view returns (Deal[] memory);

    // getActiveDeals should return all the _cid's active dealIds
    function getActiveDeals(bytes memory _cid) external returns (Deal[] memory);

    // getExpiringDeals should return all the deals' dealIds if they are expiring within `epochs`
    function getExpiringDeals(bytes memory _cid, uint64 epochs) external returns (Deal[] memory);
}
