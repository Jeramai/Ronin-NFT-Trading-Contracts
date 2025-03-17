import { time } from '@openzeppelin/test-helpers';
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

  it('Should not allow agreeing to a cancelled trade', async function () {
    // Act
    const ownerOfferedNft = await nftContract.read.ownerOf([offeredNftId]);
    const ownerRequestedNft = await nftContract.read.ownerOf([requestedNftId]);

    let hash = await nftSwap.write.proposeTrade([ownerOfferedNft, ownerRequestedNft]);
    await publicClient.waitForTransactionReceipt({ hash });

    // Add time to cancel trade
    await time.increase(1000 * 60 * 60 + 1);

    const trade = nftSwap.write.agreeTrade(
      [0, getAddress(nftContract.address), offeredNftId, getAddress(nftContract.address), requestedNftId],
      { account: to.account }
    );
    await expect(trade).to.be.rejectedWith('Trade has expired');
  });
  it('Should not allow agreeing an already agreed trade', async function () {
    // Act
    const ownerOfferedNft = await nftContract.read.ownerOf([offeredNftId]);
    const ownerRequestedNft = await nftContract.read.ownerOf([requestedNftId]);

    let hash = await nftSwap.write.proposeTrade([ownerOfferedNft, ownerRequestedNft]);
    await publicClient.waitForTransactionReceipt({ hash });

    // Agree
    hash = await nftSwap.write.agreeTrade(
      [0, getAddress(nftContract.address), offeredNftId, getAddress(nftContract.address), requestedNftId],
      { account: from.account }
    );
    await publicClient.waitForTransactionReceipt({ hash });
    hash = await nftSwap.write.agreeTrade(
      [0, getAddress(nftContract.address), offeredNftId, getAddress(nftContract.address), requestedNftId],
      { account: to.account }
    );
    await publicClient.waitForTransactionReceipt({ hash });

    // Agree again
    const trade = nftSwap.write.agreeTrade(
      [0, getAddress(nftContract.address), offeredNftId, getAddress(nftContract.address), requestedNftId],
      { account: to.account }
    );

    // Test
    await expect(trade).to.be.rejectedWith('Trade is not in proposed state');
  });
  it('Should not allow agreeing an already confirmed trade', async function () {
    // Act
    const ownerOfferedNft = await nftContract.read.ownerOf([offeredNftId]);
    const ownerRequestedNft = await nftContract.read.ownerOf([requestedNftId]);

    let hash = await nftSwap.write.proposeTrade([ownerOfferedNft, ownerRequestedNft]);
    await publicClient.waitForTransactionReceipt({ hash });

    // Agree
    hash = await nftSwap.write.agreeTrade(
      [0, getAddress(nftContract.address), offeredNftId, getAddress(nftContract.address), requestedNftId],
      { account: from.account }
    );
    await publicClient.waitForTransactionReceipt({ hash });
    hash = await nftSwap.write.agreeTrade(
      [0, getAddress(nftContract.address), offeredNftId, getAddress(nftContract.address), requestedNftId],
      { account: to.account }
    );
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
    const trade = nftSwap.write.agreeTrade(
      [0, getAddress(nftContract.address), offeredNftId, getAddress(nftContract.address), requestedNftId],
      { account: to.account }
    );

    // Test
    await expect(trade).to.be.rejectedWith('Trade is not in proposed state');
  });
  it('Should not allow confirming a cancelled trade', async function () {
    // Act
    const ownerOfferedNft = await nftContract.read.ownerOf([offeredNftId]);
    const ownerRequestedNft = await nftContract.read.ownerOf([requestedNftId]);

    let hash = await nftSwap.write.proposeTrade([ownerOfferedNft, ownerRequestedNft]);
    await publicClient.waitForTransactionReceipt({ hash });

    // Add time to cancel trade
    await time.increase(1000 * 60 * 60 + 1);

    const trade = nftSwap.write.confirmTrade([0], { account: to.account });
    await expect(trade).to.be.rejectedWith('Trade has expired');
  });
  it('Should not allow confirming a proposed trade', async function () {
    // Act
    const ownerOfferedNft = await nftContract.read.ownerOf([offeredNftId]);
    const ownerRequestedNft = await nftContract.read.ownerOf([requestedNftId]);

    let hash = await nftSwap.write.proposeTrade([ownerOfferedNft, ownerRequestedNft]);
    await publicClient.waitForTransactionReceipt({ hash });

    const trade = nftSwap.write.confirmTrade([0], { account: to.account });

    // Test
    await expect(trade).to.be.rejectedWith('Trade is not in agreed state');
  });
  it('Should not allow confirming an already confirmed trade', async function () {
    // Act
    const ownerOfferedNft = await nftContract.read.ownerOf([offeredNftId]);
    const ownerRequestedNft = await nftContract.read.ownerOf([requestedNftId]);

    let hash = await nftSwap.write.proposeTrade([ownerOfferedNft, ownerRequestedNft]);
    await publicClient.waitForTransactionReceipt({ hash });

    // Agree
    hash = await nftSwap.write.agreeTrade(
      [0, getAddress(nftContract.address), offeredNftId, getAddress(nftContract.address), requestedNftId],
      { account: from.account }
    );
    await publicClient.waitForTransactionReceipt({ hash });
    hash = await nftSwap.write.agreeTrade(
      [0, getAddress(nftContract.address), offeredNftId, getAddress(nftContract.address), requestedNftId],
      { account: to.account }
    );
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
});
