// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { IERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract NftSwap {
    enum TradeStatus {
        Proposed,
        Agreed,
        Confirmed,
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
    
    function executeTrade(uint256 _tradeId) internal {
        require(_tradeId < trades.length, "Trade does not exist");
        Trade storage trade = trades[_tradeId];
        
        require(trade.status == TradeStatus.Confirmed, "Trade is not in confirmed state");
        require(
            msg.sender == trade.fromAddress || msg.sender == trade.toAddress,
            "Not authorized to execute this trade"
        );

        // Get references to both NFT contracts
        IERC721 fromNft = IERC721(trade.fromNftContract);
        IERC721 toNft = IERC721(trade.toNftContract);

        // Check if the contract has approval to transfer the NFTs
        require(
            fromNft.isApprovedForAll(trade.fromAddress, address(this)) ||
            fromNft.getApproved(trade.fromNftId) == address(this),
            "Contract not approved to transfer first NFT"
        );
        require(
            toNft.isApprovedForAll(trade.toAddress, address(this)) ||
            toNft.getApproved(trade.toNftId) == address(this),
            "Contract not approved to transfer second NFT"
        );

        // Verify current ownership
        require(
            fromNft.ownerOf(trade.fromNftId) == trade.fromAddress,
            "Sender no longer owns the offered NFT"
        );
        require(
            toNft.ownerOf(trade.toNftId) == trade.toAddress,
            "Receiver no longer owns the requested NFT"
        );

        // Execute the transfers using a try-catch to handle potential transfer failures
        try fromNft.transferFrom(trade.fromAddress, trade.toAddress, trade.fromNftId) {
            try toNft.transferFrom(trade.toAddress, trade.fromAddress, trade.toNftId) {
                // Both transfers successful
                emit TradeCompleted(_tradeId);
                return;
            } catch {
                // If second transfer fails, revert first transfer
                fromNft.transferFrom(trade.toAddress, trade.fromAddress, trade.fromNftId);
                revert("Second NFT transfer failed");
            }
        } catch {
            revert("First NFT transfer failed");
        }
    }

    function proposeTrade(
        address _toAddress
    ) external returns (uint256) {
        require(_toAddress != msg.sender, "Cannot trade with yourself"); 

        Trade memory newTrade = Trade({
            fromAddress: msg.sender, 
            fromNftContract: address(0),
            fromNftId: 0,
            fromHasAgreed: false,
            fromHasConfirmed: false,

            toAddress: _toAddress, 
            toNftContract: address(0),
            toNftId: 0,
            toHasAgreed: false,
            toHasConfirmed: false,

            status: TradeStatus.Proposed
        });

        trades.push(newTrade);
        
        uint256 tradeId = trades.length - 1;
        emit TradeProposed(tradeId);

        return tradeId;
    }
    function agreeTrade(uint256 _tradeId,
        address _fromNftContract,
        uint256 _fromNftId,
        address _toNftContract,
        uint256 _toNftId) external {
        require(_tradeId < trades.length, "Trade does not exist");
        Trade storage trade = trades[_tradeId];
        
        require(trade.status == TradeStatus.Proposed, "Trade is not in proposed state");
        require(
            msg.sender == trade.fromAddress || msg.sender == trade.toAddress,
            "Not authorized to agree to this trade"
        );

        // Only agree once
        if (msg.sender == trade.fromAddress) {
            require(!trade.fromHasAgreed, "Already agreed to this trade");
            trade.fromHasAgreed = true;
        } else {
            require(!trade.toHasAgreed, "Already agreed to this trade");
            trade.toHasAgreed = true;
        }
        
        // Check NFT ownership self
        IERC721 fromNft = IERC721(_fromNftContract);
        try fromNft.ownerOf(_fromNftId) returns (address owner) { 
            require(owner == trade.fromAddress, "You do not own this NFT");
        } catch {
            revert("Requested NFT does not exist");
        }

        // Check for requested NFT ownership
        IERC721 toNft = IERC721(_toNftContract); 
        try toNft.ownerOf(_toNftId) returns (address owner) {
            require(owner == trade.toAddress, "Requested NFT is not owned by target address");
        } catch {
            revert("Requested NFT does not exist");
        } 

        // If both parties have agreed, update
        if (trade.fromHasAgreed && trade.toHasAgreed) { 
            trade.fromNftContract = _fromNftContract; 
            trade.fromNftId = _fromNftId; 
            
            trade.toNftContract = _toNftContract;
            trade.toNftId = _toNftId;

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
            "Not authorized to confirm this trade"
        );

        // Add ownership verification before confirming
        IERC721 fromNft = IERC721(trade.fromNftContract);
        IERC721 toNft = IERC721(trade.toNftContract);
        
        // If ownership has changed, automatically cancel the trade
        if (fromNft.ownerOf(trade.fromNftId) != trade.fromAddress ||
            toNft.ownerOf(trade.toNftId) != trade.toAddress) {
            trade.status = TradeStatus.Cancelled;
            emit TradeCancelled(_tradeId);
            revert("Trade cancelled - NFT ownership changed");
        }
        
        // Ownership check condition
        if(msg.sender == trade.fromAddress){
            require(
                fromNft.isApprovedForAll(trade.fromAddress, address(this)) ||
                fromNft.getApproved(trade.fromNftId) == address(this),
                "Contract not approved to transfer NFT"
            );
        } else { 
            require(
                toNft.isApprovedForAll(trade.toAddress, address(this)) ||
                toNft.getApproved(trade.toNftId) == address(this),
                "Contract not approved to transfer NFT"
            );
        }

        if (msg.sender == trade.fromAddress) {
            require(!trade.fromHasConfirmed, "Already confirmed this trade");
            trade.fromHasConfirmed = true;
        } else {
            require(!trade.toHasConfirmed, "Already confirmed this trade");
            trade.toHasConfirmed = true;
        }

        emit TradeConfirmed(_tradeId, msg.sender);

        // If both parties have confirmed, update status
        if (trade.fromHasConfirmed && trade.toHasConfirmed) {
            trade.status = TradeStatus.Confirmed;

            // Execute the trade
            executeTrade(_tradeId);
        }
    }
    function cancelTrade(uint256 _tradeId) external {
        require(_tradeId < trades.length, "Trade does not exist");
        Trade storage trade = trades[_tradeId];
        
        // Only allow cancellation if trade is in Proposed or Agreed state
        require(
            trade.status == TradeStatus.Proposed || trade.status == TradeStatus.Agreed,
            "Trade can only be cancelled in Proposed or Agreed state"
        );
        
        // Only allow the participants to cancel the trade
        require(
            msg.sender == trade.fromAddress || msg.sender == trade.toAddress,
            "Not authorized to cancel this trade"
        );

        // Update the trade status to Cancelled
        trade.status = TradeStatus.Cancelled;
        
        // Emit the cancellation event
        emit TradeCancelled(_tradeId);
    }
    
    function getTrade(uint256 _tradeId) public view returns (Trade memory) {
        return trades[_tradeId];
    }
} 
