/**
 *
 *   (c) 2022 Zondax AG
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 *
 */
//
// DRAFT!! THIS CODE HAS NOT BEEN AUDITED - USE ONLY FOR PROTOTYPING

// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.17;

import "@zondax/filecoin-solidity/contracts/v0.8/types/MarketTypes.sol";
import "@zondax/filecoin-solidity/contracts/v0.8/cbor/MarketCbor.sol";
import "@zondax/filecoin-solidity/contracts/v0.8/cbor/BytesCbor.sol";
import "@zondax/filecoin-solidity/contracts/v0.8/cbor/FilecoinCbor.sol";

import "@zondax/filecoin-solidity/contracts/v0.8/types/CommonTypes.sol";
import "@zondax/filecoin-solidity/contracts/v0.8/utils/Misc.sol";
import "@zondax/filecoin-solidity/contracts/v0.8/utils/Actor.sol";

/// @title This library is a proxy to the singleton Storage Market actor (address: f05). Calling one of its methods will result in a cross-actor call being performed.
/// @author Zondax AG
library MarketAPI {
    using BytesCBOR for bytes;
    using MarketCBOR for *;
    using FilecoinCBOR for *;

    /// @notice Deposits the received value into the balance held in escrow.
    function addBalance(CommonTypes.FilAddress memory providerOrClient, uint256 value) internal {}

    /// @notice Attempt to withdraw the specified amount from the balance held in escrow.
    /// @notice If less than the specified amount is available, yields the entire available balance.
    function withdrawBalance(MarketTypes.WithdrawBalanceParams memory params)
        internal
        returns (CommonTypes.BigInt memory)
    {}

    /// @notice Return the escrow balance and locked amount for an address.
    /// @return the escrow balance and locked amount for an address.
    function getBalance(CommonTypes.FilAddress memory addr) internal returns (MarketTypes.GetBalanceReturn memory) {}

    /// @notice This will be available after the deal is published (whether or not is is activated) and up until some undefined period after it is terminated.
    /// @return the data commitment and size of a deal proposal.
    function getDealDataCommitment(uint64 dealID) internal returns (MarketTypes.GetDealDataCommitmentReturn memory) {}

    /// @notice get the client of the deal proposal.
    /// @return the client of a deal proposal.
    function getDealClient(uint64 dealID) internal returns (uint64) {}

    /// @notice get the provider of a deal proposal.
    /// @return the provider of a deal proposal.
    function getDealProvider(uint64 dealID) internal returns (uint64) {}

    /// @notice Get the label of a deal proposal.
    /// @return the label of a deal proposal.
    function getDealLabel(uint64 dealID) internal returns (string memory) {}

    /// @notice Get the start epoch and duration(in epochs) of a deal proposal.
    /// @return the start epoch and duration (in epochs) of a deal proposal.
    function getDealTerm(uint64 dealID) internal pure returns (MarketTypes.GetDealTermReturn memory) {
        return MarketTypes.GetDealTermReturn({start: 0, end: 1000});
    }

    /// @notice get the total price that will be paid from the client to the provider for this deal.
    /// @return the per-epoch price of a deal proposal.
    function getDealTotalPrice(uint64 dealID) internal returns (CommonTypes.BigInt memory) {}

    /// @notice get the client collateral requirement for a deal proposal.
    /// @return the client collateral requirement for a deal proposal.
    function getDealClientCollateral(uint64 dealID) internal returns (CommonTypes.BigInt memory) {}

    /// @notice get the provide collateral requirement for a deal proposal.
    /// @return the provider collateral requirement for a deal proposal.
    function getDealProviderCollateral(uint64 dealID) internal returns (CommonTypes.BigInt memory) {}

    /// @notice get the verified flag for a deal proposal.
    /// @notice Note that the source of truth for verified allocations and claims is the verified registry actor.
    /// @return the verified flag for a deal proposal.
    function getDealVerified(uint64 dealID) internal returns (bool) {}

    /// @notice Fetches activation state for a deal.
    /// @notice This will be available from when the proposal is published until an undefined period after the deal finishes (either normally or by termination).
    /// @return USR_NOT_FOUND if the deal doesn't exist (yet), or EX_DEAL_EXPIRED if the deal has been removed from state.
    function getDealActivation(uint64 dealID) internal pure returns (MarketTypes.GetDealActivationReturn memory) {
        return MarketTypes.GetDealActivationReturn({activated: 0, terminated: -1});
    }

    /// @notice Publish a new set of storage deals (not yet included in a sector).
    function publishStorageDeals(MarketTypes.PublishStorageDealsParams memory params)
        internal
        returns (MarketTypes.PublishStorageDealsReturn memory)
    {}
}
