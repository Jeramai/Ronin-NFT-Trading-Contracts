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

describe('State Transition', function () {
  let publicClient: PublicClient;
  let walletClientOwner: WalletClient;
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
    [from, to] = await hre.viem.getWalletClients();

    // Create wallet clients
    walletClientOwner = createWalletClient({
      chain: hardhat,
      transport: http(),
      account: from.account
    });

    // Deploy the NFT contract first
    const nftHash = await walletClientOwner.deployContract({
      abi: MockNft.abi,
      bytecode: MockNft.bytecode as Address,
      account: from.account,
      chain: hardhat
    });
    const nftReceipt = await publicClient.waitForTransactionReceipt({ hash: nftHash });
    const nftAddress = nftReceipt.contractAddress!;

    // Deploy the contract with Viem
    const swapHash = await walletClientOwner.deployContract({
      abi: NftSwap.abi,
      bytecode: NftSwap.bytecode as Address,
      account: from.account,
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

  it('FROM should allow cancelling a proposed trade', async function () {
    // Act
    const ownerRequestedNft = await nftContract.read.ownerOf([requestedNftId]);
    const hash2 = await nftSwap.write.proposeTrade(
      [getAddress(nftContract.address), offeredNftId, getAddress(nftContract.address), requestedNftId, ownerRequestedNft],
      { account: from.account }
    );

    // Assert
    await publicClient.waitForTransactionReceipt({ hash: hash2 });

    const agreeHash2 = await nftSwap.write.cancelTrade([0], { account: from.account });
    await publicClient.waitForTransactionReceipt({ hash: agreeHash2 });

    // Test
    const trade = (await nftSwap.read.getTrade([0])) as Trade;
    expect(trade.status).to.equal(TradeStatus.Cancelled);
  });
  it('TO should allow cancelling a proposed trade', async function () {
    // Act
    const ownerRequestedNft = await nftContract.read.ownerOf([requestedNftId]);
    const hash2 = await nftSwap.write.proposeTrade(
      [getAddress(nftContract.address), offeredNftId, getAddress(nftContract.address), requestedNftId, ownerRequestedNft],
      { account: from.account }
    );

    // Assert
    await publicClient.waitForTransactionReceipt({ hash: hash2 });

    const agreeHash2 = await nftSwap.write.cancelTrade([0], { account: to.account });
    await publicClient.waitForTransactionReceipt({ hash: agreeHash2 });

    // Test
    const trade = (await nftSwap.read.getTrade([0])) as Trade;
    expect(trade.status).to.equal(TradeStatus.Cancelled);
  });
  it('FROM should allow cancelling an agreed trade before confirmation', async function () {
    // Act
    const ownerRequestedNft = await nftContract.read.ownerOf([requestedNftId]);
    let hash = await nftSwap.write.proposeTrade(
      [getAddress(nftContract.address), offeredNftId, getAddress(nftContract.address), requestedNftId, ownerRequestedNft],
      { account: from.account }
    );

    // Assert
    await publicClient.waitForTransactionReceipt({ hash });

    hash = await nftSwap.write.agreeTrade([0], { account: from.account });
    await publicClient.waitForTransactionReceipt({ hash });

    hash = await nftSwap.write.cancelTrade([0], { account: from.account });
    await publicClient.waitForTransactionReceipt({ hash });

    // Test
    const trade = (await nftSwap.read.getTrade([0])) as Trade;
    expect(trade.status).to.equal(TradeStatus.Cancelled);
  });
  it('TO should allow cancelling an agreed trade before confirmation', async function () {
    // Act
    const ownerRequestedNft = await nftContract.read.ownerOf([requestedNftId]);
    let hash = await nftSwap.write.proposeTrade(
      [getAddress(nftContract.address), offeredNftId, getAddress(nftContract.address), requestedNftId, ownerRequestedNft],
      { account: from.account }
    );

    // Assert
    await publicClient.waitForTransactionReceipt({ hash });

    hash = await nftSwap.write.agreeTrade([0], { account: to.account });
    await publicClient.waitForTransactionReceipt({ hash });

    hash = await nftSwap.write.cancelTrade([0], { account: to.account });
    await publicClient.waitForTransactionReceipt({ hash });

    // Test
    const trade = (await nftSwap.read.getTrade([0])) as Trade;
    expect(trade.status).to.equal(TradeStatus.Cancelled);
  });
  it('FROM should allow cancelling an partly confirmed trade before confirmation', async function () {
    // Act
    const ownerRequestedNft = await nftContract.read.ownerOf([requestedNftId]);
    let hash = await nftSwap.write.proposeTrade(
      [getAddress(nftContract.address), offeredNftId, getAddress(nftContract.address), requestedNftId, ownerRequestedNft],
      { account: from.account }
    );

    // Assert
    await publicClient.waitForTransactionReceipt({ hash });

    hash = await nftSwap.write.agreeTrade([0], { account: from.account });
    await publicClient.waitForTransactionReceipt({ hash });

    hash = await nftSwap.write.agreeTrade([0], { account: to.account });
    await publicClient.waitForTransactionReceipt({ hash });

    // NFT Approval
    hash = await nftContract.write.approve([getAddress(nftSwap.address), offeredNftId], { account: from.account });
    await publicClient.waitForTransactionReceipt({ hash });

    // Confirm
    hash = await nftSwap.write.confirmTrade([0], { account: from.account });
    await publicClient.waitForTransactionReceipt({ hash });

    hash = await nftSwap.write.cancelTrade([0], { account: from.account });
    await publicClient.waitForTransactionReceipt({ hash });

    // Test
    const trade = (await nftSwap.read.getTrade([0])) as Trade;
    expect(trade.status).to.equal(TradeStatus.Cancelled);
  });
  it('TO should allow cancelling an partly confirmed trade before confirmation', async function () {
    // Act
    const ownerRequestedNft = await nftContract.read.ownerOf([requestedNftId]);
    let hash = await nftSwap.write.proposeTrade(
      [getAddress(nftContract.address), offeredNftId, getAddress(nftContract.address), requestedNftId, ownerRequestedNft],
      { account: from.account }
    );

    // Assert
    await publicClient.waitForTransactionReceipt({ hash });

    hash = await nftSwap.write.agreeTrade([0], { account: from.account });
    await publicClient.waitForTransactionReceipt({ hash });

    hash = await nftSwap.write.agreeTrade([0], { account: to.account });
    await publicClient.waitForTransactionReceipt({ hash });

    // NFT Approval
    hash = await nftContract.write.approve([getAddress(nftSwap.address), offeredNftId], { account: from.account });
    await publicClient.waitForTransactionReceipt({ hash });

    // Confirm
    hash = await nftSwap.write.confirmTrade([0], { account: from.account });
    await publicClient.waitForTransactionReceipt({ hash });

    hash = await nftSwap.write.cancelTrade([0], { account: to.account });
    await publicClient.waitForTransactionReceipt({ hash });

    // Test
    const trade = (await nftSwap.read.getTrade([0])) as Trade;
    expect(trade.status).to.equal(TradeStatus.Cancelled);
  });

  it('Should not allow agreeing to a cancelled trade', async function () {
    // Act
    const ownerRequestedNft = await nftContract.read.ownerOf([requestedNftId]);
    const hash2 = await nftSwap.write.proposeTrade(
      [getAddress(nftContract.address), offeredNftId, getAddress(nftContract.address), requestedNftId, ownerRequestedNft],
      { account: from.account }
    );

    // Assert
    await publicClient.waitForTransactionReceipt({ hash: hash2 });

    const hash = await nftSwap.write.cancelTrade([0], { account: from.account });
    await publicClient.waitForTransactionReceipt({ hash });

    const trade = nftSwap.write.agreeTrade([0], { account: to.account });

    // Test
    await expect(trade).to.be.rejectedWith('Trade is not in proposed state');
  });
  it('Should not allow agreeing an already agreed trade', async function () {
    // Act
    const ownerRequestedNft = await nftContract.read.ownerOf([requestedNftId]);
    const hash2 = await nftSwap.write.proposeTrade(
      [getAddress(nftContract.address), offeredNftId, getAddress(nftContract.address), requestedNftId, ownerRequestedNft],
      { account: from.account }
    );

    // Assert
    await publicClient.waitForTransactionReceipt({ hash: hash2 });

    // Agree
    let hash = await nftSwap.write.agreeTrade([0], { account: from.account });
    await publicClient.waitForTransactionReceipt({ hash });
    hash = await nftSwap.write.agreeTrade([0], { account: to.account });
    await publicClient.waitForTransactionReceipt({ hash });

    // Agree again
    const trade = nftSwap.write.agreeTrade([0], { account: to.account });

    // Test
    await expect(trade).to.be.rejectedWith('Trade is not in proposed state');
  });
  it('Should not allow agreeing an already confirmed trade', async function () {
    // Act
    const ownerRequestedNft = await nftContract.read.ownerOf([requestedNftId]);
    const hash2 = await nftSwap.write.proposeTrade(
      [getAddress(nftContract.address), offeredNftId, getAddress(nftContract.address), requestedNftId, ownerRequestedNft],
      { account: from.account }
    );

    // Assert
    await publicClient.waitForTransactionReceipt({ hash: hash2 });

    // Agree
    let hash = await nftSwap.write.agreeTrade([0], { account: from.account });
    await publicClient.waitForTransactionReceipt({ hash });
    hash = await nftSwap.write.agreeTrade([0], { account: to.account });
    await publicClient.waitForTransactionReceipt({ hash });

    // NFT Approval
    hash = await nftContract.write.approve([getAddress(nftSwap.address), offeredNftId], { account: from.account });
    await publicClient.waitForTransactionReceipt({ hash });
    hash = await nftContract.write.approve([getAddress(nftSwap.address), requestedNftId], { account: to.account });
    await publicClient.waitForTransactionReceipt({ hash });

    // Confirm
    hash = await nftSwap.write.confirmTrade([0], { account: from.account });
    await publicClient.waitForTransactionReceipt({ hash });
    hash = await nftSwap.write.confirmTrade([0], { account: to.account });
    await publicClient.waitForTransactionReceipt({ hash });

    // Agree again
    const trade = nftSwap.write.agreeTrade([0], { account: to.account });

    // Test
    await expect(trade).to.be.rejectedWith('Trade is not in proposed state');
  });
  it('Should not allow confirming a cancelled trade', async function () {
    // Act
    const ownerRequestedNft = await nftContract.read.ownerOf([requestedNftId]);
    const hash2 = await nftSwap.write.proposeTrade(
      [getAddress(nftContract.address), offeredNftId, getAddress(nftContract.address), requestedNftId, ownerRequestedNft],
      { account: from.account }
    );

    // Assert
    await publicClient.waitForTransactionReceipt({ hash: hash2 });

    const hash = await nftSwap.write.cancelTrade([0], { account: from.account });
    await publicClient.waitForTransactionReceipt({ hash });

    const trade = nftSwap.write.confirmTrade([0], { account: to.account });

    // Test
    await expect(trade).to.be.rejectedWith('Trade is not in agreed state');
  });
  it('Should not allow confirming a proposed trade', async function () {
    // Act
    const ownerRequestedNft = await nftContract.read.ownerOf([requestedNftId]);
    const hash2 = await nftSwap.write.proposeTrade(
      [getAddress(nftContract.address), offeredNftId, getAddress(nftContract.address), requestedNftId, ownerRequestedNft],
      { account: from.account }
    );

    // Assert
    await publicClient.waitForTransactionReceipt({ hash: hash2 });

    const trade = nftSwap.write.confirmTrade([0], { account: to.account });

    // Test
    await expect(trade).to.be.rejectedWith('Trade is not in agreed state');
  });
  it('Should not allow confirming an already confirmed trade', async function () {
    // Act
    const ownerRequestedNft = await nftContract.read.ownerOf([requestedNftId]);
    const hash2 = await nftSwap.write.proposeTrade(
      [getAddress(nftContract.address), offeredNftId, getAddress(nftContract.address), requestedNftId, ownerRequestedNft],
      { account: from.account }
    );

    // Assert
    await publicClient.waitForTransactionReceipt({ hash: hash2 });

    // Agree
    let hash = await nftSwap.write.agreeTrade([0], { account: from.account });
    await publicClient.waitForTransactionReceipt({ hash });
    hash = await nftSwap.write.agreeTrade([0], { account: to.account });
    await publicClient.waitForTransactionReceipt({ hash });

    // NFT Approval
    hash = await nftContract.write.approve([getAddress(nftSwap.address), offeredNftId], { account: from.account });
    await publicClient.waitForTransactionReceipt({ hash });
    hash = await nftContract.write.approve([getAddress(nftSwap.address), requestedNftId], { account: to.account });
    await publicClient.waitForTransactionReceipt({ hash });

    // Confirm
    hash = await nftSwap.write.confirmTrade([0], { account: from.account });
    await publicClient.waitForTransactionReceipt({ hash });
    hash = await nftSwap.write.confirmTrade([0], { account: to.account });
    await publicClient.waitForTransactionReceipt({ hash });

    // Agree again
    const trade = nftSwap.write.confirmTrade([0], { account: to.account });

    // Test
    await expect(trade).to.be.rejectedWith('Trade is not in agreed state');
  });
  it('Should not allow cancelling a confirmed trade', async function () {
    // Act
    const ownerRequestedNft = await nftContract.read.ownerOf([requestedNftId]);
    const hash2 = await nftSwap.write.proposeTrade(
      [getAddress(nftContract.address), offeredNftId, getAddress(nftContract.address), requestedNftId, ownerRequestedNft],
      { account: from.account }
    );

    // Assert
    await publicClient.waitForTransactionReceipt({ hash: hash2 });

    // Agree
    let hash = await nftSwap.write.agreeTrade([0], { account: from.account });
    await publicClient.waitForTransactionReceipt({ hash });
    hash = await nftSwap.write.agreeTrade([0], { account: to.account });
    await publicClient.waitForTransactionReceipt({ hash });

    // NFT Approval
    hash = await nftContract.write.approve([getAddress(nftSwap.address), offeredNftId], { account: from.account });
    await publicClient.waitForTransactionReceipt({ hash });
    hash = await nftContract.write.approve([getAddress(nftSwap.address), requestedNftId], { account: to.account });
    await publicClient.waitForTransactionReceipt({ hash });

    // Confirm
    hash = await nftSwap.write.confirmTrade([0], { account: from.account });
    await publicClient.waitForTransactionReceipt({ hash });
    hash = await nftSwap.write.confirmTrade([0], { account: to.account });
    await publicClient.waitForTransactionReceipt({ hash });

    // Agree again
    const trade = nftSwap.write.cancelTrade([0], { account: to.account });

    // Test
    await expect(trade).to.be.rejectedWith('Trade can only be cancelled in Proposed or Agreed state');
  });
  it('Should not allow cancelling a canceled trade', async function () {
    // Act
    const ownerRequestedNft = await nftContract.read.ownerOf([requestedNftId]);
    const hash2 = await nftSwap.write.proposeTrade(
      [getAddress(nftContract.address), offeredNftId, getAddress(nftContract.address), requestedNftId, ownerRequestedNft],
      { account: from.account }
    );

    // Assert
    await publicClient.waitForTransactionReceipt({ hash: hash2 });

    const hash = await nftSwap.write.cancelTrade([0], { account: from.account });
    await publicClient.waitForTransactionReceipt({ hash });

    const trade = nftSwap.write.cancelTrade([0], { account: to.account });

    // Test
    await expect(trade).to.be.rejectedWith('Trade can only be cancelled in Proposed or Agreed state');
  });
});
