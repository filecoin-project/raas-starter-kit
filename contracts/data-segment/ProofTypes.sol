// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.17;

// Uncomment this line to use console.log
// import "hardhat/console.sol";

// ProofData is a Merkle proof
struct ProofData {
    uint64 index;
    bytes32[] path;
}

// InclusionPoof is produced by the aggregator (or possibly by the SP)
struct InclusionProof {
    // ProofSubtree is proof of inclusion of the client's data segment in the data aggregator's Merkle tree (includes position information)
    // I.e. a proof that the root node of the subtree containing all the nodes (leafs) of a data segment is contained in CommDA
    ProofData proofSubtree;
    // ProofIndex is a proof that an entry for the user's data is contained in the index of the aggregator's deal.
    // I.e. a proof that the data segment index constructed from the root of the user's data segment subtree is contained in the index of the deal tree.
    ProofData proofIndex;
}

// InclusionVerifierData is the information required for verification of the proof and is sourced
// from the client.
struct InclusionVerifierData {
    // Piece Commitment CID to client's data
    bytes commPc;
    // SizePc is size of client's data
    uint64 sizePc;
}

// InclusionAuxData is required for verification of the proof and needs to be cross-checked with the chain state
struct InclusionAuxData {
    // Piece Commitment CID to aggregator's deal
    bytes commPa;
    // SizePa is padded size of aggregator's deal
    uint64 sizePa;
}

// SegmentDesc is a description of a data segment.
struct SegmentDesc {
    bytes32 commDs;
    uint64 offset;
    uint64 size;
    bytes16 checksum;
}

struct Fr32 {
    bytes32 value;
}
