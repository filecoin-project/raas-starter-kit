module.exports = [
    {
        inputs: [],
        stateMutability: "nonpayable",
        type: "constructor",
    },
    {
        inputs: [
            {
                internalType: "int256",
                name: "errorCode",
                type: "int256",
            },
        ],
        name: "ActorError",
        type: "error",
    },
    {
        inputs: [],
        name: "FailToCallActor",
        type: "error",
    },
    {
        inputs: [
            {
                internalType: "uint64",
                name: "",
                type: "uint64",
            },
        ],
        name: "InvalidCodec",
        type: "error",
    },
    {
        inputs: [],
        name: "InvalidResponseLength",
        type: "error",
    },
    {
        inputs: [
            {
                internalType: "uint256",
                name: "balance",
                type: "uint256",
            },
            {
                internalType: "uint256",
                name: "value",
                type: "uint256",
            },
        ],
        name: "NotEnoughBalance",
        type: "error",
    },
    {
        anonymous: false,
        inputs: [
            {
                indexed: true,
                internalType: "uint256",
                name: "id",
                type: "uint256",
            },
            {
                indexed: true,
                internalType: "uint64",
                name: "dealId",
                type: "uint64",
            },
        ],
        name: "CompleteAggregatorRequest",
        type: "event",
    },
    {
        anonymous: false,
        inputs: [
            {
                indexed: true,
                internalType: "uint256",
                name: "id",
                type: "uint256",
            },
            {
                indexed: false,
                internalType: "bytes",
                name: "cid",
                type: "bytes",
            },
        ],
        name: "SubmitAggregatorRequest",
        type: "event",
    },
    {
        anonymous: false,
        inputs: [
            {
                indexed: true,
                internalType: "uint256",
                name: "id",
                type: "uint256",
            },
            {
                indexed: false,
                internalType: "bytes",
                name: "cid",
                type: "bytes",
            },
            {
                indexed: false,
                internalType: "uint256",
                name: "_replication_target",
                type: "uint256",
            },
            {
                indexed: false,
                internalType: "uint256",
                name: "_repair_threshold",
                type: "uint256",
            },
            {
                indexed: false,
                internalType: "uint256",
                name: "_renew_threshold",
                type: "uint256",
            },
        ],
        name: "SubmitAggregatorRequestWithRaaS",
        type: "event",
    },
    {
        inputs: [
            {
                internalType: "uint256",
                name: "_id",
                type: "uint256",
            },
            {
                internalType: "uint64",
                name: "_dealId",
                type: "uint64",
            },
            {
                internalType: "uint64",
                name: "_minerId",
                type: "uint64",
            },
            {
                components: [
                    {
                        components: [
                            {
                                internalType: "uint64",
                                name: "index",
                                type: "uint64",
                            },
                            {
                                internalType: "bytes32[]",
                                name: "path",
                                type: "bytes32[]",
                            },
                        ],
                        internalType: "struct ProofData",
                        name: "proofSubtree",
                        type: "tuple",
                    },
                    {
                        components: [
                            {
                                internalType: "uint64",
                                name: "index",
                                type: "uint64",
                            },
                            {
                                internalType: "bytes32[]",
                                name: "path",
                                type: "bytes32[]",
                            },
                        ],
                        internalType: "struct ProofData",
                        name: "proofIndex",
                        type: "tuple",
                    },
                ],
                internalType: "struct InclusionProof",
                name: "_proof",
                type: "tuple",
            },
            {
                components: [
                    {
                        internalType: "bytes",
                        name: "commPc",
                        type: "bytes",
                    },
                    {
                        internalType: "uint64",
                        name: "sizePc",
                        type: "uint64",
                    },
                ],
                internalType: "struct InclusionVerifierData",
                name: "_verifierData",
                type: "tuple",
            },
        ],
        name: "complete",
        outputs: [
            {
                components: [
                    {
                        internalType: "bytes",
                        name: "commPa",
                        type: "bytes",
                    },
                    {
                        internalType: "uint64",
                        name: "sizePa",
                        type: "uint64",
                    },
                ],
                internalType: "struct InclusionAuxData",
                name: "",
                type: "tuple",
            },
        ],
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        inputs: [
            {
                components: [
                    {
                        components: [
                            {
                                internalType: "uint64",
                                name: "index",
                                type: "uint64",
                            },
                            {
                                internalType: "bytes32[]",
                                name: "path",
                                type: "bytes32[]",
                            },
                        ],
                        internalType: "struct ProofData",
                        name: "proofSubtree",
                        type: "tuple",
                    },
                    {
                        components: [
                            {
                                internalType: "uint64",
                                name: "index",
                                type: "uint64",
                            },
                            {
                                internalType: "bytes32[]",
                                name: "path",
                                type: "bytes32[]",
                            },
                        ],
                        internalType: "struct ProofData",
                        name: "proofIndex",
                        type: "tuple",
                    },
                ],
                internalType: "struct InclusionProof",
                name: "_proof",
                type: "tuple",
            },
            {
                components: [
                    {
                        internalType: "bytes",
                        name: "commPc",
                        type: "bytes",
                    },
                    {
                        internalType: "uint64",
                        name: "sizePc",
                        type: "uint64",
                    },
                ],
                internalType: "struct InclusionVerifierData",
                name: "_verifierData",
                type: "tuple",
            },
        ],
        name: "computeExpectedAuxDataPublic",
        outputs: [
            {
                components: [
                    {
                        internalType: "bytes",
                        name: "commPa",
                        type: "bytes",
                    },
                    {
                        internalType: "uint64",
                        name: "sizePa",
                        type: "uint64",
                    },
                ],
                internalType: "struct InclusionAuxData",
                name: "",
                type: "tuple",
            },
        ],
        stateMutability: "pure",
        type: "function",
    },
    {
        inputs: [
            {
                internalType: "bytes",
                name: "_cid",
                type: "bytes",
            },
        ],
        name: "getActiveDeals",
        outputs: [
            {
                components: [
                    {
                        internalType: "uint64",
                        name: "dealId",
                        type: "uint64",
                    },
                    {
                        internalType: "uint64",
                        name: "minerId",
                        type: "uint64",
                    },
                ],
                internalType: "struct IAggregatorOracle.Deal[]",
                name: "",
                type: "tuple[]",
            },
        ],
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        inputs: [],
        name: "getAllCIDs",
        outputs: [
            {
                internalType: "bytes[]",
                name: "",
                type: "bytes[]",
            },
        ],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [
            {
                internalType: "bytes",
                name: "_cid",
                type: "bytes",
            },
        ],
        name: "getAllDeals",
        outputs: [
            {
                components: [
                    {
                        internalType: "uint64",
                        name: "dealId",
                        type: "uint64",
                    },
                    {
                        internalType: "uint64",
                        name: "minerId",
                        type: "uint64",
                    },
                ],
                internalType: "struct IAggregatorOracle.Deal[]",
                name: "",
                type: "tuple[]",
            },
        ],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [
            {
                internalType: "uint64",
                name: "dealID",
                type: "uint64",
            },
        ],
        name: "getDealExpiry",
        outputs: [
            {
                components: [
                    {
                        internalType: "int64",
                        name: "start",
                        type: "int64",
                    },
                    {
                        internalType: "int64",
                        name: "end",
                        type: "int64",
                    },
                ],
                internalType: "struct MarketTypes.GetDealTermReturn",
                name: "",
                type: "tuple",
            },
        ],
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        inputs: [
            {
                internalType: "bytes",
                name: "_cid",
                type: "bytes",
            },
            {
                internalType: "uint64",
                name: "epochs",
                type: "uint64",
            },
        ],
        name: "getExpiringDeals",
        outputs: [
            {
                components: [
                    {
                        internalType: "uint64",
                        name: "dealId",
                        type: "uint64",
                    },
                    {
                        internalType: "uint64",
                        name: "minerId",
                        type: "uint64",
                    },
                ],
                internalType: "struct IAggregatorOracle.Deal[]",
                name: "",
                type: "tuple[]",
            },
        ],
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        inputs: [
            {
                internalType: "bytes",
                name: "_cid",
                type: "bytes",
            },
        ],
        name: "submit",
        outputs: [
            {
                internalType: "uint256",
                name: "",
                type: "uint256",
            },
        ],
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        inputs: [
            {
                internalType: "bytes",
                name: "_cid",
                type: "bytes",
            },
            {
                internalType: "uint256",
                name: "_replication_target",
                type: "uint256",
            },
            {
                internalType: "uint256",
                name: "_repair_threshold",
                type: "uint256",
            },
            {
                internalType: "uint256",
                name: "_renew_threshold",
                type: "uint256",
            },
        ],
        name: "submitRaaS",
        outputs: [
            {
                internalType: "uint256",
                name: "",
                type: "uint256",
            },
        ],
        stateMutability: "nonpayable",
        type: "function",
    },
]
