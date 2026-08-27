// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC165 {
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}

interface IERC721 {
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);

    function balanceOf(address owner) external view returns (uint256 balance);
    function ownerOf(uint256 tokenId) external view returns (address owner);

    function safeTransferFrom(address from, address to, uint256 tokenId, bytes calldata data) external;
    function safeTransferFrom(address from, address to, uint256 tokenId) external;
    function transferFrom(address from, address to, uint256 tokenId) external;
    function approve(address to, uint256 tokenId) external;
    function setApprovalForAll(address operator, bool approved) external;
    function getApproved(uint256 tokenId) external view returns (address operator);
    function isApprovedForAll(address owner, address operator) external view returns (bool);
}

interface IERC721Receiver {
    function onERC721Received(address operator, address from, uint256 tokenId, bytes calldata data) external returns (bytes4);
}

contract ERC721 is IERC721, IERC165 {
    string public name;
    string public symbol;

    mapping(uint256 => address) internal _owners;
    mapping(address => uint256) internal _balances;
    mapping(uint256 => address) internal _tokenApprovals;
    mapping(address => mapping(address => bool)) internal _operatorApprovals;

    error NotOwner();
    error NotApproved();
    error InvalidToken();
    error NotSender();
    error MintToZero();
    error MintOverflow();
    error TransferToZero();
    error UnsafeReceiver();

    bytes4 private constant _ERC721_RECEIVED = 0x150b7a02;
    bytes4 private constant _INTERFACE_ID_ERC721 = 0x80ac58cd;
    bytes4 private constant _INTERFACE_ID_ERC165 = 0x01ffc9a7;

    constructor(string memory name_, string memory symbol_) {
        name = name_;
        symbol = symbol_;
    }

    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
        return interfaceId == _INTERFACE_ID_ERC165
            || interfaceId == _INTERFACE_ID_ERC721;
    }

    function balanceOf(address owner) public view override returns (uint256) {
        if (owner == address(0)) revert NotOwner();
        return _balances[owner];
    }

    function ownerOf(uint256 tokenId) public view override returns (address) {
        address owner = _owners[tokenId];
        if (owner == address(0)) revert InvalidToken();
        return owner;
    }

    function isApprovedForAll(address owner, address operator) public view override returns (bool) {
        return _operatorApprovals[owner][operator];
    }

    function getApproved(uint256 tokenId) public view override returns (address) {
        _requireOwned(tokenId);
        return _tokenApprovals[tokenId];
    }

    function approve(address to, uint256 tokenId) public override {
        address owner = _owners[tokenId];
        if (owner == address(0)) revert InvalidToken();
        if (_msgSender() != owner && !_operatorApprovals[owner][_msgSender()]) revert NotApproved();
        _tokenApprovals[tokenId] = to;
        emit Approval(owner, to, tokenId);
    }

    function setApprovalForAll(address operator, bool approved) public override {
        _operatorApprovals[_msgSender()][operator] = approved;
        emit ApprovalForAll(_msgSender(), operator, approved);
    }

    function transferFrom(address from, address to, uint256 tokenId) public override {
        if (to == address(0)) revert TransferToZero();
        _requireAuthorized(from, tokenId);
        _transfer(from, to, tokenId);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId) public override {
        safeTransferFrom(from, to, tokenId, "");
    }

    function safeTransferFrom(address from, address to, uint256 tokenId, bytes memory data) public override {
        if (to == address(0)) revert TransferToZero();
        _requireAuthorized(from, tokenId);
        _transfer(from, to, tokenId);
        if (to.code.length > 0 && ERC721Receiver(to).onERC721Received(_msgSender(), from, tokenId, data) != _ERC721_RECEIVED) {
            revert UnsafeReceiver();
        }
    }

    function _msgSender() internal view returns (address) {
        return msg.sender;
    }

    function _requireOwned(uint256 tokenId) private view returns (address owner) {
        owner = _owners[tokenId];
        if (owner == address(0)) revert InvalidToken();
    }

    function _requireAuthorized(address from, uint256 tokenId) private view {
        address owner = _requireOwned(tokenId);
        if (from != owner) revert NotSender();
        if (_msgSender() != owner && !_operatorApprovals[owner][_msgSender()] && _tokenApprovals[tokenId] != _msgSender()) {
            revert NotApproved();
        }
    }

    function _transfer(address from, address to, uint256 tokenId) internal {
        _owners[tokenId] = to;
        unchecked {
            _balances[to] += 1;
            _balances[from] -= 1;
        }
        delete _tokenApprovals[tokenId];
        emit Transfer(from, to, tokenId);
    }

    function _mint(address to, uint256 tokenId) internal {
        if (to == address(0)) revert MintToZero();
        if (_owners[tokenId] != address(0)) revert MintOverflow();
        _owners[tokenId] = to;
        uint256 minted = _balances[to];
        unchecked {
            _balances[to] = minted + 1;
        }
        emit Transfer(address(0), to, tokenId);
    }
}

interface ERC721Receiver is IERC721Receiver {}

contract MonkeyNFT is ERC721 {
    address public owner;
    address public mintAuthority;
    uint256 public immutable maxSupply;
    uint256 public totalMinted;
    string public metadataUri;

    event MintAuthorityUpdated(address indexed authority);
    event MetadataUriUpdated(string uri);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    modifier onlyAuthority() {
        require(msg.sender == mintAuthority, "not authority");
        _;
    }

    constructor(uint256 maxSupply_) ERC721("Monkey NFT", "MKY-NFT") {
        require(maxSupply_ > 0, "zero supply");
        maxSupply = maxSupply_;
        owner = msg.sender;
    }

    function mintTo(address to) external onlyAuthority returns (uint256 tokenId) {
        require(totalMinted < maxSupply, "sold out");
        tokenId = totalMinted;
        unchecked { totalMinted += 1; }
        _mint(to, tokenId);
    }

    function tokenURI(uint256) public view returns (string memory) {
        return metadataUri;
    }

    function totalSupply() external view returns (uint256) {
        return totalMinted;
    }

    function setMintAuthority(address authority) external onlyOwner {
        require(authority != address(0), "zero authority");
        mintAuthority = authority;
        emit MintAuthorityUpdated(authority);
    }

    function setMetadataUri(string calldata uri) external onlyOwner {
        metadataUri = uri;
        emit MetadataUriUpdated(uri);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "zero owner");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
}