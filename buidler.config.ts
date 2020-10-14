import { BuidlerConfig, usePlugin } from "@nomiclabs/buidler/config";
usePlugin("@nomiclabs/buidler-waffle");
usePlugin("@nomiclabs/buidler-etherscan");
usePlugin("buidler-typechain");
import dotenv from 'dotenv';

dotenv.config()

// To enable gas reporting:
// 1. launch a buidlerevm node in a separate process: `npx buidler node`
// 2. run tests with the `--network localhost`
// 3. uncomment the line below (commented out becuase with this plugin enabled we do not get solidity error callstacks)
// usePlugin("buidler-gas-reporter");

// TODO: install and use this plugin if code coverage reports are required.
// usePlugin("solidity-coverage");

const config: BuidlerConfig = {
    defaultNetwork: "buidlerevm",
    networks: {
      localhost: {
        url: 'http://127.0.0.1:8545',
        loggingEnabled: true
      },
      mainnet: {
        url: `${process.env.INFURA_MAINNET_API_ENDPOINT}`,
        accounts: {
            mnemonic: `${process.env.MAINNET_MNEMONIC}`,
            path: "m/44'/60'/0'/0/0",
        }
      },
      goerli: {
        url: `${process.env.INFURA_GOERLI_API_ENDPOINT}`,
        accounts: {
            mnemonic: `${process.env.GOERLI_MNEMONIC}`,
            path: "m/44'/60'/0'/0/0",
        }
      },
      // coverage: {
      //   url: 'http://127.0.0.1:8555' // Coverage launches its own ganache-cli client
      // }
    },
    paths: {
        artifacts: "./build"
    },
    solc: {
      version: "0.6.12"
    },
    etherscan: {
      // Your API key for Etherscan
      // Obtain one at https://etherscan.io/
      apiKey: process.env.ETHERSCAN_API_KEY,
    },
    typechain: {
      outDir: "typechain",
      target: "ethers-v4",
    }
  };
export default config;