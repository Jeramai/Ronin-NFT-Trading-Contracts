import { expect } from 'chai';
import hre from 'hardhat';
import { Address, createPublicClient, createWalletClient, getAddress, getContract, http, PublicClient, WalletClient } from 'viem';
import { hardhat } from 'viem/chains';
import MockNft from '../artifacts/contracts/MockNft.sol/MockNft.json';
import NftSwap from '../artifacts/contracts/NftSwap.sol/NftSwap.json';

enum TradeStatus {
  Proposed,
  Agreed,
  Confirmed,
  Cancelled
}
type Trade = {
  fromAddress: Address;
  fromNftContract: Address;
  fromNftId: bigint;
  fromHasAgreed: boolean;
  fromHasConfirmed: boolean;

  toAddress: Address;
  toNftContract: Address;
  toNftId: bigint;
  toHasAgreed: boolean;
  toHasConfirmed: boolean;

  status: TradeStatus;
};

describe('Error', function () {
  let publicClient: PublicClient;
  let walletClientOwner: WalletClient;
  let contractOwner: any;
  let from: any;
  let to: any;
  let nftContract: any;
  let nftSwap: any;

  const offeredNftId: number = 1,
    requestedNftId: number = 2;

  beforeEach(async function () {
    // Create Viem clients
    publicClient = createPublicClient({
      chain: hardhat, // Use hardhat chain here
      transport: http() // Use the Hardhat Network RPC endpoint
    });

    // Get accounts from Hardhat
    [contractOwner, from, to] = await hre.viem.getWalletClients();

    // Create wallet clients
    walletClientOwner = createWalletClient({
      chain: hardhat,
      transport: http(),
      account: contractOwner.account
    });

    // Deploy the NFT contract first
    const nftHash = await walletClientOwner.deployContract({
      abi: MockNft.abi,
      bytecode: MockNft.bytecode as Address,
      account: contractOwner.account,
      chain: hardhat
    });
    const nftReceipt = await publicClient.waitForTransactionReceipt({ hash: nftHash });
    const nftAddress = nftReceipt.contractAddress!;

    // Deploy the contract with Viem
    const swapHash = await walletClientOwner.deployContract({
      abi: NftSwap.abi,
      bytecode: NftSwap.bytecode as Address,
      account: contractOwner.account,
      chain: hardhat
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: swapHash });
    const nftSwapAddress = receipt.contractAddress!;

    // Get a contract instance with Viem
    nftContract = getContract({
      address: nftAddress,
      abi: MockNft.abi,
      client: {
        public: publicClient,
        wallet: walletClientOwner
      }
    });
    nftSwap = getContract({
      address: nftSwapAddress,
      abi: NftSwap.abi,
      client: {
        public: publicClient,
        wallet: walletClientOwner
      }
    });

    // Mint NFTs to from and to
    await nftContract.write.mint([from.account.address, offeredNftId]);
    await nftContract.write.mint([to.account.address, requestedNftId]);

    // Check if the wallet has the NFT
    const ownerOfferedNft = await nftContract.read.ownerOf([offeredNftId]);
    const ownerRequestedNft = await nftContract.read.ownerOf([requestedNftId]);

    expect(ownerOfferedNft).to.equal(getAddress(from.account.address));
    expect(ownerRequestedNft).to.equal(getAddress(to.account.address));
  });

  it('Should not allow proposing a trade to self', async function () {
    const ownerOfferedNft = await nftContract.read.ownerOf([offeredNftId]);
    const ownerRequestedNft = await nftContract.read.ownerOf([requestedNftId]);
    const trade1 = nftSwap.write.proposeTrade([ownerOfferedNft, ownerOfferedNft]);
    const trade2 = nftSwap.write.proposeTrade([ownerRequestedNft, ownerRequestedNft]);

    await expect(trade1).to.be.rejectedWith('Cannot trade with yourself');
    await expect(trade2).to.be.rejectedWith('Cannot trade with yourself');
  });
  it('Should not allow proposing a trade for an NFT the user does not own', async function () {
    const notOwnedNftId = 2;

    const ownerOfferedNft = await nftContract.read.ownerOf([offeredNftId]);
    const ownerRequestedNft = await nftContract.read.ownerOf([requestedNftId]);
    await nftSwap.write.proposeTrade([ownerOfferedNft, ownerRequestedNft]);

    // Have both side agree
    const tradeFrom = nftSwap.write.agreeTrade(
      [0, getAddress(nftContract.address), offeredNftId, getAddress(nftContract.address), notOwnedNftId],
      { account: from.account }
    );
    const tradeTo = nftSwap.write.agreeTrade(
      [0, getAddress(nftContract.address), notOwnedNftId, getAddress(nftContract.address), requestedNftId],
      { account: to.account }
    );

    await expect(tradeFrom).to.be.fulfilled;
    await expect(tradeTo).to.be.rejectedWith('You do not own this NFT');
  });
  it('Should not allow agreeing to a non-existent trade', async function () {
    const nonExistentTradeId = 999; // Assuming this trade ID will not exist
    const trade = nftSwap.write.agreeTrade(
      [nonExistentTradeId, getAddress(nftContract.address), offeredNftId, getAddress(nftContract.address), requestedNftId],
      { account: from.account }
    );

    await expect(trade).to.be.rejectedWith('Trade does not exist');
  });
  it('Should not allow confirming without first agreeing', async function () {
    // Arrange: Propose a trade
    const ownerOfferedNft = await nftContract.read.ownerOf([offeredNftId]);
    const ownerRequestedNft = await nftContract.read.ownerOf([requestedNftId]);
    let hash = await nftSwap.write.proposeTrade([ownerOfferedNft, ownerRequestedNft]);
    await publicClient.waitForTransactionReceipt({ hash });

    // Act: Attempt to confirm the trade without agreeing
    const confirmTrade = nftSwap.write.confirmTrade([0], { account: from.account });

    // Assert: Expect the transaction to be rejected with the correct error message
    await expect(confirmTrade).to.be.rejectedWith('Trade is not in agreed state');
  });
  it('Should not allow confirming without NFT approval', async function () {
    // Arrange: Propose and agree to a trade
    const ownerOfferedNft = await nftContract.read.ownerOf([offeredNftId]);
    const ownerRequestedNft = await nftContract.read.ownerOf([requestedNftId]);
    let hash = await nftSwap.write.proposeTrade([ownerOfferedNft, ownerRequestedNft]);
    await publicClient.waitForTransactionReceipt({ hash });

    const agreeHashFrom = await nftSwap.write.agreeTrade(
      [0, getAddress(nftContract.address), offeredNftId, getAddress(nftContract.address), requestedNftId],
      { account: from.account }
    );
    await publicClient.waitForTransactionReceipt({ hash: agreeHashFrom });
    const agreeHashTo = await nftSwap.write.agreeTrade(
      [0, getAddress(nftContract.address), offeredNftId, getAddress(nftContract.address), requestedNftId],
      { account: to.account }
    );
    await publicClient.waitForTransactionReceipt({ hash: agreeHashTo });

    // Act: Attempt to confirm the trade without NFT approval
    const confirmTrade = nftSwap.write.confirmTrade([0], { account: from.account });

    // Assert: Expect the transaction to be rejected with the correct error message
    await expect(confirmTrade).to.be.rejectedWith('Contract not approved to transfer NFT');
  });
});
