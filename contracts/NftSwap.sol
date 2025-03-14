// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract NftSwap {
    enum TradeStatus {
        Proposed,
        Agreed,
        Confirmed,
        Swapped,
        Cancelled
    }

    struct Trade {
        address proposer;
        address offeredNftContract;
        uint256 offeredNftId;
        address requestedNftContract;
        uint256 requestedNftId;
        TradeStatus status;
    }

    Trade[] public trades;

    function proposeTrade(
        address _offeredNftContract,
        uint256 _offeredNftId,
        address _requestedNftContract,
        uint256 _requestedNftId
    ) public {
        Trade memory newTrade = Trade({
            proposer: msg.sender,
            offeredNftContract: _offeredNftContract,
            offeredNftId: _offeredNftId,
            requestedNftContract: _requestedNftContract,
            requestedNftId: _requestedNftId,
            status: TradeStatus.Proposed
        });
        trades.push(newTrade);
    }
}
