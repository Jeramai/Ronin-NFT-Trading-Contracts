### Workflow:

1. NFT Selection:
   - Both users select one or more NFTs they want to trade.
   - They specify the NFT contract address and token ID(s).
1. Approval:
   - Both users approve the swap contract to transfer their selected NFTs.
1. Trade Proposal:
   - One user initiates a trade proposal, specifying the NFTs they're offering and the NFTs they want.
1. Agreement:
   - The other user reviews the proposal and agrees or rejects it.
1. Confirmation:
   - If both users agree, they both confirm the trade.
   - A trade expiration time is set.
1. Atomic Swap:
   - The smart contract checks if both users have confirmed and if the trade hasn't expired.
   - If all conditions are met, the contract atomically transfers the NFTs.
1. Cancellation:
   - Either user can cancel the trade before it's confirmed.
   - The trade automatically cancels if the expiration time is reached.

### Functions:

- proposeTrade ✅
- agreeToTrade
- confirmTrade
- cancelTrade
- executeTrade (internal function)
