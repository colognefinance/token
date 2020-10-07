
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
    const HARD_CAP = parseEther("100000000");
    const CLGN_PER_BLOCK = parseEther("500");
    const PHASE_1_DURATION = 46;
    const PHASE_2_DURATION = 46;
    const PHASE_3_DURATION = 56;
    const MIN_ELAPSED_BLOCKS_BEFORE_START = 10;
    const START_PHASE1 = 100;
    const START_PHASE2 = 200;
    const START_PHASE3 = 300;


    beforeEach(async () => {
        cologne = (await deployContract(alice, CologneTokenArtifact, [HARD_CAP])) as unknown as CologneToken;
        perfumer = (await deployContract(alice, MasterPerfumerArtifact,
            [cologne.address,
             CLGN_PER_BLOCK,
             PHASE_1_DURATION,
             PHASE_2_DURATION,
             PHASE_3_DURATION,
             MIN_ELAPSED_BLOCKS_BEFORE_START,
             START_PHASE1,
             START_PHASE2,
             START_PHASE3])) as unknown as MasterPerfumer;        
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
        expect(await perfumer.phase1StartBlock()).to.equal(START_PHASE1);
        expect(await perfumer.phase2StartBlock()).to.equal(START_PHASE2);
        expect(await perfumer.phase3StartBlock()).to.equal(START_PHASE3);
    });

    it('should allow phase schedule updates', async () => {
        await expect(perfumer.setStartBlock(1, 150)).to.emit(perfumer, "Schedule");
        await expect(perfumer.setStartBlock(3, 350)).to.emit(perfumer, "Schedule");
        await expect(perfumer.setStartBlock(2, 303)).to.emit(perfumer, "Schedule");
    });
    
    it('should reject overlapping phases', async () => {
        await expect(perfumer.setStartBlock(1, 160)).to.be.revertedWith("phases 1 & 2 would overlap");
        await expect(perfumer.setStartBlock(3, 240)).to.be.revertedWith("phases 2 & 3 would overlap");
        await expect(perfumer.setStartBlock(2, 255)).to.be.revertedWith("phases 2 & 3 would overlap");
    });

    it.skip('should reject out of order phases', async () => {
        //TODO
    });

    // TODO: skipping this test because and others involving "time travel" we can't advance the block number without breaking subsequent tests
    // Options:
    //   - use waffle's fixings if they backup/restore the block number
    //   - or split into separate test scripts if we can force a new bevm instance for each
    //   - if all else fails, adjust block numbers specified in subsequent tests, ideally dynamically based on block at start of test
    it.skip('should reject phases in the past or too soon', async () => {
        await expect(perfumer.setStartBlock(1, 150)).to.emit(perfumer, "Schedule");
        await advanceBlockTo(142);
        await expect(perfumer.setStartBlock(1, 140)).to.be.revertedWith("setStartBlock: not enough notice given");
        await expect(perfumer.setStartBlock(1, 151)).to.be.revertedWith("setStartBlock: not enough notice given");
    });


    // TODO: more tests of phase start block updates?

    context('With LP tokens', () => {
        beforeEach(async () => {
            // LP Token 1: a, b & c have 1000 each, all approved to perfumer
            // LP Token 2: a, b & c have 1000 each, with 1000, 500 and 0 approved to perfumer respectively
            LP1 = (await deployContract(alice, MockERC20Artifact, ["LP Token 1", "LP1", HARD_CAP])) as unknown as MockErc20;            
            await LP1.transfer(alice.address, '1000');
            await LP1.connect(alice).approve(perfumer.address, '1000');
            await LP1.transfer(bob.address, '1000');
            await LP1.connect(bob).approve(perfumer.address, '1000');
            await LP1.transfer(carol.address, '1000');
            await LP1.connect(carol).approve(perfumer.address, '1000');
            LP2 = (await deployContract(alice, MockERC20Artifact, ["LP Token 2", "LP2", HARD_CAP])) as unknown as MockErc20;
            await LP2.transfer(alice.address, '1000');
            await LP2.connect(alice).approve(perfumer.address, '1000');
            await LP2.transfer(bob.address, '1000');
            await LP2.connect(bob).approve(perfumer.address, '500');
            await LP2.transfer(carol.address, '1000');
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

        context('With Alice and Bob both staking equal shares', () => {
            beforeEach(async () => {
                // LP Token 1: a staking 100
                // LP Token 2: b staking 200
                // Expect equal split
                await perfumer.add('100', LP1.address, true);
                await perfumer.add('100', LP2.address, true);
                await perfumer.connect(alice).deposit(0, 100);
                await perfumer.connect(bob).deposit(1, 200);
            });

            it('should reward all stakers when stakes are "equal"', async () => {
                // Start at 0
                expect(await cologne.balanceOf(alice.address)).to.equal(0);
                expect(await cologne.balanceOf(bob.address)).to.equal(0);
                expect(await perfumer.pendingCologne(0, alice.address)).to.equal(0);
                expect(await perfumer.pendingCologne(1, bob.address)).to.equal(0);

                await advanceBlockTo(100);
                expect(await cologne.balanceOf(alice.address)).to.equal(0);
                expect(await cologne.balanceOf(bob.address)).to.equal(0);
                expect(await perfumer.pendingCologne(0, alice.address)).to.equal(0);
                expect(await perfumer.pendingCologne(1, bob.address)).to.equal(0);

                await advanceBlockTo(101);
                expect(await cologne.balanceOf(alice.address)).to.equal(0);
                expect(await cologne.balanceOf(bob.address)).to.equal(0);
                expect(await perfumer.pendingCologne(0, alice.address)).to.equal(parseEther("250"));
                expect(await perfumer.pendingCologne(1, bob.address)).to.equal(parseEther("250"));

                await advanceBlockTo(146);
                expect(await cologne.balanceOf(alice.address)).to.equal(0);
                expect(await cologne.balanceOf(bob.address)).to.equal(0);
                expect(await perfumer.pendingCologne(0, alice.address)).to.equal(parseEther("11500")); // 46 * 250
                expect(await perfumer.pendingCologne(1, bob.address)).to.equal(parseEther("11500")); // 46 * 250

                await advanceBlockTo(147);
                expect(await cologne.balanceOf(alice.address)).to.equal(0);
                expect(await cologne.balanceOf(bob.address)).to.equal(0);
                expect(await perfumer.pendingCologne(0, alice.address)).to.equal(parseEther("11500")); // 46 * 250
                expect(await perfumer.pendingCologne(1, bob.address)).to.equal(parseEther("11500")); // 46 * 250

                //TODO: more intermediate steps, including withdrawals

                await advanceBlockTo(200);
                expect(await cologne.balanceOf(alice.address)).to.equal(0);
                expect(await cologne.balanceOf(bob.address)).to.equal(0);
                expect(await perfumer.pendingCologne(0, alice.address)).to.equal(parseEther("11500")); // 46 * 250
                expect(await perfumer.pendingCologne(1, bob.address)).to.equal(parseEther("11500")); // 46 * 250

                await advanceBlockTo(201);
                expect(await cologne.balanceOf(alice.address)).to.equal(0);
                expect(await cologne.balanceOf(bob.address)).to.equal(0);
                expect(await perfumer.pendingCologne(0, alice.address)).to.equal(parseEther("11750")); // 47 * 250
                expect(await perfumer.pendingCologne(1, bob.address)).to.equal(parseEther("11750")); // 47 * 250

                // Cannot withdraw more than owed
                await expect(perfumer.connect(bob).withdraw(1, 201)).to.revertedWith("withdraw: not good"); // 47 * 250

                // Now withdraw all but 1
                await expect(perfumer.connect(bob).withdraw(1, 199)).to.emit(perfumer, "Withdraw");
                expect(await cologne.balanceOf(bob.address)).to.equal(parseEther("12000")); // received 48 * 250
                expect(await perfumer.pendingCologne(1, bob.address)).to.equal(parseEther("0")); // 0 remaining

                await advanceBlockTo(360);
                expect(await cologne.balanceOf(alice.address)).to.equal(0);
                expect(await cologne.balanceOf(bob.address)).to.equal(parseEther("12000"));
                expect(await perfumer.pendingCologne(0, alice.address)).to.equal(parseEther("37000")); // (46+46+56) * 250
                expect(await perfumer.pendingCologne(1, bob.address)).to.equal(parseEther("25000")); // (44+56) * 250
            });
        });
    
        it.skip('should reward all stakers in proportion when their when stakes are not equal', async () => {
            //TODO
        });

        it.skip('should not distribute CLGNs if no one deposit', async () => {
            //TODO
        });

        it.skip('should allow emergency withdraw', async () => {
            //TODO
        });
        
    });
});
