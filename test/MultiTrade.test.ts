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

describe('Multi trade', function () {
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

  it('Should allow a user to participate in multiple trades', async function () {
    // Arrange: Propose two trades involving the 'from' user
    const ownerRequestedNft = await nftContract.read.ownerOf([requestedNftId]);
    const proposeHash1 = await nftSwap.write.proposeTrade([ownerRequestedNft], { account: from.account });
    await publicClient.waitForTransactionReceipt({ hash: proposeHash1 });

    // Mint a new NFT for the second trade
    const newOfferedNftId = 3;
    await nftContract.write.mint([from.account.address, newOfferedNftId]);
    const ownerNewOfferedNft = await nftContract.read.ownerOf([newOfferedNftId]);
    expect(ownerNewOfferedNft).to.equal(getAddress(from.account.address));

    const proposeHash2 = await nftSwap.write.proposeTrade([ownerRequestedNft], { account: from.account });
    await publicClient.waitForTransactionReceipt({ hash: proposeHash2 });

    // Act: 'to' user agrees to both trades
    const agreeHash1 = await nftSwap.write.agreeTrade(
      [0, getAddress(nftContract.address), offeredNftId, getAddress(nftContract.address), requestedNftId],
      { account: to.account }
    );
    await publicClient.waitForTransactionReceipt({ hash: agreeHash1 });
    const agreeHash2 = await nftSwap.write.agreeTrade(
      [1, getAddress(nftContract.address), offeredNftId, getAddress(nftContract.address), requestedNftId],
      { account: to.account }
    );
    await publicClient.waitForTransactionReceipt({ hash: agreeHash2 });

    // Assert: Both trades are in the Agreed state
    let trade = (await nftSwap.read.getTrade([0])) as Trade;
    expect(trade.status).to.equal(TradeStatus.Proposed);
    trade = (await nftSwap.read.getTrade([1])) as Trade;
    expect(trade.status).to.equal(TradeStatus.Proposed);
  });
});
