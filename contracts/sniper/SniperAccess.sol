// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title 狙击激活合约
/// @notice 用户销毁 50,000 $MKY 后获得狙击使用资格（allowlist[address]=true）
interface IERC20 {
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
}

contract SniperAccess {
    address public immutable owner;
    IERC20 public immutable mky;
    address public constant BURN = 0x000000000000000000000000000000000000dEaD;
    uint256 public immutable activateCost;
    /** @dev allowlist[account] = 是否已销毁激活 */
    mapping(address => bool) public allowlist;

    event Registered(address indexed account, uint256 amount);
    event Activated(address indexed account, uint256 activatedAt);

    constructor(address mky_, uint256 activateCost_) {
        require(mky_ != address(0), "zero mky");
        require(activateCost_ > 0, "zero cost");
        owner = msg.sender;
        mky = IERC20(mky_);
        activateCost = activateCost_;
    }

    function isRegistered(address account) external view returns (bool) {
        return allowlist[account];
    }

    /// @notice 销毁 activateCost 枚 $MKY（转入黑洞）并标记本钱包已激活
    function register() external returns (bool) {
        require(!allowlist[msg.sender], "already registered");
        bool ok = mky.transferFrom(msg.sender, BURN, activateCost);
        require(ok, "mky transfer failed");
        allowlist[msg.sender] = true;
        emit Registered(msg.sender, activateCost);
        emit Activated(msg.sender, block.timestamp);
        return true;
    }
}