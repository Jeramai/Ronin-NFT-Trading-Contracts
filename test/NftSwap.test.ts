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
  Completed,
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

  it('Should allow a user to propose a trade', async function () {
    // Act
    const ownerRequestedNft = await nftContract.read.ownerOf([requestedNftId]);
    const hash2 = await nftSwap.write.proposeTrade(
      [getAddress(nftContract.address), offeredNftId, getAddress(nftContract.address), requestedNftId, ownerRequestedNft],
      { account: from.account }
    );

    // Assert
    await publicClient.waitForTransactionReceipt({ hash: hash2 });

    // Test
    const trade = (await nftSwap.read.getTrade([0])) as Trade;
    expect(trade.fromAddress).to.equal(getAddress(from.account.address));
    expect(trade.fromNftContract).to.equal(getAddress(nftContract.address));
    expect(trade.fromNftId).to.equal(BigInt(offeredNftId));
    expect(trade.fromHasAgreed).to.equal(false);
    expect(trade.fromHasConfirmed).to.equal(false);
    expect(trade.toAddress).to.equal(getAddress(to.account.address));
    expect(trade.toNftContract).to.equal(getAddress(nftContract.address));
    expect(trade.toNftId).to.equal(BigInt(requestedNftId));
    expect(trade.toHasAgreed).to.equal(false);
    expect(trade.toHasConfirmed).to.equal(false);
    expect(trade.status).to.equal(TradeStatus.Proposed);
  });
  //

  // Get accounts from Hardhat
  it('Should allow the from of the requested NFT to agree to a trade', async function () {
    const ownerRequestedNft = await nftContract.read.ownerOf([requestedNftId]);
    const hash2 = await nftSwap.write.proposeTrade(
      [getAddress(nftContract.address), offeredNftId, getAddress(nftContract.address), requestedNftId, ownerRequestedNft],
      { account: from.account }
    );

    await publicClient.waitForTransactionReceipt({ hash: hash2 });

    // Have FROM side agree
    const agreeHash = await nftSwap.write.agreeTrade([0], { account: from.account });
    await publicClient.waitForTransactionReceipt({ hash: agreeHash });

    const tradeFrom = (await nftSwap.read.getTrade([0])) as Trade;
    expect(tradeFrom.status).to.equal(TradeStatus.Proposed);
    expect(tradeFrom.fromHasAgreed).to.equal(true);
    expect(tradeFrom.toHasAgreed).to.equal(false);

    // Have TO side agree
    const agreeHash2 = await nftSwap.write.agreeTrade([0], { account: to.account });
    await publicClient.waitForTransactionReceipt({ hash: agreeHash2 });

    const tradeTo = (await nftSwap.read.getTrade([0])) as Trade;
    expect(tradeTo.status).to.equal(TradeStatus.Agreed);
    expect(tradeTo.fromHasAgreed).to.equal(true);
    expect(tradeTo.toHasAgreed).to.equal(true);
  });
});
