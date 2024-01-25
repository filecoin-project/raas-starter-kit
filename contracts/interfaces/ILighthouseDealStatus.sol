// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {ProofData, InclusionProof, InclusionVerifierData, InclusionAuxData, SegmentDesc, Fr32} from "../data-segment/ProofTypes.sol";

interface ILighthouseDealStatus {
    struct Deal {
        // A unique identifier for the deal.
        uint64 dealId;
        // The miner that is storing the data for the deal.
        uint64 minerId;
    }

    function submit(bytes memory _cid) external returns (uint256);

    function submitRaaS(
        bytes memory _cid,
        uint256 _replication_target,
        uint256 _repair_threshold,
        uint256 _renew_threshold
    ) external returns (uint256);

    function complete(
        uint256 _id,
        uint64 _dealId,
        uint64 _minerId,
        InclusionProof memory _proof,
        InclusionVerifierData memory _verifierData
    ) external returns (InclusionAuxData memory);

    function getAllDeals(bytes memory _cid) external view returns (Deal[] memory);

    function getAllCIDs() external view returns (bytes[] memory);

    function getActiveDeals(bytes memory _cid) external returns (Deal[] memory);

    function getExpiringDeals(bytes memory _cid, uint64 epochs) external returns (Deal[] memory);

    function changeMaxReplications(uint256 _maxReplications) external;

    // Only in Lighthouse Deal Status implementation
    function getMaxReplications() external view returns (uint256);
}
