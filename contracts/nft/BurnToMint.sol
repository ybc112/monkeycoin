// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function decimals() external view returns (uint8);
}

interface IMonkeyNFT {
    function mintTo(address to) external returns (uint256 tokenId);
    function totalSupply() external view returns (uint256);
    function maxSupply() external view returns (uint256);
}

contract BurnToMint {
    address public owner;
    IERC20 public immutable mky;
    IMonkeyNFT public immutable nft;
    address public constant RECEIVER = 0x681E3ffCD487BE8C4BD39d1831fdE4d2dD0Df79A; // 收款地址（生态白名单基金）
    uint256 public immutable cost;
    uint256 public totalBurned;
    bool public paused;
    /// @dev 每地址限购 1 张
    mapping(address => bool) public claimed;

    event Redeemed(address indexed redeemer, uint256 tokenId, uint256 amount);
    event Paused(bool paused);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    constructor(address mky_, address nft_, uint256 cost_) {
        require(mky_ != address(0), "zero mky");
        require(nft_ != address(0), "zero nft");
        require(cost_ > 0, "zero cost");
        owner = msg.sender;
        mky = IERC20(mky_);
        nft = IMonkeyNFT(nft_);
        cost = cost_;
    }

    function redeem() external returns (uint256 tokenId) {
        require(!paused, "paused");
        require(!claimed[msg.sender], "already claimed");
        require(nft.totalSupply() < nft.maxSupply(), "sold out");
        bool ok = mky.transferFrom(msg.sender, RECEIVER, cost);
        require(ok, "mky transfer failed");
        claimed[msg.sender] = true;
        totalBurned += cost;
        tokenId = nft.mintTo(msg.sender);
        emit Redeemed(msg.sender, tokenId, cost);
    }

    function setPaused(bool paused_) external onlyOwner {
        paused = paused_;
        emit Paused(paused_);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "zero owner");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
}