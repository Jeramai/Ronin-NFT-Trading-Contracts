// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract NftSwap {
    enum TradeStatus {
        Proposed,
        Agreed,
        Confirmed,
        Completed,
        Cancelled
    }

    struct Trade {
        address fromAddress;
        address fromNftContract;
        uint256 fromNftId;
        bool fromHasAgreed;
        bool fromHasConfirmed;
        
        address toAddress;
        address toNftContract;
        uint256 toNftId;
        bool toHasAgreed;
        bool toHasConfirmed;

        TradeStatus status;
    }

    Trade[] public trades;

    event TradeProposed(uint256 tradeId);
    event TradeAgreed(uint256 tradeId, address user);
    event TradeConfirmed(uint256 tradeId, address user);
    event TradeCompleted(uint256 tradeId);
    event TradeCancelled(uint256 tradeId);
    
    function proposeTrade(
        address _fromNftContract,
        uint256 _fromNftId,
        address _toNftContract,
        uint256 _toNftId,
        address _toAddress
    ) external returns (uint256) {
        require(_toAddress != msg.sender, "Cannot trade with yourself");
        
        Trade memory newTrade = Trade({
            fromAddress: msg.sender,
            fromNftContract: _fromNftContract,
            fromNftId: _fromNftId,
            fromHasAgreed: false,
            fromHasConfirmed: false,
            
            toAddress: _toAddress,
            toNftContract: _toNftContract,
            toNftId: _toNftId,
            toHasAgreed: false,
            toHasConfirmed: false,
            
            status: TradeStatus.Proposed
        });

        trades.push(newTrade);
        
        uint256 tradeId = trades.length - 1;
        emit TradeProposed(tradeId);

        return tradeId;
    }
    function agreeTrade(uint256 _tradeId) external {
        require(_tradeId < trades.length, "Trade does not exist");
        Trade storage trade = trades[_tradeId];
        
        require(trade.status == TradeStatus.Proposed, "Trade is not in proposed state");
        require(
            msg.sender == trade.fromAddress || msg.sender == trade.toAddress,
            "Not authorized to agree to this trade"
        );

        if (msg.sender == trade.fromAddress) {
            require(!trade.fromHasAgreed, "Already agreed to this trade");
            trade.fromHasAgreed = true;
        } else {
            require(!trade.toHasAgreed, "Already agreed to this trade");
            trade.toHasAgreed = true;
        }

        // If both parties have agreed, update status
        if (trade.fromHasAgreed && trade.toHasAgreed) {
            trade.status = TradeStatus.Agreed;
        }

        emit TradeAgreed(_tradeId, msg.sender);
    }
    function confirmTrade(uint256 _tradeId) external {
        require(_tradeId < trades.length, "Trade does not exist");
        Trade storage trade = trades[_tradeId];
        
        require(trade.status == TradeStatus.Agreed, "Trade is not in agreed state");
        require(
            msg.sender == trade.fromAddress || msg.sender == trade.toAddress,
            "Not authorized to confirm to this trade"
        );

        if (msg.sender == trade.fromAddress) {
            require(!trade.fromHasConfirmed, "Already confirmed this trade");
            trade.fromHasConfirmed = true;
        } else {
            require(!trade.toHasConfirmed, "Already confirmed this trade");
            trade.toHasConfirmed = true;
        }

        // If both parties have confirmed, update status
        if (trade.fromHasConfirmed && trade.toHasConfirmed) {
            trade.status = TradeStatus.Confirmed;
        }

        emit TradeConfirmed(_tradeId, msg.sender);
    }

    
    function getTrade(uint256 _tradeId) public view returns (Trade memory) {
        return trades[_tradeId];
    }
} 
