// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "../data-segment/Proof.sol";

// Behavioral Interface for an aggregator oracle
interface IAggregatorOracle {
    // Event emitted when a new request is submitted
    event SubmitAggregatorRequest(uint256 indexed id, bytes cid);

    event CompleteAggregatorRequest(uint256 indexed id, uint64 indexed dealId);

    // Function that submits a new request to the oracle
    function submit(bytes memory cid) external returns (uint256 id);

    // Callback function that is called by the aggregator
    function complete(
        uint256 _id,
        uint64 _dealId,
        InclusionProof memory _proof,
        InclusionVerifierData memory _verifierData
    ) external returns (InclusionAuxData memory);

    // Get all deal IDs for a specified cid
    function getAllDeals(bytes memory _cid) external returns (uint64[] memory);

    // getActiveDeals should return all the _cid's active dealIds
    function getActiveDeals(bytes memory _cid) external returns (uint64[] memory);

    // getExpiringDeals should return all the deals' dealIds if they are expiring within `epochs`
    function getExpiringDeals(bytes memory _cid, uint64 epochs) external returns (uint64[] memory);
}
