
import { waffle, ethers } from "@nomiclabs/buidler";
import {expect, use} from 'chai';
import MasterPerfumerArtifact from '../build/MasterPerfumer.json';
import { MasterPerfumer } from "../typechain/MasterPerfumer";
import CologneTokenArtifact from '../build/CologneToken.json';
import { CologneToken } from '../typechain/CologneToken';
import MockERC20Artifact from '../build/MockERC20.json';
import { MockErc20 } from '../typechain/MockERC20';
const {deployContract, provider, solidity} = waffle;
const { Contract, BigNumber } = ethers;
const { parseEther } = ethers.utils;

const HARD_CAP = parseEther("100000000");
const CLGN_PER_BLOCK = parseEther("500");
const PHASE_1_DURATION = 46;
const PHASE_2_DURATION = 46;
const PHASE_3_DURATION = 56;
const MIN_ELAPSED_BLOCKS_BEFORE_START = 10;
const START_PHASE1_BLOCK_OFFSET = 100;
const START_PHASE2_BLOCK_OFFSET = 200;
const START_PHASE3_BLOCK_OFFSET = 300;

// use(solidity);

// Advance 1 block and 13s of time
// Altered version from @openzeppelin/test-helpers, to work with ethers rather than web3
function advanceBlock () {
    ethers.provider.send("evm_increaseTime", [13])   // add 13 seconds
    ethers.provider.send("evm_mine", [])      // mine the next block
}

// Advance the block to the specified height
// Altered version from @openzeppelin/test-helpers, to work with ethers rather than web3
async function advanceBlockTo (target: number) {
    const currentBlock = (await ethers.provider.getBlockNumber());
    const start = Date.now();
    let notified;
    if (target < currentBlock) throw Error(`Target block #(${target}) is lower than current block #(${currentBlock})`);
    if (target === currentBlock) throw Error(`Target block #(${target}) is equal to current block #(${currentBlock})`);
    while ((await ethers.provider.getBlockNumber()) < target) {
        if (!notified && Date.now() - start >= 5000) {
        notified = true;
        console.log(`Advancing too many blocks is causing this test to be slow.`);
        }
        await advanceBlock();
    }
}

describe('MasterPerfumer', () => {
    const [alice, bob, carol, minter] = provider.getWallets();
    let cologne: CologneToken;
    let perfumer: MasterPerfumer;
    let LP1: MockErc20;
    let LP2: MockErc20;

    // We vary the phase start blocks throughout our tests, because the block number gets bigger with every test
    let startPhase1Block: number;
    let startPhase2Block: number;
    let startPhase3Block: number;


    beforeEach(async () => {
        const currentBlock = (await ethers.provider.getBlockNumber());
        startPhase1Block = currentBlock + START_PHASE1_BLOCK_OFFSET;
        startPhase2Block = currentBlock + START_PHASE2_BLOCK_OFFSET;
        startPhase3Block = currentBlock + START_PHASE3_BLOCK_OFFSET;

        cologne = (await deployContract(minter, CologneTokenArtifact, [HARD_CAP])) as unknown as CologneToken;
        perfumer = (await deployContract(minter, MasterPerfumerArtifact,
            [cologne.address,
             CLGN_PER_BLOCK,
             PHASE_1_DURATION,
             PHASE_2_DURATION,
             PHASE_3_DURATION,
             MIN_ELAPSED_BLOCKS_BEFORE_START,
             startPhase1Block,
             startPhase2Block,
             startPhase3Block])) as unknown as MasterPerfumer;        
        await expect(cologne.transferOwnership(perfumer.address)).to.emit(cologne, 'OwnershipTransferred')
    });

    it('should set correct state variables', async () => {
        expect(await cologne.owner()).to.equal(perfumer.address);
        expect(await perfumer.cologne()).to.equal(cologne.address);
        expect(await perfumer.colognePerBlock()).to.equal(CLGN_PER_BLOCK);
        expect(await perfumer.phase1DurationInBlocks()).to.equal(PHASE_1_DURATION);
        expect(await perfumer.phase2DurationInBlocks()).to.equal(PHASE_2_DURATION);
        expect(await perfumer.phase3DurationInBlocks()).to.equal(PHASE_3_DURATION);
        expect(await perfumer.minElapsedBlocksBeforePhaseStart()).to.equal(MIN_ELAPSED_BLOCKS_BEFORE_START);
        expect(await perfumer.phase1StartBlock()).to.equal(startPhase1Block);
        expect(await perfumer.phase2StartBlock()).to.equal(startPhase2Block);
        expect(await perfumer.phase3StartBlock()).to.equal(startPhase3Block);
    });

    it('should allow phase schedule updates', async () => {
        await expect(perfumer.setStartBlock(1, startPhase1Block + 50)).to.emit(perfumer, "Schedule");
        await expect(perfumer.setStartBlock(3, startPhase3Block + 50)).to.emit(perfumer, "Schedule");
        await expect(perfumer.setStartBlock(2, startPhase3Block + 3)).to.emit(perfumer, "Schedule");
    });
    
    it('should reject overlapping phases', async () => {
        await expect(perfumer.setStartBlock(1, startPhase1Block + 60)).to.be.revertedWith("phases 1 & 2 overlap or wrong order");
        await expect(perfumer.setStartBlock(3, startPhase2Block + 40)).to.be.revertedWith("phases 2 & 3 overlap or wrong order");
        await expect(perfumer.setStartBlock(2, startPhase2Block + 55)).to.be.revertedWith("phases 2 & 3 overlap or wrong order");
        await expect(perfumer.setStartBlock(3, startPhase2Block)).to.be.revertedWith("phases 2 & 3 overlap or wrong order");
        await expect(perfumer.setStartBlock(3, startPhase2Block + 45)).to.be.revertedWith("phases 2 & 3 overlap or wrong order");
    });

    it('should reject out of order phases', async () => {
        await expect(perfumer.setStartBlock(1, startPhase3Block + 100)).to.be.revertedWith("phases 1 & 2 overlap or wrong order");
        await expect(perfumer.setStartBlock(2, startPhase1Block - 50)).to.be.revertedWith("phases 1 & 2 overlap or wrong order");
        await expect(perfumer.setStartBlock(3, startPhase2Block - 1)).to.be.revertedWith("phases 2 & 3 overlap or wrong order");
    });

    it('should reject phases in the past', async () => {
        await expect(perfumer.setStartBlock(1, startPhase1Block + 50)).to.emit(perfumer, "Schedule");
        await advanceBlockTo(startPhase1Block + 42);
        await expect(perfumer.setStartBlock(1, startPhase1Block + 40)).to.be.revertedWith("setStartBlock: not enough notice given");
        await expect(perfumer.setStartBlock(1, startPhase1Block + 41)).to.be.revertedWith("setStartBlock: not enough notice given");
        await expect(perfumer.setStartBlock(1, startPhase1Block + 42)).to.be.revertedWith("setStartBlock: not enough notice given");
        await expect(perfumer.setStartBlock(3, startPhase1Block + 20)).to.be.revertedWith("setStartBlock: not enough notice given");
    });

    it('should reject phases that start too soon', async () => {
        await expect(perfumer.setStartBlock(1, startPhase1Block + 50)).to.emit(perfumer, "Schedule");
        await advanceBlockTo(startPhase1Block + 42);
        await expect(perfumer.setStartBlock(1, startPhase1Block + 51)).to.be.revertedWith("setStartBlock: not enough notice given");
        await expect(perfumer.setStartBlock(1, startPhase1Block + 52)).to.be.revertedWith("setStartBlock: not enough notice given");
    });

    context('With LP tokens', () => {
        beforeEach(async () => {
            // LP Token 1: a, b & c have 1000 each, all approved to perfumer
            // LP Token 2: a, b & c have 1000 each, with 1000, 500 and 0 approved to perfumer respectively
            LP1 = (await deployContract(minter, MockERC20Artifact, ["LP Token 1", "LP1", HARD_CAP])) as unknown as MockErc20;            
            await LP1.transfer(alice.address, '1000');
            await LP1.connect(alice).approve(perfumer.address, '1000');
            await LP1.transfer(bob.address, '1000');
            await LP1.connect(bob).approve(perfumer.address, '1000');
            await LP1.transfer(carol.address, '1000');
            await LP1.connect(carol).approve(perfumer.address, '1000');
            LP2 = (await deployContract(minter, MockERC20Artifact, ["LP Token 2", "LP2", HARD_CAP])) as unknown as MockErc20;
            await LP2.transfer(alice.address, '1000');
            await LP2.connect(alice).approve(perfumer.address, '1000');
            await LP2.transfer(bob.address, '1000');
            await LP2.connect(bob).approve(perfumer.address, '500');
            await LP2.transfer(carol.address, '1000');
        });

        it('A & B should have expected balances', async () => {
            expect(await LP1.balanceOf(alice.address)).to.equal(1000);
            expect(await LP2.balanceOf(bob.address)).to.equal(1000);
        });

        it('should update state as LP token entries are added', async () => {
            await perfumer.add('100', LP1.address, true);
            expect(await perfumer.totalAllocPoint()).to.equal(100);
            expect(await perfumer.poolLength()).to.equal(1);
            await perfumer.add('100', LP2.address, true);
            expect(await perfumer.totalAllocPoint()).to.equal(200);
            expect(await perfumer.poolLength()).to.equal(2);
        });

        it('should prevent duplicate LP token entries', async () => {
            await perfumer.add('100', LP1.address, true);
            await expect(perfumer.add('100', LP1.address, true)).to.be.revertedWith("add: duplicate token");
        });

        context('With equal pool weights (Alice and Bob start with a pool to themselves)', () => {
            beforeEach(async () => {
                // LP Token 1: a staking 100
                // LP Token 2: b staking 200
                // Expect equal split
                await perfumer.add('100', LP1.address, true);
                await perfumer.add('100', LP2.address, true);
                await perfumer.connect(alice).deposit(0, 100);
                await perfumer.connect(bob).deposit(1, 200);
            });

            it('should start with correct balances and totalSupplies', async () => {
                expect(await LP1.balanceOf(alice.address)).to.equal(900);
                expect(await LP2.balanceOf(bob.address)).to.equal(800);
                expect(await LP1.balanceOf(perfumer.address)).to.equal(100);
                expect(await LP2.balanceOf(perfumer.address)).to.equal(200);
            });

            it('should reward all stakers equally when they have a pool each', async () => {
                // Start at 0
                expect(await cologne.balanceOf(alice.address)).to.equal(0);
                expect(await cologne.balanceOf(bob.address)).to.equal(0);
                expect(await perfumer.pendingCologne(0, alice.address)).to.equal(0);
                expect(await perfumer.pendingCologne(1, bob.address)).to.equal(0);

                await advanceBlockTo(startPhase1Block);
                expect(await cologne.balanceOf(alice.address)).to.equal(0);
                expect(await cologne.balanceOf(bob.address)).to.equal(0);
                expect(await perfumer.pendingCologne(0, alice.address)).to.equal(0);
                expect(await perfumer.pendingCologne(1, bob.address)).to.equal(0);

                await advanceBlockTo(startPhase1Block + 1);
                expect(await cologne.balanceOf(alice.address)).to.equal(0);
                expect(await cologne.balanceOf(bob.address)).to.equal(0);
                expect(await perfumer.pendingCologne(0, alice.address)).to.equal(parseEther("250"));
                expect(await perfumer.pendingCologne(1, bob.address)).to.equal(parseEther("250"));

                await advanceBlockTo(startPhase1Block + 46);
                expect(await cologne.balanceOf(alice.address)).to.equal(0);
                expect(await cologne.balanceOf(bob.address)).to.equal(0);
                expect(await perfumer.pendingCologne(0, alice.address)).to.equal(parseEther("11500")); // 46 * 250
                expect(await perfumer.pendingCologne(1, bob.address)).to.equal(parseEther("11500")); // 46 * 250

                await advanceBlockTo(startPhase1Block + 47);
                expect(await cologne.balanceOf(alice.address)).to.equal(0);
                expect(await cologne.balanceOf(bob.address)).to.equal(0);
                expect(await perfumer.pendingCologne(0, alice.address)).to.equal(parseEther("11500")); // 46 * 250
                expect(await perfumer.pendingCologne(1, bob.address)).to.equal(parseEther("11500")); // 46 * 250

                await advanceBlockTo(startPhase2Block);
                expect(await cologne.balanceOf(alice.address)).to.equal(0);
                expect(await cologne.balanceOf(bob.address)).to.equal(0);
                expect(await perfumer.pendingCologne(0, alice.address)).to.equal(parseEther("11500")); // 46 * 250
                expect(await perfumer.pendingCologne(1, bob.address)).to.equal(parseEther("11500")); // 46 * 250

                await advanceBlockTo(startPhase2Block + 1);
                expect(await cologne.balanceOf(alice.address)).to.equal(0);
                expect(await cologne.balanceOf(bob.address)).to.equal(0);
                expect(await perfumer.pendingCologne(0, alice.address)).to.equal(parseEther("11750")); // 47 * 250
                expect(await perfumer.pendingCologne(1, bob.address)).to.equal(parseEther("11750")); // 47 * 250

                // Cannot withdraw more than owed
                await expect(perfumer.connect(bob).withdraw(1, 201)).to.revertedWith("withdraw: not good"); // 47 * 250

                // Now B withdraws all but 1
                await expect(perfumer.connect(bob).withdraw(1, 199)).to.emit(perfumer, "Withdraw");
                expect(await cologne.balanceOf(bob.address)).to.equal(parseEther("12000")); // received 48 * 250
                expect(await perfumer.pendingCologne(1, bob.address)).to.equal(parseEther("0")); // 0 remaining

                await advanceBlockTo(startPhase3Block + 60);
                expect(await cologne.balanceOf(alice.address)).to.equal(0);
                expect(await cologne.balanceOf(bob.address)).to.equal(parseEther("12000"));
                expect(await perfumer.pendingCologne(0, alice.address)).to.equal(parseEther("37000")); // (46+46+56) * 250
                expect(await perfumer.pendingCologne(1, bob.address)).to.equal(parseEther("25000")); // (44+56) * 250
            });

            it('should reward all stakers appropriately when stakes change and pools become shared', async () => {
                // Start at 0
                expect(await cologne.balanceOf(alice.address)).to.equal(0);
                expect(await cologne.balanceOf(bob.address)).to.equal(0);
                expect(await perfumer.pendingCologne(0, alice.address)).to.equal(0);
                expect(await perfumer.pendingCologne(1, bob.address)).to.equal(0);

                await advanceBlockTo(startPhase1Block);
                expect(await cologne.balanceOf(alice.address)).to.equal(0);
                expect(await cologne.balanceOf(bob.address)).to.equal(0);
                expect(await perfumer.pendingCologne(0, alice.address)).to.equal(0);
                expect(await perfumer.pendingCologne(1, bob.address)).to.equal(0);

                await advanceBlockTo(startPhase1Block + 1);
                expect(await cologne.balanceOf(alice.address)).to.equal(0);
                expect(await cologne.balanceOf(bob.address)).to.equal(0);
                expect(await perfumer.pendingCologne(0, alice.address)).to.equal(parseEther("250"));
                expect(await perfumer.pendingCologne(1, alice.address)).to.equal(parseEther("0"));
                expect(await perfumer.pendingCologne(0, bob.address)).to.equal(parseEther("0"));
                expect(await perfumer.pendingCologne(1, bob.address)).to.equal(parseEther("250"));

                // Now A deposits 50 of LP Token 2, taking 20% of LP2's allocation for the next 44 blocks
                // (The previous allocation counts for two blocks, not just one.)
                await perfumer.connect(alice).deposit(1, 50);
                await advanceBlockTo(startPhase1Block + 3);
                expect(await cologne.balanceOf(alice.address)).to.equal(0);
                expect(await cologne.balanceOf(bob.address)).to.equal(0);
                expect(await perfumer.pendingCologne(0, alice.address)).to.equal(parseEther("750")); // 250*3blocks
                expect(await perfumer.pendingCologne(1, alice.address)).to.equal(parseEther("50")); // 50*1block
                expect(await perfumer.pendingCologne(0, bob.address)).to.equal(parseEther("0"));
                expect(await perfumer.pendingCologne(1, bob.address)).to.equal(parseEther("700")); // 250*2blocs + 200 * 1block

                await advanceBlockTo(startPhase1Block + 46);
                expect(await cologne.balanceOf(alice.address)).to.equal(0);
                expect(await cologne.balanceOf(bob.address)).to.equal(0);
                expect(await perfumer.pendingCologne(0, alice.address)).to.equal(parseEther("11500")); // 46 * 250
                expect(await perfumer.pendingCologne(1, alice.address)).to.equal(parseEther("2200")); // 44 * 50
                expect(await perfumer.pendingCologne(0, bob.address)).to.equal(parseEther("0"));
                expect(await perfumer.pendingCologne(1, bob.address)).to.equal(parseEther("9300")); // 500 + 44 * 200

                // Values unchanged at next block because no phase active
                await advanceBlockTo(startPhase1Block + 47);
                expect(await cologne.balanceOf(alice.address)).to.equal(0);
                expect(await cologne.balanceOf(bob.address)).to.equal(0);
                expect(await perfumer.pendingCologne(0, alice.address)).to.equal(parseEther("11500")); // 46 * 250
                expect(await perfumer.pendingCologne(1, alice.address)).to.equal(parseEther("2200")); // 44 * 50
                expect(await perfumer.pendingCologne(0, bob.address)).to.equal(parseEther("0"));
                expect(await perfumer.pendingCologne(1, bob.address)).to.equal(parseEther("9300")); // 500 + 44 * 200

                // Now A deposits another 250 of LP Token 2, taking 60% of LP2's allocation going forward
                // This should also trigger a withdrawal of the CLGN owed for LP2 tokens (but not LP1 tokens)
                await perfumer.connect(alice).deposit(1, 250);
                await advanceBlockTo(startPhase2Block + 1);
                expect(await cologne.balanceOf(alice.address)).to.equal(parseEther("2200"));
                expect(await cologne.balanceOf(bob.address)).to.equal(0);
                expect(await perfumer.pendingCologne(0, alice.address)).to.equal(parseEther("11750")); // 47 * 250
                expect(await perfumer.pendingCologne(1, alice.address)).to.equal(parseEther("150")); // 150*1block
                expect(await perfumer.pendingCologne(0, bob.address)).to.equal(parseEther("0"));
                expect(await perfumer.pendingCologne(1, bob.address)).to.equal(parseEther("9400")); // Above + 100*1block

                // Now A withdraws all but 1 from pool A, and all from pool B
                // A keeps all of LP1 allocation, and B gets all LP2 allocation
                // B withdras some from pool B but as he is the only staker the only effect is to receive his CLGN
                // These three withdrawals happen in 3 separate blocks in the Buidler EVM, so the math gets fiddly
                await expect(perfumer.connect(alice).withdraw(0, 99)).to.emit(perfumer, "Withdraw"); // Earns 12000
                await expect(perfumer.connect(alice).withdraw(1, 300)).to.emit(perfumer, "Withdraw"); // Earns 450 (150*3 blocks)
                await expect(perfumer.connect(bob).withdraw(1, 199)).to.emit(perfumer, "Withdraw"); // Earns 9700 (9400 above + 3 blocks * 100)
                expect(await cologne.balanceOf(alice.address)).to.equal(parseEther("14650")); // 2200 + 1200 + 450
                expect(await perfumer.pendingCologne(0, alice.address)).to.equal(parseEther("500")); // 2 blocks * 250
                expect(await perfumer.pendingCologne(1, alice.address)).to.equal(parseEther("0")); // 1 block * 0
                expect(await cologne.balanceOf(bob.address)).to.equal(parseEther("9850")); // Above + 2 blocks @100 + 1block @250
                expect(await perfumer.pendingCologne(1, bob.address)).to.equal(parseEther("0")); // 0 blocks * 250
            });

            it('should allow emergency withdraw', async () => {
                await advanceBlockTo(startPhase3Block + 100);
                expect(await LP1.balanceOf(alice.address)).to.equal(900);
                expect(await LP2.balanceOf(bob.address)).to.equal(800);

                // All phases are over and tokens split evenly but not yet claimed
                expect(await cologne.balanceOf(alice.address)).to.equal(0);
                expect(await cologne.balanceOf(bob.address)).to.equal(0);
                // 148blocks * 250 = 37k
                expect(await perfumer.pendingCologne(0, alice.address)).to.equal(parseEther("37000"));
                expect(await perfumer.pendingCologne(1, alice.address)).to.equal(parseEther("0"));
                expect(await perfumer.pendingCologne(0, bob.address)).to.equal(parseEther("0"));
                expect(await perfumer.pendingCologne(1, bob.address)).to.equal(parseEther("37000"));

                // Now A withdraws and B emergency withdraws. Spot the difference.
                await expect(perfumer.connect(alice).withdraw(0, 100)).to.emit(perfumer, "Withdraw");
                await expect(perfumer.connect(bob).emergencyWithdraw(1)).to.emit(perfumer, "EmergencyWithdraw");

                // A reaps full rewards but B gets none. Both get LP tokens back. Neither are owed any more reward.
                expect(await cologne.balanceOf(alice.address)).to.equal(parseEther("37000"));
                expect(await cologne.balanceOf(bob.address)).to.equal(0);
                expect(await perfumer.pendingCologne(0, alice.address)).to.equal(0);
                expect(await perfumer.pendingCologne(1, alice.address)).to.equal(0);
                expect(await perfumer.pendingCologne(0, bob.address)).to.equal(0);
                expect(await perfumer.pendingCologne(1, bob.address)).to.equal(0);
                expect(await LP1.balanceOf(alice.address)).to.equal(1000);
                expect(await LP2.balanceOf(bob.address)).to.equal(1000);
            });
        });

        context('With different pool weights (Alice and Bob start with a pool to themselves)', () => {
            beforeEach(async () => {
                // LP Token 1: a staking 1000
                // LP Token 2: b staking 1
                // Expect B to take 80% because LP2 is worth 80% of weight
                await perfumer.add('10', LP1.address, true);
                await perfumer.add('40', LP2.address, true);
                await perfumer.connect(alice).deposit(0, 1000);
                await perfumer.connect(bob).deposit(1, 10);
            });

            it('should start with correct balances and totalSupplies', async () => {
                expect(await LP1.balanceOf(alice.address)).to.equal(0);
                expect(await LP2.balanceOf(bob.address)).to.equal(990);
                expect(await LP1.balanceOf(perfumer.address)).to.equal(1000);
                expect(await LP2.balanceOf(perfumer.address)).to.equal(10);
            });

            it('should reward all stakers in proportion to pool weight when only one staker per', async () => {
                // Start at 0
                expect(await cologne.balanceOf(alice.address)).to.equal(0);
                expect(await cologne.balanceOf(bob.address)).to.equal(0);
                expect(await perfumer.pendingCologne(0, alice.address)).to.equal(0);
                expect(await perfumer.pendingCologne(1, bob.address)).to.equal(0);

                await advanceBlockTo(startPhase1Block);
                expect(await cologne.balanceOf(alice.address)).to.equal(0);
                expect(await cologne.balanceOf(bob.address)).to.equal(0);
                expect(await perfumer.pendingCologne(0, alice.address)).to.equal(0);
                expect(await perfumer.pendingCologne(1, bob.address)).to.equal(0);

                await advanceBlockTo(startPhase1Block + 1);
                expect(await cologne.balanceOf(alice.address)).to.equal(0);
                expect(await cologne.balanceOf(bob.address)).to.equal(0);
                expect(await perfumer.pendingCologne(0, alice.address)).to.equal(parseEther("100"));
                expect(await perfumer.pendingCologne(1, bob.address)).to.equal(parseEther("400"));

                await advanceBlockTo(startPhase1Block + 46);
                expect(await cologne.balanceOf(alice.address)).to.equal(0);
                expect(await cologne.balanceOf(bob.address)).to.equal(0);
                expect(await perfumer.pendingCologne(0, alice.address)).to.equal(parseEther("4600")); // 46 * 100
                expect(await perfumer.pendingCologne(1, bob.address)).to.equal(parseEther("18400")); // 46 * 400

                await advanceBlockTo(startPhase3Block + 60);
                expect(await cologne.balanceOf(alice.address)).to.equal(0);
                expect(await cologne.balanceOf(bob.address)).to.equal(0);
                expect(await perfumer.pendingCologne(0, alice.address)).to.equal(parseEther("14800")); // 148 * 100
                expect(await perfumer.pendingCologne(1, bob.address)).to.equal(parseEther("59200")); // 148 * 400
            });

            it('should reward all stakers appropriately when stakes and pool weights change', async () => {
                // Start at 0
                expect(await cologne.balanceOf(alice.address)).to.equal(0);
                expect(await cologne.balanceOf(bob.address)).to.equal(0);
                expect(await perfumer.pendingCologne(0, alice.address)).to.equal(0);
                expect(await perfumer.pendingCologne(1, bob.address)).to.equal(0);

                await advanceBlockTo(startPhase1Block);
                expect(await cologne.balanceOf(alice.address)).to.equal(0);
                expect(await cologne.balanceOf(bob.address)).to.equal(0);
                expect(await perfumer.pendingCologne(0, alice.address)).to.equal(0);
                expect(await perfumer.pendingCologne(1, bob.address)).to.equal(0);

                await advanceBlockTo(startPhase1Block + 1);
                expect(await cologne.balanceOf(alice.address)).to.equal(0);
                expect(await cologne.balanceOf(bob.address)).to.equal(0);
                expect(await perfumer.pendingCologne(0, alice.address)).to.equal(parseEther("100"));
                expect(await perfumer.pendingCologne(1, alice.address)).to.equal(parseEther("0"));
                expect(await perfumer.pendingCologne(0, bob.address)).to.equal(parseEther("0"));
                expect(await perfumer.pendingCologne(1, bob.address)).to.equal(parseEther("400"));

                // Now A deposits 4 of LP Token 2, taking 75% of LP2's allocation for the next 44 blocks
                // (This takes a block to kick in in the BEVM, so the previous allocation counts for two blocks, not just one.)
                await perfumer.connect(alice).deposit(1, 30);
                await advanceBlockTo(startPhase1Block + 3);
                expect(await cologne.balanceOf(alice.address)).to.equal(0);
                expect(await cologne.balanceOf(bob.address)).to.equal(0);
                expect(await perfumer.pendingCologne(0, alice.address)).to.equal(parseEther("300")); // 100*3blocks
                expect(await perfumer.pendingCologne(1, alice.address)).to.equal(parseEther("300")); // 300*1block
                expect(await perfumer.pendingCologne(0, bob.address)).to.equal(parseEther("0"));
                expect(await perfumer.pendingCologne(1, bob.address)).to.equal(parseEther("900")); // 400*2blocs + 100 * 1block

                await advanceBlockTo(startPhase1Block + 46);
                expect(await cologne.balanceOf(alice.address)).to.equal(0);
                expect(await cologne.balanceOf(bob.address)).to.equal(0);
                expect(await perfumer.pendingCologne(0, alice.address)).to.equal(parseEther("4600")); // 46 * 100
                expect(await perfumer.pendingCologne(1, alice.address)).to.equal(parseEther("13200")); // 44 * 300
                expect(await perfumer.pendingCologne(0, bob.address)).to.equal(parseEther("0"));
                expect(await perfumer.pendingCologne(1, bob.address)).to.equal(parseEther("5200")); // 800 + 44 * 100

                // Values unchanged at next block because no phase active
                await advanceBlockTo(startPhase1Block + 47);
                expect(await cologne.balanceOf(alice.address)).to.equal(0);
                expect(await cologne.balanceOf(bob.address)).to.equal(0);
                expect(await perfumer.pendingCologne(0, alice.address)).to.equal(parseEther("4600")); // 46 * 100
                expect(await perfumer.pendingCologne(1, alice.address)).to.equal(parseEther("13200")); // 44 * 300
                expect(await perfumer.pendingCologne(0, bob.address)).to.equal(parseEther("0"));
                expect(await perfumer.pendingCologne(1, bob.address)).to.equal(parseEther("5200")); // 800 + 44 * 100

                // Now pool weights are changed (relative weights are reversed)
                // Fast forward 46 + 56 = 102 reward blocks
                await perfumer.set(0, 4, true);
                await perfumer.set(1, 1, true);
                await advanceBlockTo(startPhase3Block + 100);
                expect(await perfumer.pendingCologne(0, alice.address)).to.equal(parseEther("45400")); // As above + 102 * 400
                expect(await perfumer.pendingCologne(1, alice.address)).to.equal(parseEther("20850")); // As above + 102 * 75
                expect(await perfumer.pendingCologne(0, bob.address)).to.equal(parseEther("0"));
                expect(await perfumer.pendingCologne(1, bob.address)).to.equal(parseEther("7750")); // As above + 102 * 25

            });

            it('should allow emergency withdraw', async () => {
                await advanceBlockTo(startPhase3Block + 100);
                expect(await LP1.balanceOf(alice.address)).to.equal(0);
                expect(await LP2.balanceOf(bob.address)).to.equal(990);

                // All phases are over and tokens split evenly but not yet claimed
                expect(await cologne.balanceOf(alice.address)).to.equal(0);
                expect(await cologne.balanceOf(bob.address)).to.equal(0);
                // 148blocks * 250 = 37k
                expect(await perfumer.pendingCologne(0, alice.address)).to.equal(parseEther("14800"));
                expect(await perfumer.pendingCologne(1, alice.address)).to.equal(parseEther("0"));
                expect(await perfumer.pendingCologne(0, bob.address)).to.equal(parseEther("0"));
                expect(await perfumer.pendingCologne(1, bob.address)).to.equal(parseEther("59200"));

                // Now A withdraws and B emergency withdraws. Spot the difference.
                await expect(perfumer.connect(alice).withdraw(0, 1000)).to.emit(perfumer, "Withdraw");
                await expect(perfumer.connect(bob).emergencyWithdraw(1)).to.emit(perfumer, "EmergencyWithdraw");

                // A reaps full rewards but B gets none. Both get LP tokens back. Neither are owed any more reward.
                expect(await cologne.balanceOf(alice.address)).to.equal(parseEther("14800"));
                expect(await cologne.balanceOf(bob.address)).to.equal(0);
                expect(await perfumer.pendingCologne(0, alice.address)).to.equal(0);
                expect(await perfumer.pendingCologne(1, alice.address)).to.equal(0);
                expect(await perfumer.pendingCologne(0, bob.address)).to.equal(0);
                expect(await perfumer.pendingCologne(1, bob.address)).to.equal(0);
                expect(await LP1.balanceOf(alice.address)).to.equal(1000);
                expect(await LP2.balanceOf(bob.address)).to.equal(1000);
            });
        });
    });
});
