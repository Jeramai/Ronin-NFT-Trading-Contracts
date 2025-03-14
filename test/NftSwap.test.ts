import { expect } from 'chai';
import hre from 'hardhat';
import { Address, createPublicClient, createWalletClient, getAddress, getContract, http } from 'viem';
import { hardhat } from 'viem/chains'; // Use hardhat chain
import NftSwap from '../artifacts/contracts/NftSwap.sol/NftSwap.json';

type Trade = {
  proposer: Address;
  offeredNftContract: Address;
  offeredNftId: bigint;
  requestedNftContract: Address;
  requestedNftId: bigint;
  status: bigint;
};

describe('NftSwap', function () {
  it('Should allow a user to propose a trade', async function () {
    // Create Viem clients
    const publicClient = createPublicClient({
      chain: hardhat, // Use hardhat chain here
      transport: http() // Use the Hardhat Network RPC endpoint
    });

    // Get accounts from Hardhat
    const [owner, addr1, addr2] = await hre.viem.getWalletClients();

    // Create wallet clients
    const walletClientOwner = createWalletClient({
      chain: hardhat,
      transport: http(),
      account: owner.account
    });

    // Deploy the contract with Viem
    const hash = await walletClientOwner.deployContract({
      abi: NftSwap.abi,
      bytecode: NftSwap.bytecode as Address
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const nftSwapAddress = receipt.contractAddress!;

    // Get a contract instance with Viem
    const nftSwap = getContract({
      address: nftSwapAddress,
      abi: NftSwap.abi,
      client: {
        public: publicClient,
        wallet: walletClientOwner
      }
    });

    // Arrange
    const proposer = addr1;
    const offeredNftContract = getAddress(addr2.account.address); // Use a valid address
    const offeredNftId = 1;
    const requestedNftContract = getAddress(owner.account.address); // Use a valid address
    const requestedNftId = 2;

    // Act
    const hash2 = await nftSwap.write.proposeTrade([offeredNftContract, offeredNftId, requestedNftContract, requestedNftId], {
      account: addr1.account
    });

    await publicClient.waitForTransactionReceipt({ hash: hash2 }); // Assert
    const trade = (await nftSwap.read.getTrade([0])) as Trade;
    expect(trade.proposer).to.equal(getAddress(proposer.account.address));
    expect(trade.offeredNftContract).to.equal(getAddress(offeredNftContract));
    expect(trade.offeredNftId).to.equal(BigInt(offeredNftId));
    expect(trade.requestedNftContract).to.equal(getAddress(requestedNftContract));
    expect(trade.requestedNftId).to.equal(BigInt(requestedNftId));
    expect(trade.status).to.equal(0); // 0 represents "Proposed"
  });
});
