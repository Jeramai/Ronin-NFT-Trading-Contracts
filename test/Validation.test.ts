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

describe('Validation', function () {
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

  it('Should validate NFT contract addresses are valid', async function () {
    // Arrange: Use an invalid contract address (zero address)
    const invalidContractAddress = getAddress('0x0000000000000000000000000000000000000000');
    const ownerRequestedNft = await nftContract.read.ownerOf([requestedNftId]);

    // Act: Attempt to propose a trade with the invalid contract address
    const proposeTradeCall = nftSwap.write.proposeTrade(
      [invalidContractAddress, offeredNftId, getAddress(nftContract.address), requestedNftId, ownerRequestedNft],
      { account: from.account }
    );

    // Assert: The transaction should be rejected
    await expect(proposeTradeCall).to.be.rejected;
  });
  it('Should validate NFT tokens exist', async function () {
    // Arrange: Use a non-existent NFT ID
    const nonExistentNftId = 999;
    const ownerRequestedNft = await nftContract.read.ownerOf([requestedNftId]);

    // Act: Attempt to propose a trade with the non-existent NFT ID
    const proposeTradeCall = nftSwap.write.proposeTrade(
      [getAddress(nftContract.address), nonExistentNftId, getAddress(nftContract.address), requestedNftId, ownerRequestedNft],
      { account: from.account }
    );

    // Assert: The transaction should be rejected with the correct error message
    await expect(proposeTradeCall).to.be.rejectedWith('Requested NFT does not exist');
  });
  it('Should handle NFT approval revocation correctly', async function () {
    // Arrange: Propose and agree to a trade
    const ownerRequestedNft = await nftContract.read.ownerOf([requestedNftId]);
    const proposeHash = await nftSwap.write.proposeTrade(
      [getAddress(nftContract.address), offeredNftId, getAddress(nftContract.address), requestedNftId, ownerRequestedNft],
      { account: from.account }
    );
    await publicClient.waitForTransactionReceipt({ hash: proposeHash });

    const agreeHashFrom = await nftSwap.write.agreeTrade([0], { account: from.account });
    await publicClient.waitForTransactionReceipt({ hash: agreeHashFrom });
    const agreeHashTo = await nftSwap.write.agreeTrade([0], { account: to.account });
    await publicClient.waitForTransactionReceipt({ hash: agreeHashTo });

    // Approve the contract to transfer the NFT
    const approveHash = await nftContract.write.approve([getAddress(nftSwap.address), offeredNftId], { account: from.account });
    await publicClient.waitForTransactionReceipt({ hash: approveHash });

    // Revoke the approval by setting it to zero address
    const revokeHash = await nftContract.write.approve([getAddress('0x0000000000000000000000000000000000000000'), offeredNftId], {
      account: from.account
    });
    await publicClient.waitForTransactionReceipt({ hash: revokeHash });

    // Act: Attempt to confirm the trade
    const confirmTradeCall = nftSwap.write.confirmTrade([0], { account: from.account });

    // Assert: The transaction should be rejected with the correct error message
    await expect(confirmTradeCall).to.be.rejectedWith('Contract not approved to transfer NFT');
  });
});
