
import { waffle } from "@nomiclabs/buidler";
import {expect, use} from 'chai';
import CologneTokenArtifact from '../build/CologneToken.json';
import { CologneToken } from '../typechain/CologneToken';
const {deployContract, provider, solidity} = waffle;

describe('CologneToken', () => {
    const [deployer, altOwner, alice, bob] = provider.getWallets();
    const HARD_CAP = 123456789
    let cologne: CologneToken;

    beforeEach(async () => {
        cologne = (await deployContract(deployer, CologneTokenArtifact, [HARD_CAP])) as unknown as CologneToken;
    });

    it('should set correct state variables', async () => {
        const name = await cologne.name();
        expect(name).to.equal("CologneToken");

        const symbol = await cologne.symbol();
        expect(symbol).to.equal("CLGN");

        const decimals = await cologne.decimals();
        expect(decimals).to.equal(18);

        const cap = await cologne.cap();
        expect(cap).to.equal(HARD_CAP);
    });

    it('should track ownership', async () => {
        const owner1 = await cologne.owner();
        expect(owner1).to.equal(deployer.address);
        await expect(cologne.transferOwnership(altOwner.address)).to.emit(cologne, 'OwnershipTransferred')
        const owner2 = await cologne.owner();
        expect(owner2).to.equal(altOwner.address);
    });

    it('should restrict mint() to owner', async () => {
        let nonOwner = cologne.connect(altOwner)

        // Start with supply 0
        expect(await cologne.totalSupply()).to.equal(0);
        await cologne.mint(alice.address, 100);

        // Now 100 and won't increase if non-owner asks to mint
        expect(await cologne.totalSupply()).to.equal(100);
        await expect(nonOwner.mint(bob.address, 200)).to.be.revertedWith("Ownable: caller is not the owner");
        expect(await cologne.totalSupply()).to.equal(100);
        expect(await nonOwner.totalSupply()).to.equal(100);
    });

    it('should prevent minting mor than cap', async () => {
        expect(await cologne.totalSupply()).to.equal(0);
        await expect(cologne.mint(bob.address, HARD_CAP * 2)).to.be.revertedWith("ERC20Capped: cap exceeded");
        await expect(cologne.mint(bob.address, HARD_CAP + 1)).to.be.revertedWith("ERC20Capped: cap exceeded");
        await expect(cologne.mint(bob.address, HARD_CAP)).to.emit(cologne, "Transfer");
        expect(await cologne.totalSupply()).to.equal(HARD_CAP);
        await expect(cologne.mint(alice.address, 1)).to.be.revertedWith("ERC20Capped: cap exceeded");
    });
});
