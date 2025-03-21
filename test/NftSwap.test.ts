import { expect } from 'chai';
import hre from 'hardhat';
import {
  Address,
  createPublicClient,
  createWalletClient,
  getAddress,
  getContract,
  http,
  PublicClient,
  WalletClient,
  zeroAddress
} from 'viem';
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

describe('NftSwap', function () {
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

  // Normal workflow
  it('Should allow a user to propose a trade', async function () {
    // Act
    const ownerOfferedNft = await nftContract.read.ownerOf([offeredNftId]);
    const ownerRequestedNft = await nftContract.read.ownerOf([requestedNftId]);

    let hash = await nftSwap.write.proposeTrade([ownerOfferedNft, ownerRequestedNft]);
    await publicClient.waitForTransactionReceipt({ hash });

    // Test
    const trade = (await nftSwap.read.getTrade([0])) as Trade;
    expect(trade.fromAddress).to.equal(getAddress(from.account.address));
    expect(trade.fromNftContract).to.equal(zeroAddress);
    expect(trade.fromNftId).to.equal(BigInt(0));
    expect(trade.fromHasAgreed).to.equal(false);
    expect(trade.fromHasConfirmed).to.equal(false);
    expect(trade.toAddress).to.equal(getAddress(to.account.address));
    expect(trade.toNftContract).to.equal(zeroAddress);
    expect(trade.toNftId).to.equal(BigInt(0));
    expect(trade.toHasAgreed).to.equal(false);
    expect(trade.toHasConfirmed).to.equal(false);
    expect(trade.status).to.equal(TradeStatus.Proposed);
  });
  it('Should change status to agreed if both side agree', async function () {
    const ownerOfferedNft = await nftContract.read.ownerOf([offeredNftId]);
    const ownerRequestedNft = await nftContract.read.ownerOf([requestedNftId]);
    let hash = await nftSwap.write.proposeTrade([ownerOfferedNft, ownerRequestedNft]);

    await publicClient.waitForTransactionReceipt({ hash });

    // Have FROM side agree
    const agreeHash = await nftSwap.write.agreeTrade(
      [0, getAddress(nftContract.address), offeredNftId, getAddress(nftContract.address), requestedNftId],
      { account: from.account }
    );
    await publicClient.waitForTransactionReceipt({ hash: agreeHash });

    const tradeFrom = (await nftSwap.read.getTrade([0])) as Trade;
    expect(tradeFrom.status).to.equal(TradeStatus.Proposed);
    expect(tradeFrom.fromHasAgreed).to.equal(true);
    expect(tradeFrom.toHasAgreed).to.equal(false);

    // Have TO side agree
    const agreeHash2 = await nftSwap.write.agreeTrade(
      [0, getAddress(nftContract.address), offeredNftId, getAddress(nftContract.address), requestedNftId],
      { account: to.account }
    );
    await publicClient.waitForTransactionReceipt({ hash: agreeHash2 });

    const tradeTo = (await nftSwap.read.getTrade([0])) as Trade;
    expect(tradeTo.status).to.equal(TradeStatus.Agreed);
    expect(tradeTo.fromHasAgreed).to.equal(true);
    expect(tradeTo.toHasAgreed).to.equal(true);

    expect(tradeTo.fromAddress).to.equal(getAddress(from.account.address));
    expect(tradeTo.fromNftContract).to.equal(getAddress(nftContract.address));
    expect(tradeTo.fromNftId).to.equal(BigInt(offeredNftId));
    expect(tradeTo.toAddress).to.equal(getAddress(to.account.address));
    expect(tradeTo.toNftContract).to.equal(getAddress(nftContract.address));
    expect(tradeTo.toNftId).to.equal(BigInt(requestedNftId));
  });
  it('Should change status to confirmed if both sides confirm', async function () {
    const ownerOfferedNft = await nftContract.read.ownerOf([offeredNftId]);
    const ownerRequestedNft = await nftContract.read.ownerOf([requestedNftId]);
    let hash = await nftSwap.write.proposeTrade([ownerOfferedNft, ownerRequestedNft]);
    await publicClient.waitForTransactionReceipt({ hash });

    // Have FROM side agree
    const agreeHash = await nftSwap.write.agreeTrade(
      [0, getAddress(nftContract.address), offeredNftId, getAddress(nftContract.address), requestedNftId],
      { account: from.account }
    );
    await publicClient.waitForTransactionReceipt({ hash: agreeHash });

    // Have TO side agree
    const agreeHash2 = await nftSwap.write.agreeTrade(
      [0, getAddress(nftContract.address), offeredNftId, getAddress(nftContract.address), requestedNftId],
      { account: to.account }
    );
    await publicClient.waitForTransactionReceipt({ hash: agreeHash2 });

    // Do NFT approval
    const approveHash1 = await nftContract.write.approve([getAddress(nftSwap.address), offeredNftId], { account: from.account });
    await publicClient.waitForTransactionReceipt({ hash: approveHash1 });
    const fromApproved = await nftContract.read.getApproved([offeredNftId]);
    expect(fromApproved).to.equal(getAddress(nftSwap.address));

    // Have FROM side confirm
    const confirmHash1 = await nftSwap.write.confirmTrade([0], { account: from.account });
    await publicClient.waitForTransactionReceipt({ hash: confirmHash1 });

    let trade = (await nftSwap.read.getTrade([0])) as Trade;
    expect(trade.status).to.equal(TradeStatus.Agreed);
    expect(trade.fromHasAgreed).to.equal(true);
    expect(trade.toHasAgreed).to.equal(true);
    expect(trade.fromHasConfirmed).to.equal(true);
    expect(trade.toHasConfirmed).to.equal(false);

    // Do NFT approval
    const approveHash2 = await nftContract.write.approve([getAddress(nftSwap.address), requestedNftId], { account: to.account });
    await publicClient.waitForTransactionReceipt({ hash: approveHash2 });
    const toApproved = await nftContract.read.getApproved([requestedNftId]);
    expect(toApproved).to.equal(getAddress(nftSwap.address));

    // Have TO side confirm
    const confirmHash2 = await nftSwap.write.confirmTrade([0], { account: to.account });
    await publicClient.waitForTransactionReceipt({ hash: confirmHash2 });

    trade = (await nftSwap.read.getTrade([0])) as Trade;
    expect(trade.status).to.equal(TradeStatus.Confirmed);
    expect(trade.fromHasAgreed).to.equal(true);
    expect(trade.toHasAgreed).to.equal(true);
    expect(trade.fromHasConfirmed).to.equal(true);
    expect(trade.toHasConfirmed).to.equal(true);
  });
  it('Should trade NFTs between users', async function () {
    const ownerOfferedNft = await nftContract.read.ownerOf([offeredNftId]);
    const ownerRequestedNft = await nftContract.read.ownerOf([requestedNftId]);

    let hash = await nftSwap.write.proposeTrade([ownerOfferedNft, ownerRequestedNft]);
    await publicClient.waitForTransactionReceipt({ hash });

    // Agree
    const agreeHash = await nftSwap.write.agreeTrade(
      [0, getAddress(nftContract.address), offeredNftId, getAddress(nftContract.address), requestedNftId],
      { account: from.account }
    );
    await publicClient.waitForTransactionReceipt({ hash: agreeHash });
    const agreeHash2 = await nftSwap.write.agreeTrade(
      [0, getAddress(nftContract.address), offeredNftId, getAddress(nftContract.address), requestedNftId],
      { account: to.account }
    );
    await publicClient.waitForTransactionReceipt({ hash: agreeHash2 });

    // NFT approval
    const approveHash1 = await nftContract.write.approve([getAddress(nftSwap.address), offeredNftId], { account: from.account });
    await publicClient.waitForTransactionReceipt({ hash: approveHash1 });
    const approveHash2 = await nftContract.write.approve([getAddress(nftSwap.address), requestedNftId], { account: to.account });
    await publicClient.waitForTransactionReceipt({ hash: approveHash2 });

    // Confirm
    const confirmHash = await nftSwap.write.confirmTrade([0], { account: from.account });
    await publicClient.waitForTransactionReceipt({ hash: confirmHash });
    const confirmHash2 = await nftSwap.write.confirmTrade([0], { account: to.account });
    await publicClient.waitForTransactionReceipt({ hash: confirmHash2 });

    let trade = (await nftSwap.read.getTrade([0])) as Trade;
    expect(trade.status).to.equal(TradeStatus.Confirmed);

    // Check if the wallet has the NFT
    const newOwnerOfferedNft = await nftContract.read.ownerOf([offeredNftId]);
    const newOwnerRequestedNft = await nftContract.read.ownerOf([requestedNftId]);

    expect(newOwnerOfferedNft).to.equal(getAddress(to.account.address));
    expect(newOwnerRequestedNft).to.equal(getAddress(from.account.address));
  });
});
