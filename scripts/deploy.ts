import { ethers } from "@nomiclabs/buidler";
import { BigNumber } from 'ethers';
const { parseEther, formatEther, commify } = ethers.utils;

// Edit this premines mapping to mint tokens *before* control of the token is given over to MasterPerfumer
const PRE_MINED_ALLOCATIONS: { [index: string]: BigNumber; } = {
  ['0x1234567890123456789012345678901234567890']: parseEther('31000000'),
}

// Edit these constants to adjust the minting schedule
const HARD_CAP = parseEther('100000000');
const CLGN_PER_BLOCK = parseEther('500');
const PHASE_1_DURATION_IN_BLOCKS = 46000; // 46k = ~1 week
const PHASE_2_DURATION_IN_BLOCKS = 46000; // 46k = ~1 week
const PHASE_3_DURATION_IN_BLOCKS = 46000; // 46k = ~1 week
const MIN_ELAPSED_BLOCKS_BEFORE_PHASE_STARTS = 13400; // 13.4k = ~48 hours
const PHASE_1_START_BLOCK = 12000000;
const PHASE_2_START_BLOCK = 13000000;
const PHASE_3_START_BLOCK = 14000000;

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
  
  for (let addr in PRE_MINED_ALLOCATIONS) {
    let value = PRE_MINED_ALLOCATIONS[addr];
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
  let perfumer = await tokenTrx.deployed();
  console.log(` deployed at ${perfumer.address}`);
  
  await token.transferOwnership(perfumer.address)
  console.log(`Token is now owned by the perfumer`);

  // TODO: (here or in separate script): list some LP tokens!
  // await perfumer.add(100, some_LP_pool_address, false)
  // await perfumer.add(100, some_other_pool_address, false)
  // await perfumer.add(200, CLGN_LP_pool_address, false)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
