// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

// Adapted from SushiSwap's MasterChef contract
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/utils/EnumerableSet.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./CologneToken.sol";

// MasterPerfumer is the master of Cologne. He can make Cologne and he is a fair guy.
//
// Note that it's ownable and the owner wields tremendous power. The ownership
// will be transferred to a governance smart contract once CLGN is sufficiently
// distributed and the community can govern itself.
//
// Have fun reading it. Hopefully it's bug-free. God bless.
contract MasterPerfumer is Ownable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    // Info of each user.
    struct UserInfo {
        uint256 amount;     // How many LP tokens the user has provided.
        uint256 rewardDebt; // Reward debt. See explanation below.
        //
        // We do some fancy math here. Basically, any point in time, the amount of CLGNs
        // entitled to a user but is pending to be distributed is:
        //
        //   pending reward = (user.amount * pool.accColognePerShareTimes1e12) - user.rewardDebt
        //
        // Whenever a user deposits or withdraws LP tokens to a pool. Here's what happens:
        //   Step 1. The pool's `accColognePerShareTimes1e12` (and `lastRewardBlock`) gets updated.
        //   Step 2. User receives the pending reward sent to his/her address.
        //   Step 3. User's `amount` gets updated.
        //   Step 4. User's `rewardDebt` gets updated to reflect the reward already sent in Step 2.
    }

    // Info of each pool.
    struct PoolInfo {
        IERC20 lpToken;           // Address of LP token contract.
        uint256 allocPoint;       // How many allocation points assigned to this pool. Weighting of CLGNs to distribute per block vs. other pools.
        uint256 lastRewardBlock;  // Last block number that CLGNs distribution occurs.
        uint256 accColognePerShareTimes1e12; // Accumulated CLGNs per share, times 1e12. See below.
    }



    // Info of each pool.
    PoolInfo[] public poolInfo;
    // Info of each user that stakes LP tokens.
    mapping (uint256 => mapping (address => UserInfo)) public userInfo;
    // Total allocation poitns. Must be the sum of all allocation points in all pools.
    uint256 public totalAllocPoint = 0;

    // Mining of CLGN is enabled in three phases, each lasting a fixed number of blocks.
    // The start block for each is configurable until it has passed, at which point it cannot be changed.
    // This ensures there are no more than 3 phases.
    // The phases may not overlap, and when altering the phase start time the owner cannot start a phase sooner than ~48 hours in the future.
    CologneToken public immutable cologne;
    uint256 public immutable colognePerBlock; // Number of tokens minted per block, accross all pools
    uint256 public immutable phase1DurationInBlocks; // E.g. ~46000 = one week
    uint256 public immutable phase2DurationInBlocks;
    uint256 public immutable phase3DurationInBlocks;
    uint256 public immutable minElapsedBlocksBeforePhaseStart;
    uint256 public phase1StartBlock;
    uint256 public phase2StartBlock;
    uint256 public phase3StartBlock;
    

    // YYY_CLGN
    mapping (IERC20 => bool) public supportedToken;

    event Deposit(address indexed user, uint256 indexed pid, uint256 amount);
    event Withdraw(address indexed user, uint256 indexed pid, uint256 amount);
    event EmergencyWithdraw(address indexed user, uint256 indexed pid, uint256 amount);
    event Schedule(uint256 _colognePerBlock,
        uint256 _phase1DurationInBlocks,
        uint256 _phase2DurationInBlocks,
        uint256 _phase3DurationInBlocks,
        uint256 _minElapsedBlocksBeforePhaseStart,
        uint256 _phase1startBlock,
        uint256 _phase2startBlock,
        uint256 _phase3startBlock);

    constructor(
        CologneToken _cologne,
        uint256 _colognePerBlock, // 10e20wei = 100 cologne per block
        uint256 _phase1DurationInBlocks,
        uint256 _phase2DurationInBlocks,
        uint256 _phase3DurationInBlocks,
        uint256 _minElapsedBlocksBeforePhaseStart,
        uint256 _phase1startBlock,
        uint256 _phase2startBlock,
        uint256 _phase3startBlock
    ) public
      validPhases {
        cologne = _cologne;
        require(_phase1DurationInBlocks > 0, "invlid phase1 duration");
        require(_phase2DurationInBlocks > 0, "invlid phase2 duration");
        require(_phase3DurationInBlocks > 0, "invlid phase3 duration");
        colognePerBlock = _colognePerBlock; // 10e20wei = 100 cologne per block
        phase1DurationInBlocks = _phase1DurationInBlocks;
        phase2DurationInBlocks = _phase2DurationInBlocks;
        phase3DurationInBlocks = _phase3DurationInBlocks;
        phase1StartBlock = _phase1startBlock;
        phase2StartBlock = _phase2startBlock;
        phase3StartBlock = _phase3startBlock;
        minElapsedBlocksBeforePhaseStart = _minElapsedBlocksBeforePhaseStart;
        require(block.number + _minElapsedBlocksBeforePhaseStart < phase1StartBlock, "not enough notice given");
        require(phase1StartBlock + _phase1DurationInBlocks <= phase2StartBlock, "phases 1 & 2 would overlap");
        require(phase2StartBlock + _phase2DurationInBlocks <= phase3StartBlock, "phases 2 & 3 would overlap");

        emit Schedule(_colognePerBlock,
                        _phase1DurationInBlocks,
                        _phase2DurationInBlocks,
                        _phase3DurationInBlocks,
                        _minElapsedBlocksBeforePhaseStart,
                        _phase1startBlock,
                        _phase2startBlock,
                        _phase3startBlock);
    }

    modifier validPhases {
        _;

    }

    function poolLength() external view returns (uint256) {
        return poolInfo.length;
    }

    // Change the start block for phase 1, 2 or 3 of liquidity mining, as long as that phase hasn't started already
    function setStartBlock(uint256 _phase, uint256 _block) public onlyOwner validPhases {
        require(block.number + minElapsedBlocksBeforePhaseStart < _block, "setStartBlock: not enough notice given");

        if (_phase == 1 && block.number < phase1StartBlock) {
            phase1StartBlock = _block;
        } else if (_phase == 2 && block.number < phase2StartBlock) {
            phase2StartBlock = _block;
        } else if (_phase == 3 && block.number < phase3StartBlock) {
            phase3StartBlock = _block;
        } else {
            require(false, "setStartBlock: invalid phase, or phase already started");
        }

        require(phase1StartBlock + phase1DurationInBlocks <= phase2StartBlock, "phases 1 & 2 would overlap");
        require(phase2StartBlock + phase2DurationInBlocks <= phase3StartBlock, "phases 2 & 3 would overlap");

        emit Schedule(colognePerBlock,
                phase1DurationInBlocks,
                phase2DurationInBlocks,
                phase3DurationInBlocks,
                minElapsedBlocksBeforePhaseStart,
                phase1StartBlock,
                phase2StartBlock,
                phase3StartBlock);
    }


    // Add a new lp to the pool and update total allocation points accordingly. Can only be called by the owner.
    function add(uint256 _allocPoint, IERC20 _lpToken, bool _withUpdate) public onlyOwner {

        // Each LP token can only be added once
        require(!supportedToken[_lpToken], "add: duplicate token");
        supportedToken[_lpToken] = true;

        // Update rewards for other pools (best to do this if rewards are already active)
        if (_withUpdate) {
            massUpdatePools();
        }


        uint256 lastRewardBlock = block.number;
        totalAllocPoint = totalAllocPoint.add(_allocPoint);
        poolInfo.push(PoolInfo({
            lpToken: _lpToken,
            allocPoint: _allocPoint,
            lastRewardBlock: lastRewardBlock,
            accColognePerShareTimes1e12: 0
        }));
    }

    // Update the given pool's CLGN allocation point, and the total allocaiton points. Can only be called by the owner.
    function set(uint256 _pid, uint256 _allocPoint, bool _withUpdate) public onlyOwner {
        if (_withUpdate) {
            massUpdatePools();
        }
        totalAllocPoint = totalAllocPoint.sub(poolInfo[_pid].allocPoint).add(_allocPoint);
        poolInfo[_pid].allocPoint = _allocPoint;
    }

    function getMultiplierPhase1(uint256 _from, uint256 _to) public view returns (uint256) {
        uint256 effectiveFrom = Math.max(_from, phase1StartBlock);
        uint256 effectiveTo = Math.min(_to, phase1StartBlock + phase1DurationInBlocks);

        if (effectiveFrom < effectiveTo) {
            return effectiveTo - effectiveFrom;
        } else {    
            return 0;
        }
    }

    function getMultiplierPhase2(uint256 _from, uint256 _to) public view returns (uint256) {
        uint256 effectiveFrom = Math.max(_from, phase2StartBlock);
        uint256 effectiveTo = Math.min(_to, phase2StartBlock + phase2DurationInBlocks);

        if (effectiveFrom < effectiveTo) {
            return effectiveTo - effectiveFrom;
        } else {    
            return 0;
        }
    }

    function getMultiplierPhase3(uint256 _from, uint256 _to) public view returns (uint256) {
        uint256 effectiveFrom = Math.max(_from, phase3StartBlock);
        uint256 effectiveTo = Math.min(_to, phase3StartBlock + phase3DurationInBlocks);

        if (effectiveFrom < effectiveTo) {
            return effectiveTo - effectiveFrom;
        } else {    
            return 0;
        }
    }

    // Return reward multiplier over the given _from to _to block.
    // This is just the number of blocks where rewards were active, unless a bonus was in effect for some or all of the block range.
    function getMultiplier(uint256 _from, uint256 _to) public view returns (uint256 multiplier) {
        multiplier = getMultiplierPhase1(_from, _to) + getMultiplierPhase2(_from, _to) + getMultiplierPhase3(_from, _to);

        return multiplier;
    }

    // View function to see pending CLGNs on frontend.
    function pendingCologne(uint256 _pid, address _user) external view returns (uint256) {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][_user];
        uint256 accColognePerShareTimes1e12 = pool.accColognePerShareTimes1e12;
        uint256 lpSupply = pool.lpToken.balanceOf(address(this));
        if (block.number > pool.lastRewardBlock && lpSupply != 0) {
            uint256 multiplier = getMultiplier(pool.lastRewardBlock, block.number);
            uint256 cologneReward = multiplier.mul(colognePerBlock).mul(pool.allocPoint).div(totalAllocPoint);
            accColognePerShareTimes1e12 = accColognePerShareTimes1e12.add(cologneReward.mul(1e12).div(lpSupply));
        }
        return user.amount.mul(accColognePerShareTimes1e12).div(1e12).sub(user.rewardDebt);
    }

    // Update reward variables for all pools. Be careful of gas spending!
    function massUpdatePools() public {
        uint256 length = poolInfo.length;
        for (uint256 pid = 0; pid < length; ++pid) {
            updatePool(pid);
        }
    }

    // Update reward variables of the given pool to be up-to-date.
    function updatePool(uint256 _pid) public {
        PoolInfo storage pool = poolInfo[_pid];
        if (block.number <= pool.lastRewardBlock) {
            return;
        }
        uint256 lpSupply = pool.lpToken.balanceOf(address(this));
        if (lpSupply == 0) {
            pool.lastRewardBlock = block.number;
            return;
        }
        // multiplier = count of blocks since last reward calc (perhaps scaled up for bonuses)
        uint256 multiplier = getMultiplier(pool.lastRewardBlock, block.number);

        // cologneReward = (scaled block count) * (rewards per block) * (this pool's % share of all block rewards)
        uint256 cologneReward = multiplier.mul(colognePerBlock).mul(pool.allocPoint).div(totalAllocPoint);

        // mint 100% of cologneReward to MasterPerfumer
        cologne.mint(address(this), cologneReward);

        // Update the reward that each LP token in this pool is due (same for each LP token since last reward calc)
        pool.accColognePerShareTimes1e12 = pool.accColognePerShareTimes1e12.add(cologneReward.mul(1e12).div(lpSupply));
        pool.lastRewardBlock = block.number;
    }

    // Deposit LP tokens to MasterPerfumer for CLGN allocation.
    function deposit(uint256 _pid, uint256 _amount) public {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        updatePool(_pid);
        if (user.amount > 0) {
            uint256 pending = user.amount.mul(pool.accColognePerShareTimes1e12).div(1e12).sub(user.rewardDebt);
            if(pending > 0) {
                safeCologneTransfer(msg.sender, pending);
            }
        }
        if(_amount > 0) {
            pool.lpToken.safeTransferFrom(address(msg.sender), address(this), _amount);
            user.amount = user.amount.add(_amount);
        }
        user.rewardDebt = user.amount.mul(pool.accColognePerShareTimes1e12).div(1e12);
        emit Deposit(msg.sender, _pid, _amount);
    }

    // Withdraw LP tokens from MasterPerfumer.
    function withdraw(uint256 _pid, uint256 _amount) public {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        require(user.amount >= _amount, "withdraw: not good");
        updatePool(_pid);
        uint256 pending = user.amount.mul(pool.accColognePerShareTimes1e12).div(1e12).sub(user.rewardDebt);
        if(pending > 0) {
            safeCologneTransfer(msg.sender, pending);
        }
        if(_amount > 0) {
            user.amount = user.amount.sub(_amount);
            pool.lpToken.safeTransfer(address(msg.sender), _amount);
        }
        user.rewardDebt = user.amount.mul(pool.accColognePerShareTimes1e12).div(1e12);
        emit Withdraw(msg.sender, _pid, _amount);
    }

    // Withdraw without caring about rewards. EMERGENCY ONLY.
    function emergencyWithdraw(uint256 _pid) public {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        pool.lpToken.safeTransfer(address(msg.sender), user.amount);
        emit EmergencyWithdraw(msg.sender, _pid, user.amount);
        user.amount = 0;
        user.rewardDebt = 0;
    }

    // Safe cologne transfer function, just in case rounding errors cause us not to have enough CLGNs.
    function safeCologneTransfer(address _to, uint256 _amount) internal {
        uint256 cologneBal = cologne.balanceOf(address(this));
        if (_amount > cologneBal) {
            cologne.transfer(_to, cologneBal);
        } else {
            cologne.transfer(_to, _amount);
        }
    }
}
