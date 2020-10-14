import { ethers, network } from "@nomiclabs/buidler";
import { BigNumber } from 'ethers';
const { parseEther, formatEther, commify, keccak256, solidityPack, getAddress } = ethers.utils;

// Edit this premines mapping to mint tokens *before* control of the token is given over to MasterPerfumer
let PRE_MINED_ALLOCATIONS: { [index: string]: BigNumber; } = {};
const STANDARD_LP_TOKEN_WEIGHT = 100;
const CLGN_LP_TOKEN_WEIGHT = 200;
let INITIAL_TOKEN_WHITELIST_WEIGHTINGS: { [index: string]: number; } = {};

// Edit these constants to adjust the minting schedule
const HARD_CAP: BigNumber = parseEther('100000000');
const CLGN_PER_BLOCK: BigNumber = parseEther('500');
let PHASE_1_DURATION_IN_BLOCKS: number;
let PHASE_2_DURATION_IN_BLOCKS: number;
let PHASE_3_DURATION_IN_BLOCKS: number;
let MIN_ELAPSED_BLOCKS_BEFORE_PHASE_STARTS: number;
let PHASE_1_START_BLOCK: number;
let PHASE_2_START_BLOCK: number;
let PHASE_3_START_BLOCK: number;

function getUniswapV2PairAddress(tokenA: string, tokenB: string): string {
  const [token0, token1] = tokenA < tokenB ? [tokenA, tokenB] : [tokenB, tokenA]
  const create2Inputs = [
    '0xff',
    "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f", // UniswapV2Factory address (mainnet & goerli)
    keccak256(solidityPack(['address', 'address'], [token0, token1])),
    "0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f" // Hash of UniswapV2Pair bytecode
  ]
  const sanitizedInputs = `0x${create2Inputs.map(i => i.slice(2)).join('')}`
  return getAddress(`0x${keccak256(sanitizedInputs).slice(-40)}`)
}

// Edit these constants to adjust the minting schedule
async function init() {
  console.log(`Using config for network ${network.name}`)
  let deployer = (await ethers.provider.listAccounts())[0];
  console.log(`Deploying from account ${deployer}`);
  
  if (network.name === "goerli") {
    PRE_MINED_ALLOCATIONS = {
      [deployer]: parseEther('250000'),
      ['0x14Bdf3b064D5aa1f116C3664613962ce2AA90285']: parseEther('30000000'),
      ['0x6aa7e6a647820BE5aB82BB8B4eCcc976faEd09ad']: parseEther('30000000'),
      ['0x8eC1F36BfFCD42bbC5DCf4cf262Ae3387C30d842']: parseEther('30000000'),
    }
    INITIAL_TOKEN_WHITELIST_WEIGHTINGS = {
      ['0x5e68048f85f8fdaaa3c58c231437fc62962d43d1']: STANDARD_LP_TOKEN_WEIGHT,
    }
  
    PHASE_1_DURATION_IN_BLOCKS = 6500; // 6.5k = ~24 hours
    PHASE_2_DURATION_IN_BLOCKS = 6500; // 6.5k = ~24 hours
    PHASE_3_DURATION_IN_BLOCKS = 6500; // 6.5k = ~24 hours
    MIN_ELAPSED_BLOCKS_BEFORE_PHASE_STARTS = 3250; // 3.25k = ~12 hours
    PHASE_1_START_BLOCK = 3580000;
    PHASE_2_START_BLOCK = 3593000;
    PHASE_3_START_BLOCK = 3606000;
  } else if (network.name === "mainnet") {
    console.error("Pre-mines not yet configured for mainnet");
    process.exit(1)
  } else {
    // Assume local testnet
    PRE_MINED_ALLOCATIONS = {
      ['0x1234567890123456789012345678901234567890']: parseEther('31000000'),
    }
    PHASE_1_DURATION_IN_BLOCKS = 46000; // 46k = ~1 week
    PHASE_2_DURATION_IN_BLOCKS = 46000; // 46k = ~1 week
    PHASE_3_DURATION_IN_BLOCKS = 46000; // 46k = ~1 week
    MIN_ELAPSED_BLOCKS_BEFORE_PHASE_STARTS = 13400; // 13.4k = ~48 hours
    PHASE_1_START_BLOCK = 12000000;
    PHASE_2_START_BLOCK = 13000000;
    PHASE_3_START_BLOCK = 14000000;
  }
}

// Check that the planned distributions match the hard cap
function sanityCheck() {
  let totalPreMine = BigNumber.from(0)
  for (let addr in PRE_MINED_ALLOCATIONS) {
    totalPreMine = totalPreMine.add(PRE_MINED_ALLOCATIONS[addr]);
  }

  let phase1 = BigNumber.from(PHASE_1_DURATION_IN_BLOCKS).mul(CLGN_PER_BLOCK);
  let phase2 = BigNumber.from(PHASE_2_DURATION_IN_BLOCKS).mul(CLGN_PER_BLOCK);
  let phase3 = BigNumber.from(PHASE_3_DURATION_IN_BLOCKS).mul(CLGN_PER_BLOCK);
  let total = totalPreMine.add(phase1).add(phase2).add(phase3);

  console.log(`Checking distributions:`)
  console.log(` - Total pre-mine is ${commify(formatEther(totalPreMine))}`)
  console.log(` - Phase 1 will distribute ${commify(formatEther(phase1))}`)
  console.log(` - Phase 2 will distribute ${commify(formatEther(phase2))}`)
  console.log(` - Phase 3 will distribute ${commify(formatEther(phase3))}`)
  console.log(`TOTAL: ${commify(formatEther(total))}`)

  if (!total.eq(HARD_CAP)) {
    throw `CONFIG ERROR: Sum of distributions (${commify(formatEther(total))}) != hard cap (${commify(formatEther(HARD_CAP))})`
  }
}

async function main() {

  await init();
  sanityCheck();

  // Deploy the token
  const tokenFactory = await ethers.getContractFactory("CologneToken");
  const perfumerFactory = await ethers.getContractFactory("MasterPerfumer");
  let tokenTrx = await tokenFactory.deploy(HARD_CAP);
  process.stdout.write(`Deploying token (trx ${tokenTrx.deployTransaction.hash})...`);
  let token = await tokenTrx.deployed();
  console.log(` deployed at ${token.address}`);

  // Mint some pre-mined tokens
  console.log("Pre-mines:");

  // let bal0 = await token.balanceOf('0x1234567890123456789012345678901234567890')
  
  for (const [addr, value] of Object.entries(PRE_MINED_ALLOCATIONS)) {
    await token.mint(addr, value);
    console.log(` - ${addr} gets ${commify(formatEther(value))} CLGN`);
  }
  
  // let bal1 = await token.balanceOf('0x1234567890123456789012345678901234567890')
  // console.log(`Balance changed from ${commify(formatEther(bal0))} to ${commify(formatEther(bal1))}`);

  // Deploy the perfumer and take ownership of the token
  let perfumerTrx = await perfumerFactory.deploy(
    token.address,
    CLGN_PER_BLOCK,
    PHASE_1_DURATION_IN_BLOCKS,
    PHASE_2_DURATION_IN_BLOCKS,
    PHASE_3_DURATION_IN_BLOCKS,
    MIN_ELAPSED_BLOCKS_BEFORE_PHASE_STARTS,
    PHASE_1_START_BLOCK,
    PHASE_2_START_BLOCK,
    PHASE_3_START_BLOCK,
  );
  process.stdout.write(`Deploying perfumer (trx ${perfumerTrx.deployTransaction.hash})...`);
  let perfumer = await perfumerTrx.deployed();
  console.log(` deployed at ${perfumer.address}`);
  
  await token.transferOwnership(perfumer.address)
  console.log(`Token is now owned by the perfumer`);

  const UniswapV2WrappedEthClgnPairAddr = getUniswapV2PairAddress(
    token.address,
    "0xb4fbf271143f4fbf7b91a5ded31805e42b2208d6"); //WETH
  console.log("Uniswap CLGN Pair address (pair not created yet) will be: ", UniswapV2WrappedEthClgnPairAddr);
    
  console.log(`Whitelisting:`);
  INITIAL_TOKEN_WHITELIST_WEIGHTINGS[UniswapV2WrappedEthClgnPairAddr] = CLGN_LP_TOKEN_WEIGHT;
  for (const [addr, weight] of Object.entries(INITIAL_TOKEN_WHITELIST_WEIGHTINGS)) {
    await perfumer.add(weight, addr, false);
    console.log(` - ${addr} (weight=${weight})`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
