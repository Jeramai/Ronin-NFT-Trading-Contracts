import '@nomicfoundation/hardhat-toolbox-viem';
import 'hardhat-deploy';
import type { HardhatUserConfig } from 'hardhat/config';

const config: HardhatUserConfig = {
  solidity: '0.8.28',
  namedAccounts: {
    deployer: 'privatekey://0xe84e5ec68816bed7dc2a17fe293073cc6f34bd7ff42dd8543771370fc8bef672'
  },
  networks: {
    ronin: {
      chainId: 2020,
      url: 'https://api.roninchain.com/rpc',
      gasPrice: 21_000_000_000
    },
    saigon: {
      chainId: 2021,
      url: 'https://saigon-testnet.roninchain.com/rpc',
      gasPrice: 21_000_000_000
    }
  }
};

export default config;
