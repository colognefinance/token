pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20Capped.sol";
import "@openzeppelin/contracts/access/Ownable.sol";


// CologneToken with minting by owner only
contract CologneToken is ERC20Capped, Ownable {

    constructor (uint256 _hard_cap) ERC20("CologneToken", "CLGN") ERC20Capped(_hard_cap) public
    {
    }

    /// @notice Creates `_amount` token to `_to`. Must only be called by the owner (MasterPerfumer).
    function mint(address _to, uint256 _amount) public onlyOwner {
        _mint(_to, _amount);
    }
}