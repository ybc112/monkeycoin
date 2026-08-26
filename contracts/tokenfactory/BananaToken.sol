// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

abstract contract Context {
    function _msgSender() internal view virtual returns (address) {
        return msg.sender;
    }

    function _msgData() internal view virtual returns (bytes calldata) {
        return msg.data;
    }
}

abstract contract Ownable is Context {
    address private _owner;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    constructor() {
        _transferOwnership(_msgSender());
    }

    function owner() public view virtual returns (address) {
        return _owner;
    }

    modifier onlyOwner() {
        require(owner() == _msgSender(), "Ownable: caller is not the owner");
        _;
    }

    function renounceOwnership() public virtual onlyOwner {
        _transferOwnership(address(0));
    }

    function transferOwnership(address newOwner) public virtual onlyOwner {
        require(newOwner != address(0), "Ownable: new owner is the zero address");
        _transferOwnership(newOwner);
    }

    function _transferOwnership(address newOwner) internal virtual {
        address oldOwner = _owner;
        _owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }
}

abstract contract Initializable {
    /**
     * @dev Indicates that the contract has been initialized.
     */
    bool private _initialized;

    /**
     * @dev Indicates that the contract is in the process of being initialized.
     */
    bool private _initializing;

    /**
     * @dev Modifier to protect an initializer function from being invoked twice.
     */
    modifier initializer() {
        require(_initializing || !_initialized, "Initializable: contract is already initialized");

        bool isTopLevelCall = !_initializing;
        if (isTopLevelCall) {
            _initializing = true;
            _initialized = true;
        }

        _;

        if (isTopLevelCall) {
            _initializing = false;
        }
    }
}

abstract contract ContextUpgradeable is Initializable {
    function __Context_init() internal initializer {
        __Context_init_unchained();
    }

    function __Context_init_unchained() internal initializer {
    }
    function _msgSender() internal view virtual returns (address) {
        return msg.sender;
    }

    function _msgData() internal view virtual returns (bytes calldata) {
        return msg.data;
    }
    uint256[50] private __gap;
}

abstract contract OwnableUpgradeable is Initializable, ContextUpgradeable {
    address private _owner;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    /**
     * @dev Initializes the contract setting the deployer as the initial owner.
     */
    function __Ownable_init() internal initializer {
        __Context_init_unchained();
        __Ownable_init_unchained();
    }

    function __Ownable_init_unchained() internal initializer {
        _setOwner(_msgSender());
    }

    /**
     * @dev Returns the address of the current owner.
     */
    function owner() public view virtual returns (address) {
        return _owner;
    }

    /**
     * @dev Throws if called by any account other than the owner.
     */
    modifier onlyOwner() {
        require(owner() == _msgSender(), "Ownable: caller is not the owner");
        _;
    }

    /**
     * @dev Leaves the contract without owner. It will not be possible to call
     * `onlyOwner` functions anymore. Can only be called by the current owner.
     *
     * NOTE: Renouncing ownership will leave the contract without an owner,
     * thereby removing any functionality that is only available to the owner.
     */
    function renounceOwnership() public virtual onlyOwner {
        _setOwner(address(0));
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Can only be called by the current owner.
     */
    function transferOwnership(address newOwner) public virtual onlyOwner {
        require(newOwner != address(0), "Ownable: new owner is the zero address");
        _setOwner(newOwner);
    }

    function _setOwner(address newOwner) private {
        address oldOwner = _owner;
        _owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }
    uint256[49] private __gap;
}

interface IERC20 {
    function totalSupply() external view returns (uint256);

    function balanceOf(address account) external view returns (uint256);

    function transfer(address recipient, uint256 amount) external returns (bool);

    function allowance(address owner, address spender) external view returns (uint256);

    function approve(address spender, uint256 amount) external returns (bool);

    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) external returns (bool);

    event Transfer(address indexed from, address indexed to, uint256 value);

    event Approval(address indexed owner, address indexed spender, uint256 value);
}

interface IERC20Metadata is IERC20 {

    function name() external view returns (string memory);

    function symbol() external view returns (string memory);

    function decimals() external view returns (uint8);
}

library SafeMath {
    function add(uint256 a, uint256 b) internal pure returns (uint256) {
        uint256 c = a + b;
        require(c >= a, "SafeMath: addition overflow");

        return c;
    }

    function sub(uint256 a, uint256 b) internal pure returns (uint256) {
        return sub(a, b, "SafeMath: subtraction overflow");
    }

    function sub(uint256 a, uint256 b, string memory errorMessage) internal pure returns (uint256) {
        require(b <= a, errorMessage);
        uint256 c = a - b;

        return c;
    }

    function mul(uint256 a, uint256 b) internal pure returns (uint256) {
        // Gas optimization: this is cheaper than requiring 'a' not being zero, but the
        // benefit is lost if 'b' is also tested.
        // See: https://github.com/OpenZeppelin/openzeppelin-contracts/pull/522
        if (a == 0) {
            return 0;
        }

        uint256 c = a * b;
        require(c / a == b, "SafeMath: multiplication overflow");

        return c;
    }

    function div(uint256 a, uint256 b) internal pure returns (uint256) {
        return div(a, b, "SafeMath: division by zero");
    }

    function div(uint256 a, uint256 b, string memory errorMessage) internal pure returns (uint256) {
        require(b > 0, errorMessage);
        uint256 c = a / b;
        // assert(a == b * c + a % b); // There is no case in which this doesn't hold

        return c;
    }

    function mod(uint256 a, uint256 b) internal pure returns (uint256) {
        return mod(a, b, "SafeMath: modulo by zero");
    }

    function mod(uint256 a, uint256 b, string memory errorMessage) internal pure returns (uint256) {
        require(b != 0, errorMessage);
        return a % b;
    }
}

library SafeMathInt {
    int256 private constant MIN_INT256 = int256(1) << 255;
    int256 private constant MAX_INT256 = ~(int256(1) << 255);

    /**
     * @dev Multiplies two int256 variables and fails on overflow.
     */
    function mul(int256 a, int256 b) internal pure returns (int256) {
        int256 c = a * b;

        // Detect overflow when multiplying MIN_INT256 with -1
        require(c != MIN_INT256 || (a & MIN_INT256) != (b & MIN_INT256));
        require((b == 0) || (c / b == a));
        return c;
    }

    /**
     * @dev Division of two int256 variables and fails on overflow.
     */
    function div(int256 a, int256 b) internal pure returns (int256) {
        // Prevent overflow when dividing MIN_INT256 by -1
        require(b != -1 || a != MIN_INT256);

        // Solidity already throws when dividing by 0.
        return a / b;
    }

    /**
     * @dev Subtracts two int256 variables and fails on overflow.
     */
    function sub(int256 a, int256 b) internal pure returns (int256) {
        int256 c = a - b;
        require((b >= 0 && c <= a) || (b < 0 && c > a));
        return c;
    }

    /**
     * @dev Adds two int256 variables and fails on overflow.
     */
    function add(int256 a, int256 b) internal pure returns (int256) {
        int256 c = a + b;
        require((b >= 0 && c >= a) || (b < 0 && c < a));
        return c;
    }

    /**
     * @dev Converts to absolute value, and fails on overflow.
     */
    function abs(int256 a) internal pure returns (int256) {
        require(a != MIN_INT256);
        return a < 0 ? -a : a;
    }


    function toUint256Safe(int256 a) internal pure returns (uint256) {
        require(a >= 0);
        return uint256(a);
    }
}

library SafeMathUint {
  function toInt256Safe(uint256 a) internal pure returns (int256) {
    int256 b = int256(a);
    require(b >= 0);
    return b;
  }
}

library Clones {
    /**
     * @dev Deploys and returns the address of a clone that mimics the behaviour of `implementation`.
     *
     * This function uses the create opcode, which should never revert.
     */
    function clone(address implementation) internal returns (address instance) {
        assembly {
            let ptr := mload(0x40)
            mstore(ptr, 0x3d602d80600a3d3981f3363d3d373d3d3d363d73000000000000000000000000)
            mstore(add(ptr, 0x14), shl(0x60, implementation))
            mstore(add(ptr, 0x28), 0x5af43d82803e903d91602b57fd5bf30000000000000000000000000000000000)
            instance := create(0, ptr, 0x37)
        }
        require(instance != address(0), "ERC1167: create failed");
    }

    /**
     * @dev Deploys and returns the address of a clone that mimics the behaviour of `implementation`.
     *
     * This function uses the create2 opcode and a `salt` to deterministically deploy
     * the clone. Using the same `implementation` and `salt` multiple time will revert, since
     * the clones cannot be deployed twice at the same address.
     */
    function cloneDeterministic(address implementation, bytes32 salt) internal returns (address instance) {
        assembly {
            let ptr := mload(0x40)
            mstore(ptr, 0x3d602d80600a3d3981f3363d3d373d3d3d363d73000000000000000000000000)
            mstore(add(ptr, 0x14), shl(0x60, implementation))
            mstore(add(ptr, 0x28), 0x5af43d82803e903d91602b57fd5bf30000000000000000000000000000000000)
            instance := create2(0, ptr, 0x37, salt)
        }
        require(instance != address(0), "ERC1167: create2 failed");
    }

    /**
     * @dev Computes the address of a clone deployed using {Clones-cloneDeterministic}.
     */
    function predictDeterministicAddress(
        address implementation,
        bytes32 salt,
        address deployer
    ) internal pure returns (address predicted) {
        assembly {
            let ptr := mload(0x40)
            mstore(ptr, 0x3d602d80600a3d3981f3363d3d373d3d3d363d73000000000000000000000000)
            mstore(add(ptr, 0x14), shl(0x60, implementation))
            mstore(add(ptr, 0x28), 0x5af43d82803e903d91602b57fd5bf3ff00000000000000000000000000000000)
            mstore(add(ptr, 0x38), shl(0x60, deployer))
            mstore(add(ptr, 0x4c), salt)
            mstore(add(ptr, 0x6c), keccak256(ptr, 0x37))
            predicted := keccak256(add(ptr, 0x37), 0x55)
        }
    }

    /**
     * @dev Computes the address of a clone deployed using {Clones-cloneDeterministic}.
     */
    function predictDeterministicAddress(address implementation, bytes32 salt)
        internal
        view
        returns (address predicted)
    {
        return predictDeterministicAddress(implementation, salt, address(this));
    }
}

contract ERC20 is Context, IERC20, IERC20Metadata {
    using SafeMath for uint256;

    mapping(address => uint256) private _balances;

    mapping(address => mapping(address => uint256)) private _allowances;

    uint256 private _totalSupply;

    string  _name;
    string  _symbol;

    constructor() {}

    function name() public view virtual override returns (string memory) {
        return _name;
    }

    function symbol() public view virtual override returns (string memory) {
        return _symbol;
    }

    function decimals() public view virtual override returns (uint8) {
        return 18;
    }


    function totalSupply() public view virtual override returns (uint256) {
        return _totalSupply;
    }

    function balanceOf(address account) public view virtual override returns (uint256) {
        return _balances[account];
    }
    function transfer(address recipient, uint256 amount) public virtual override returns (bool) {
        _transfer(_msgSender(), recipient, amount);
        return true;
    }

    function allowance(address owner, address spender) public view virtual override returns (uint256) {
        return _allowances[owner][spender];
    }
    function approve(address spender, uint256 amount) public virtual override returns (bool) {
        _approve(_msgSender(), spender, amount);
        return true;
    }

    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) public virtual override returns (bool) {
        _transfer(sender, recipient, amount);
        _approve(sender, _msgSender(), _allowances[sender][_msgSender()].sub(amount, "ERC20: transfer amount exceeds allowance"));
        return true;
    }

    function increaseAllowance(address spender, uint256 addedValue) public virtual returns (bool) {
        _approve(_msgSender(), spender, _allowances[_msgSender()][spender].add(addedValue));
        return true;
    }

    function decreaseAllowance(address spender, uint256 subtractedValue) public virtual returns (bool) {
        _approve(_msgSender(), spender, _allowances[_msgSender()][spender].sub(subtractedValue, "ERC20: decreased allowance below zero"));
        return true;
    }

    function _transfer(
        address sender,
        address recipient,
        uint256 amount
    ) internal virtual {
        require(sender != address(0), "ERC20: transfer from the zero address");
        require(recipient != address(0), "ERC20: transfer to the zero address");

        _beforeTokenTransfer(sender, recipient, amount);

        _balances[sender] = _balances[sender].sub(amount, "ERC20: transfer amount exceeds balance");
        _balances[recipient] = _balances[recipient].add(amount);
        emit Transfer(sender, recipient, amount);
    }

    function _mint(address account, uint256 amount) internal virtual {
        require(account != address(0), "ERC20: mint to the zero address");

        _beforeTokenTransfer(address(0), account, amount);

        _totalSupply = _totalSupply.add(amount);
        _balances[account] = _balances[account].add(amount);
        emit Transfer(address(0), account, amount);
    }

    function _burn(address account, uint256 amount) internal virtual {
        require(account != address(0), "ERC20: burn from the zero address");

        _beforeTokenTransfer(account, address(0), amount);

        _balances[account] = _balances[account].sub(amount, "ERC20: burn amount exceeds balance");
        _totalSupply = _totalSupply.sub(amount);
        emit Transfer(account, address(0), amount);
    }

    function _approve(
        address owner,
        address spender,
        uint256 amount
    ) internal virtual {
        require(owner != address(0), "ERC20: approve from the zero address");
        require(spender != address(0), "ERC20: approve to the zero address");

        _allowances[owner][spender] = amount;
        emit Approval(owner, spender, amount);
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal virtual {}
}

interface IUniswapV2Router01 {
    function factory() external pure returns (address);
    function WETH() external pure returns (address);

    function addLiquidity(
        address tokenA,
        address tokenB,
        uint amountADesired,
        uint amountBDesired,
        uint amountAMin,
        uint amountBMin,
        address to,
        uint deadline
    ) external returns (uint amountA, uint amountB, uint liquidity);
    function addLiquidityETH(
        address token,
        uint amountTokenDesired,
        uint amountTokenMin,
        uint amountETHMin,
        address to,
        uint deadline
    ) external payable returns (uint amountToken, uint amountETH, uint liquidity);
    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint liquidity,
        uint amountAMin,
        uint amountBMin,
        address to,
        uint deadline
    ) external returns (uint amountA, uint amountB);
    function removeLiquidityETH(
        address token,
        uint liquidity,
        uint amountTokenMin,
        uint amountETHMin,
        address to,
        uint deadline
    ) external returns (uint amountToken, uint amountETH);
    function removeLiquidityWithPermit(
        address tokenA,
        address tokenB,
        uint liquidity,
        uint amountAMin,
        uint amountBMin,
        address to,
        uint deadline,
        bool approveMax, uint8 v, bytes32 r, bytes32 s
    ) external returns (uint amountA, uint amountB);
    function removeLiquidityETHWithPermit(
        address token,
        uint liquidity,
        uint amountTokenMin,
        uint amountETHMin,
        address to,
        uint deadline,
        bool approveMax, uint8 v, bytes32 r, bytes32 s
    ) external returns (uint amountToken, uint amountETH);
    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external returns (uint[] memory amounts);
    function swapTokensForExactTokens(
        uint amountOut,
        uint amountInMax,
        address[] calldata path,
        address to,
        uint deadline
    ) external returns (uint[] memory amounts);
    function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline)
        external
        payable
        returns (uint[] memory amounts);
    function swapTokensForExactETH(uint amountOut, uint amountInMax, address[] calldata path, address to, uint deadline)
        external
        returns (uint[] memory amounts);
    function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline)
        external
        returns (uint[] memory amounts);
    function swapETHForExactTokens(uint amountOut, address[] calldata path, address to, uint deadline)
        external
        payable
        returns (uint[] memory amounts);

    function quote(uint amountA, uint reserveA, uint reserveB) external pure returns (uint amountB);
    function getAmountOut(uint amountIn, uint reserveIn, uint reserveOut) external pure returns (uint amountOut);
    function getAmountIn(uint amountOut, uint reserveIn, uint reserveOut) external pure returns (uint amountIn);
    function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts);
    function getAmountsIn(uint amountOut, address[] calldata path) external view returns (uint[] memory amounts);
}

interface IUniswapV2Router02 is IUniswapV2Router01 {
    function removeLiquidityETHSupportingFeeOnTransferTokens(
        address token,
        uint liquidity,
        uint amountTokenMin,
        uint amountETHMin,
        address to,
        uint deadline
    ) external returns (uint amountETH);
    function removeLiquidityETHWithPermitSupportingFeeOnTransferTokens(
        address token,
        uint liquidity,
        uint amountTokenMin,
        uint amountETHMin,
        address to,
        uint deadline,
        bool approveMax, uint8 v, bytes32 r, bytes32 s
    ) external returns (uint amountETH);

    function swapExactTokensForTokensSupportingFeeOnTransferTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external;
    function swapExactETHForTokensSupportingFeeOnTransferTokens(
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external payable;
    function swapExactTokensForETHSupportingFeeOnTransferTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external;
}

interface IUniswapV2Factory {
    event PairCreated(address indexed token0, address indexed token1, address pair, uint);

    function feeTo() external view returns (address);
    function feeToSetter() external view returns (address);

    function getPair(address tokenA, address tokenB) external view returns (address pair);
    function allPairs(uint) external view returns (address pair);
    function allPairsLength() external view returns (uint);

    function createPair(address tokenA, address tokenB) external returns (address pair);

    function setFeeTo(address) external;
    function setFeeToSetter(address) external;
}

interface IUniswapV2Pair {
    event Approval(address indexed owner, address indexed spender, uint value);
    event Transfer(address indexed from, address indexed to, uint value);

    function name() external pure returns (string memory);
    function symbol() external pure returns (string memory);
    function decimals() external pure returns (uint8);
    function totalSupply() external view returns (uint);
    function balanceOf(address owner) external view returns (uint);
    function allowance(address owner, address spender) external view returns (uint);

    function approve(address spender, uint value) external returns (bool);
    function transfer(address to, uint value) external returns (bool);
    function transferFrom(address from, address to, uint value) external returns (bool);

    function DOMAIN_SEPARATOR() external view returns (bytes32);
    function PERMIT_TYPEHASH() external pure returns (bytes32);
    function nonces(address owner) external view returns (uint);

    function permit(address owner, address spender, uint value, uint deadline, uint8 v, bytes32 r, bytes32 s) external;

    event Mint(address indexed sender, uint amount0, uint amount1);
    event Burn(address indexed sender, uint amount0, uint amount1, address indexed to);
    event Swap(
        address indexed sender,
        uint amount0In,
        uint amount1In,
        uint amount0Out,
        uint amount1Out,
        address indexed to
    );
    event Sync(uint112 reserve0, uint112 reserve1);

    function MINIMUM_LIQUIDITY() external pure returns (uint);
    function factory() external view returns (address);
    function token0() external view returns (address);
    function token1() external view returns (address);
    function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);
    function price0CumulativeLast() external view returns (uint);
    function price1CumulativeLast() external view returns (uint);
    function kLast() external view returns (uint);

    function mint(address to) external returns (uint liquidity);
    function burn(address to) external returns (uint amount0, uint amount1);
    function swap(uint amount0Out, uint amount1Out, address to, bytes calldata data) external;
    function skim(address to) external;
    function sync() external;

    function initialize(address, address) external;
}

library IterableMapping {
    // Iterable mapping from address to uint;
    struct Map {
        address[] keys;
        mapping(address => uint256) values;
        mapping(address => uint256) indexOf;
        mapping(address => bool) inserted;
    }

    function get(Map storage map, address key) internal view returns (uint256) {
        return map.values[key];
    }

    function getIndexOfKey(Map storage map, address key)
    internal
    view
    returns (int256)
    {
        if (!map.inserted[key]) {
            return -1;
        }
        return int256(map.indexOf[key]);
    }

    function getKeyAtIndex(Map storage map, uint256 index)
    internal
    view
    returns (address)
    {
        return map.keys[index];
    }

    function size(Map storage map) internal view returns (uint256) {
        return map.keys.length;
    }

    function set(
        Map storage map,
        address key,
        uint256 val
    ) internal {
        if (map.inserted[key]) {
            map.values[key] = val;
        } else {
            map.inserted[key] = true;
            map.values[key] = val;
            map.indexOf[key] = map.keys.length;
            map.keys.push(key);
        }
    }

    function remove(Map storage map, address key) internal {
        if (!map.inserted[key]) {
            return;
        }

        delete map.inserted[key];
        delete map.values[key];

        uint256 index = map.indexOf[key];
        uint256 lastIndex = map.keys.length - 1;
        address lastKey = map.keys[lastIndex];

        map.indexOf[lastKey] = index;
        delete map.indexOf[key];

        map.keys[index] = lastKey;
        map.keys.pop();
    }
}


interface DividendPayingTokenInterface {
    /// @notice View the amount of dividend in wei that an address can withdraw.
    /// @param _owner The address of a token holder.
    /// @return The amount of dividend in wei that `_owner` can withdraw.
    function dividendOf(address _owner) external view returns (uint256);

    /// @notice Withdraws the ether distributed to the sender.
    /// @dev SHOULD transfer `dividendOf(msg.sender)` wei to `msg.sender`, and `dividendOf(msg.sender)` SHOULD be 0 after the transfer.
    ///  MUST emit a `DividendWithdrawn` event if the amount of ether transferred is greater than 0.
    function withdrawDividend() external;

    /// @dev This event MUST emit when ether is distributed to token holders.
    /// @param from The address which sends ether to this contract.
    /// @param weiAmount The amount of distributed ether in wei.
    event DividendsDistributed(address indexed from, uint256 weiAmount);

    /// @dev This event MUST emit when an address withdraws their dividend.
    /// @param to The address which withdraws ether from this contract.
    /// @param weiAmount The amount of withdrawn ether in wei.
    event DividendWithdrawn(address indexed to, uint256 weiAmount);
}

interface DividendPayingTokenOptionalInterface {
    /// @notice View the amount of dividend in wei that an address can withdraw.
    /// @param _owner The address of a token holder.
    /// @return The amount of dividend in wei that `_owner` can withdraw.
    function withdrawableDividendOf(address _owner)
    external
    view
    returns (uint256);

    /// @notice View the amount of dividend in wei that an address has withdrawn.
    /// @param _owner The address of a token holder.
    /// @return The amount of dividend in wei that `_owner` has withdrawn.
    function withdrawnDividendOf(address _owner)
    external
    view
    returns (uint256);

    /// @notice View the amount of dividend in wei that an address has earned in total.
    /// @dev accumulativeDividendOf(_owner) = withdrawableDividendOf(_owner) + withdrawnDividendOf(_owner)
    /// @param _owner The address of a token holder.
    /// @return The amount of dividend in wei that `_owner` has earned in total.
    function accumulativeDividendOf(address _owner)
    external
    view
    returns (uint256);
}

interface IERC20Upgradeable {
    /**
     * @dev Returns the amount of tokens in existence.
     */
    function totalSupply() external view returns (uint256);

    /**
     * @dev Returns the amount of tokens owned by `account`.
     */
    function balanceOf(address account) external view returns (uint256);

    /**
     * @dev Moves `amount` tokens from the caller's account to `recipient`.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transfer(address recipient, uint256 amount) external returns (bool);

    /**
     * @dev Returns the remaining number of tokens that `spender` will be
     * allowed to spend on behalf of `owner` through {transferFrom}. This is
     * zero by default.
     *
     * This value changes when {approve} or {transferFrom} are called.
     */
    function allowance(address owner, address spender) external view returns (uint256);

    /**
     * @dev Sets `amount` as the allowance of `spender` over the caller's tokens.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * IMPORTANT: Beware that changing an allowance with this method brings the risk
     * that someone may use both the old and the new allowance by unfortunate
     * transaction ordering. One possible solution to mitigate this race
     * condition is to first reduce the spender's allowance to 0 and set the
     * desired value afterwards:
     * https://github.com/ethereum/EIPs/issues/20#issuecomment-263524729
     *
     * Emits an {Approval} event.
     */
    function approve(address spender, uint256 amount) external returns (bool);

    /**
     * @dev Moves `amount` tokens from `sender` to `recipient` using the
     * allowance mechanism. `amount` is then deducted from the caller's
     * allowance.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) external returns (bool);

    /**
     * @dev Emitted when `value` tokens are moved from one account (`from`) to
     * another (`to`).
     *
     * Note that `value` may be zero.
     */
    event Transfer(address indexed from, address indexed to, uint256 value);

    /**
     * @dev Emitted when the allowance of a `spender` for an `owner` is set by
     * a call to {approve}. `value` is the new allowance.
     */
    event Approval(address indexed owner, address indexed spender, uint256 value);
}

interface IERC20MetadataUpgradeable is IERC20Upgradeable {
    /**
     * @dev Returns the name of the token.
     */
    function name() external view returns (string memory);

    /**
     * @dev Returns the symbol of the token.
     */
    function symbol() external view returns (string memory);

    /**
     * @dev Returns the decimals places of the token.
     */
    function decimals() external view returns (uint8);
}

contract ERC20Upgradeable is Initializable, ContextUpgradeable, IERC20Upgradeable, IERC20MetadataUpgradeable {
    mapping(address => uint256) private _balances;

    mapping(address => mapping(address => uint256)) private _allowances;

    uint256 private _totalSupply;

    string private _name;
    string private _symbol;

    /**
     * @dev Sets the values for {name} and {symbol}.
     *
     * The default value of {decimals} is 18. To select a different value for
     * {decimals} you should overload it.
     *
     * All two of these values are immutable: they can only be set once during
     * construction.
     */
    function __ERC20_init(string memory name_, string memory symbol_) internal initializer {
        __Context_init_unchained();
        __ERC20_init_unchained(name_, symbol_);
    }

    function __ERC20_init_unchained(string memory name_, string memory symbol_) internal initializer {
        _name = name_;
        _symbol = symbol_;
    }

    /**
     * @dev Returns the name of the token.
     */
    function name() public view virtual override returns (string memory) {
        return _name;
    }

    /**
     * @dev Returns the symbol of the token, usually a shorter version of the
     * name.
     */
    function symbol() public view virtual override returns (string memory) {
        return _symbol;
    }

    /**
     * @dev Returns the number of decimals used to get its user representation.
     * For example, if `decimals` equals `2`, a balance of `505` tokens should
     * be displayed to a user as `5.05` (`505 / 10 ** 2`).
     *
     * Tokens usually opt for a value of 18, imitating the relationship between
     * Ether and Wei. This is the value {ERC20} uses, unless this function is
     * overridden;
     *
     * NOTE: This information is only used for _display_ purposes: it in
     * no way affects any of the arithmetic of the contract, including
     * {IERC20-balanceOf} and {IERC20-transfer}.
     */
    function decimals() public view virtual override returns (uint8) {
        return 18;
    }

    /**
     * @dev See {IERC20-totalSupply}.
     */
    function totalSupply() public view virtual override returns (uint256) {
        return _totalSupply;
    }

    /**
     * @dev See {IERC20-balanceOf}.
     */
    function balanceOf(address account) public view virtual override returns (uint256) {
        return _balances[account];
    }

    /**
     * @dev See {IERC20-transfer}.
     *
     * Requirements:
     *
     * - `recipient` cannot be the zero address.
     * - the caller must have a balance of at least `amount`.
     */
    function transfer(address recipient, uint256 amount) public virtual override returns (bool) {
        _transfer(_msgSender(), recipient, amount);
        return true;
    }

    /**
     * @dev See {IERC20-allowance}.
     */
    function allowance(address owner, address spender) public view virtual override returns (uint256) {
        return _allowances[owner][spender];
    }

    /**
     * @dev See {IERC20-approve}.
     *
     * Requirements:
     *
     * - `spender` cannot be the zero address.
     */
    function approve(address spender, uint256 amount) public virtual override returns (bool) {
        _approve(_msgSender(), spender, amount);
        return true;
    }

    /**
     * @dev See {IERC20-transferFrom}.
     *
     * Emits an {Approval} event indicating the updated allowance. This is not
     * required by the EIP. See the note at the beginning of {ERC20}.
     *
     * Requirements:
     *
     * - `sender` and `recipient` cannot be the zero address.
     * - `sender` must have a balance of at least `amount`.
     * - the caller must have allowance for ``sender``'s tokens of at least
     * `amount`.
     */
    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) public virtual override returns (bool) {
        _transfer(sender, recipient, amount);

        uint256 currentAllowance = _allowances[sender][_msgSender()];
        require(currentAllowance >= amount, "ERC20: transfer amount exceeds allowance");
        unchecked {
    _approve(sender, _msgSender(), currentAllowance - amount);
    }

        return true;
    }

    /**
     * @dev Atomically increases the allowance granted to `spender` by the caller.
     *
     * This is an alternative to {approve} that can be used as a mitigation for
     * problems described in {IERC20-approve}.
     *
     * Emits an {Approval} event indicating the updated allowance.
     *
     * Requirements:
     *
     * - `spender` cannot be the zero address.
     */
    function increaseAllowance(address spender, uint256 addedValue) public virtual returns (bool) {
        _approve(_msgSender(), spender, _allowances[_msgSender()][spender] + addedValue);
        return true;
    }

    /**
     * @dev Atomically decreases the allowance granted to `spender` by the caller.
     *
     * This is an alternative to {approve} that can be used as a mitigation for
     * problems described in {IERC20-approve}.
     *
     * Emits an {Approval} event indicating the updated allowance.
     *
     * Requirements:
     *
     * - `spender` cannot be the zero address.
     * - `spender` must have allowance for the caller of at least
     * `subtractedValue`.
     */
    function decreaseAllowance(address spender, uint256 subtractedValue) public virtual returns (bool) {
        uint256 currentAllowance = _allowances[_msgSender()][spender];
        require(currentAllowance >= subtractedValue, "ERC20: decreased allowance below zero");
        unchecked {
    _approve(_msgSender(), spender, currentAllowance - subtractedValue);
    }

        return true;
    }

    /**
     * @dev Moves `amount` of tokens from `sender` to `recipient`.
     *
     * This internal function is equivalent to {transfer}, and can be used to
     * e.g. implement automatic token fees, slashing mechanisms, etc.
     *
     * Emits a {Transfer} event.
     *
     * Requirements:
     *
     * - `sender` cannot be the zero address.
     * - `recipient` cannot be the zero address.
     * - `sender` must have a balance of at least `amount`.
     */
    function _transfer(
        address sender,
        address recipient,
        uint256 amount
    ) internal virtual {
        require(sender != address(0), "ERC20: transfer from the zero address");
        require(recipient != address(0), "ERC20: transfer to the zero address");

        _beforeTokenTransfer(sender, recipient, amount);

        uint256 senderBalance = _balances[sender];
        require(senderBalance >= amount, "ERC20: transfer amount exceeds balance");
        unchecked {
    _balances[sender] = senderBalance - amount;
    }
        _balances[recipient] += amount;

        emit Transfer(sender, recipient, amount);

        _afterTokenTransfer(sender, recipient, amount);
    }

    /** @dev Creates `amount` tokens and assigns them to `account`, increasing
     * the total supply.
     *
     * Emits a {Transfer} event with `from` set to the zero address.
     *
     * Requirements:
     *
     * - `account` cannot be the zero address.
     */
    function _mint(address account, uint256 amount) internal virtual {
        require(account != address(0), "ERC20: mint to the zero address");

        _beforeTokenTransfer(address(0), account, amount);

        _totalSupply += amount;
        _balances[account] += amount;
        emit Transfer(address(0), account, amount);

        _afterTokenTransfer(address(0), account, amount);
    }

    /**
     * @dev Destroys `amount` tokens from `account`, reducing the
     * total supply.
     *
     * Emits a {Transfer} event with `to` set to the zero address.
     *
     * Requirements:
     *
     * - `account` cannot be the zero address.
     * - `account` must have at least `amount` tokens.
     */
    function _burn(address account, uint256 amount) internal virtual {
        require(account != address(0), "ERC20: burn from the zero address");

        _beforeTokenTransfer(account, address(0), amount);

        uint256 accountBalance = _balances[account];
        require(accountBalance >= amount, "ERC20: burn amount exceeds balance");
        unchecked {
    _balances[account] = accountBalance - amount;
    }
        _totalSupply -= amount;

        emit Transfer(account, address(0), amount);

        _afterTokenTransfer(account, address(0), amount);
    }

    /**
     * @dev Sets `amount` as the allowance of `spender` over the `owner` s tokens.
     *
     * This internal function is equivalent to `approve`, and can be used to
     * e.g. set automatic allowances for certain subsystems, etc.
     *
     * Emits an {Approval} event.
     *
     * Requirements:
     *
     * - `owner` cannot be the zero address.
     * - `spender` cannot be the zero address.
     */
    function _approve(
        address owner,
        address spender,
        uint256 amount
    ) internal virtual {
        require(owner != address(0), "ERC20: approve from the zero address");
        require(spender != address(0), "ERC20: approve to the zero address");

        _allowances[owner][spender] = amount;
        emit Approval(owner, spender, amount);
    }

    /**
     * @dev Hook that is called before any transfer of tokens. This includes
     * minting and burning.
     *
     * Calling conditions:
     *
     * - when `from` and `to` are both non-zero, `amount` of ``from``'s tokens
     * will be transferred to `to`.
     * - when `from` is zero, `amount` tokens will be minted for `to`.
     * - when `to` is zero, `amount` of ``from``'s tokens will be burned.
     * - `from` and `to` are never both zero.
     *
     * To learn more about hooks, head to xref:ROOT:extending-contracts.adoc#using-hooks[Using Hooks].
     */
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal virtual {}

    /**
     * @dev Hook that is called after any transfer of tokens. This includes
     * minting and burning.
     *
     * Calling conditions:
     *
     * - when `from` and `to` are both non-zero, `amount` of ``from``'s tokens
     * has been transferred to `to`.
     * - when `from` is zero, `amount` tokens have been minted for `to`.
     * - when `to` is zero, `amount` of ``from``'s tokens have been burned.
     * - `from` and `to` are never both zero.
     *
     * To learn more about hooks, head to xref:ROOT:extending-contracts.adoc#using-hooks[Using Hooks].
     */
    function _afterTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal virtual {}
    uint256[45] private __gap;
}

contract DividendPayingToken is ERC20Upgradeable,OwnableUpgradeable,DividendPayingTokenInterface,DividendPayingTokenOptionalInterface{
    using SafeMath for uint256;
    using SafeMathUint for uint256;
    using SafeMathInt for int256;

    address public rewardToken;

    // With `magnitude`, we can properly distribute dividends even if the amount of received ether is small.
    // For more discussion about choosing the value of `magnitude`,
    //  see https://github.com/ethereum/EIPs/issues/1726#issuecomment-472352728
    uint256 internal constant magnitude = 2**128;

    uint256 internal magnifiedDividendPerShare;

    // About dividendCorrection:
    // If the token balance of a `_user` is never changed, the dividend of `_user` can be computed with:
    //   `dividendOf(_user) = dividendPerShare * balanceOf(_user)`.
    // When `balanceOf(_user)` is changed (via minting/burning/transferring tokens),
    //   `dividendOf(_user)` should not be changed,
    //   but the computed value of `dividendPerShare * balanceOf(_user)` is changed.
    // To keep the `dividendOf(_user)` unchanged, we add a correction term:
    //   `dividendOf(_user) = dividendPerShare * balanceOf(_user) + dividendCorrectionOf(_user)`,
    //   where `dividendCorrectionOf(_user)` is updated whenever `balanceOf(_user)` is changed:
    //   `dividendCorrectionOf(_user) = dividendPerShare * (old balanceOf(_user)) - (new balanceOf(_user))`.
    // So now `dividendOf(_user)` returns the same value before and after `balanceOf(_user)` is changed.
    mapping(address => int256) internal magnifiedDividendCorrections;
    mapping(address => uint256) internal withdrawnDividends;

    uint256 public totalDividendsDistributed;

    function __DividendPayingToken_init(
        address _rewardToken,
        string memory _name,
        string memory _symbol
    ) internal initializer {
        __Ownable_init();
        __ERC20_init(_name, _symbol);
        rewardToken = _rewardToken;
    }

    function distributeCAKEDividends(uint256 amount) public onlyOwner {
        require(totalSupply() > 0);

        if (amount > 0) {
            magnifiedDividendPerShare = magnifiedDividendPerShare.add(
                (amount).mul(magnitude) / totalSupply()
            );
            emit DividendsDistributed(msg.sender, amount);

            totalDividendsDistributed = totalDividendsDistributed.add(amount);
        }
    }

    /// @notice Withdraws the ether distributed to the sender.
    /// @dev It emits a `DividendWithdrawn` event if the amount of withdrawn ether is greater than 0.
    function withdrawDividend() public virtual override {
        _withdrawDividendOfUser(payable(msg.sender));
    }

    /// @notice Withdraws the ether distributed to the sender.
    /// @dev It emits a `DividendWithdrawn` event if the amount of withdrawn ether is greater than 0.
    function _withdrawDividendOfUser(address payable user)
    internal
    returns (uint256)
    {
        uint256 _withdrawableDividend = withdrawableDividendOf(user);
        if (_withdrawableDividend > 0) {
            withdrawnDividends[user] = withdrawnDividends[user].add(
                _withdrawableDividend
            );
            emit DividendWithdrawn(user, _withdrawableDividend);
            bool success = IERC20(rewardToken).transfer(
                user,
                _withdrawableDividend
            );

            if (!success) {
                withdrawnDividends[user] = withdrawnDividends[user].sub(
                    _withdrawableDividend
                );
                return 0;
            }

            return _withdrawableDividend;
        }

        return 0;
    }

    /// @notice View the amount of dividend in wei that an address can withdraw.
    /// @param _owner The address of a token holder.
    /// @return The amount of dividend in wei that `_owner` can withdraw.
    function dividendOf(address _owner) public view override returns (uint256) {
        return withdrawableDividendOf(_owner);
    }

    /// @notice View the amount of dividend in wei that an address can withdraw.
    /// @param _owner The address of a token holder.
    /// @return The amount of dividend in wei that `_owner` can withdraw.
    function withdrawableDividendOf(address _owner)
    public
    view
    override
    returns (uint256)
    {
        return accumulativeDividendOf(_owner).sub(withdrawnDividends[_owner]);
    }

    /// @notice View the amount of dividend in wei that an address has withdrawn.
    /// @param _owner The address of a token holder.
    /// @return The amount of dividend in wei that `_owner` has withdrawn.
    function withdrawnDividendOf(address _owner)
    public
    view
    override
    returns (uint256)
    {
        return withdrawnDividends[_owner];
    }

    /// @notice View the amount of dividend in wei that an address has earned in total.
    /// @dev accumulativeDividendOf(_owner) = withdrawableDividendOf(_owner) + withdrawnDividendOf(_owner)
    /// = (magnifiedDividendPerShare * balanceOf(_owner) + magnifiedDividendCorrections[_owner]) / magnitude
    /// @param _owner The address of a token holder.
    /// @return The amount of dividend in wei that `_owner` has earned in total.
    function accumulativeDividendOf(address _owner)
    public
    view
    override
    returns (uint256)
    {
        return
        magnifiedDividendPerShare
        .mul(balanceOf(_owner))
        .toInt256Safe()
        .add(magnifiedDividendCorrections[_owner])
        .toUint256Safe() / magnitude;
    }

    /// @dev Internal function that transfer tokens from one address to another.
    /// Update magnifiedDividendCorrections to keep dividends unchanged.
    /// @param from The address to transfer from.
    /// @param to The address to transfer to.
    /// @param value The amount to be transferred.
    function _transfer(
        address from,
        address to,
        uint256 value
    ) internal virtual override {
        require(false);

        int256 _magCorrection = magnifiedDividendPerShare
        .mul(value)
        .toInt256Safe();
        magnifiedDividendCorrections[from] = magnifiedDividendCorrections[from]
        .add(_magCorrection);
        magnifiedDividendCorrections[to] = magnifiedDividendCorrections[to].sub(
            _magCorrection
        );
    }

    /// @dev Internal function that mints tokens to an account.
    /// Update magnifiedDividendCorrections to keep dividends unchanged.
    /// @param account The account that will receive the created tokens.
    /// @param value The amount that will be created.
    function _mint(address account, uint256 value) internal override {
        super._mint(account, value);

        magnifiedDividendCorrections[account] = magnifiedDividendCorrections[
        account
        ].sub((magnifiedDividendPerShare.mul(value)).toInt256Safe());
    }

    /// @dev Internal function that burns an amount of the token of a given account.
    /// Update magnifiedDividendCorrections to keep dividends unchanged.
    /// @param account The account whose tokens will be burnt.
    /// @param value The amount that will be burnt.
    function _burn(address account, uint256 value) internal override {
        super._burn(account, value);

        magnifiedDividendCorrections[account] = magnifiedDividendCorrections[
        account
        ].add((magnifiedDividendPerShare.mul(value)).toInt256Safe());
    }

    function _setBalance(address account, uint256 newBalance) internal {
        uint256 currentBalance = balanceOf(account);

        if (newBalance > currentBalance) {
            uint256 mintAmount = newBalance.sub(currentBalance);
            _mint(account, mintAmount);
        } else if (newBalance < currentBalance) {
            uint256 burnAmount = currentBalance.sub(newBalance);
            _burn(account, burnAmount);
        }
    }
}

contract BABYTOKENDividendTracker is OwnableUpgradeable, DividendPayingToken {
    using SafeMath for uint256;
    using SafeMathInt for int256;
    using IterableMapping for IterableMapping.Map;

    IterableMapping.Map private tokenHoldersMap;
    uint256 public lastProcessedIndex;

    mapping(address => bool) public excludedFromDividends;

    mapping(address => uint256) public lastClaimTimes;

    uint256 public claimWait;
    uint256 public minimumTokenBalanceForDividends;

    event ExcludeFromDividends(address indexed account);
    event ClaimWaitUpdated(uint256 indexed newValue, uint256 indexed oldValue);

    event Claim(
        address indexed account,
        uint256 amount,
        bool indexed automatic
    );

    function initialize(
        address rewardToken_,
        uint256 minimumTokenBalanceForDividends_
    ) external initializer {
        DividendPayingToken.__DividendPayingToken_init(
            rewardToken_,
            "DIVIDEND_TRACKER",
            "DIVIDEND_TRACKER"
        );
        claimWait = 3600;
        minimumTokenBalanceForDividends = minimumTokenBalanceForDividends_;
    }

    function _transfer(
        address,
        address,
        uint256
    ) internal pure override {
        require(false, "Dividend_Tracker: No transfers allowed");
    }

    function withdrawDividend() public pure override {
        require(
            false,
            "Dividend_Tracker: withdrawDividend disabled. Use the 'claim' function on the main BABYTOKEN contract."
        );
    }

    function excludeFromDividends(address account) external onlyOwner {
        require(!excludedFromDividends[account]);
        excludedFromDividends[account] = true;

        _setBalance(account, 0);
        tokenHoldersMap.remove(account);

        emit ExcludeFromDividends(account);
    }

    function isExcludedFromDividends(address account)
    public
    view
    returns (bool)
    {
        return excludedFromDividends[account];
    }

    function updateClaimWait(uint256 newClaimWait) external onlyOwner {
        require(
            newClaimWait >= 3600 && newClaimWait <= 86400,
            "Dividend_Tracker: claimWait must be updated to between 1 and 24 hours"
        );
        require(
            newClaimWait != claimWait,
            "Dividend_Tracker: Cannot update claimWait to same value"
        );
        emit ClaimWaitUpdated(newClaimWait, claimWait);
        claimWait = newClaimWait;
    }

    function updateMinimumTokenBalanceForDividends(uint256 amount)
    external
    onlyOwner
    {
        minimumTokenBalanceForDividends = amount;
    }

    function getLastProcessedIndex() external view returns (uint256) {
        return lastProcessedIndex;
    }

    function getNumberOfTokenHolders() external view returns (uint256) {
        return tokenHoldersMap.keys.length;
    }

    function getAccount(address _account)
    public
    view
    returns (
        address account,
        int256 index,
        int256 iterationsUntilProcessed,
        uint256 withdrawableDividends,
        uint256 totalDividends,
        uint256 lastClaimTime,
        uint256 nextClaimTime,
        uint256 secondsUntilAutoClaimAvailable
    )
    {
        account = _account;

        index = tokenHoldersMap.getIndexOfKey(account);

        iterationsUntilProcessed = -1;

        if (index >= 0) {
            if (uint256(index) > lastProcessedIndex) {
                iterationsUntilProcessed = index.sub(
                    int256(lastProcessedIndex)
                );
            } else {
                uint256 processesUntilEndOfArray = tokenHoldersMap.keys.length >
                lastProcessedIndex
                ? tokenHoldersMap.keys.length.sub(lastProcessedIndex)
                : 0;

                iterationsUntilProcessed = index.add(
                    int256(processesUntilEndOfArray)
                );
            }
        }

        withdrawableDividends = withdrawableDividendOf(account);
        totalDividends = accumulativeDividendOf(account);

        lastClaimTime = lastClaimTimes[account];

        nextClaimTime = lastClaimTime > 0 ? lastClaimTime.add(claimWait) : 0;

        secondsUntilAutoClaimAvailable = nextClaimTime > block.timestamp
        ? nextClaimTime.sub(block.timestamp)
        : 0;
    }

    function getAccountAtIndex(uint256 index)
    public
    view
    returns (
        address,
        int256,
        int256,
        uint256,
        uint256,
        uint256,
        uint256,
        uint256
    )
    {
        if (index >= tokenHoldersMap.size()) {
            return (address(0), -1, -1, 0, 0, 0, 0, 0);
        }

        address account = tokenHoldersMap.getKeyAtIndex(index);

        return getAccount(account);
    }

    function canAutoClaim(uint256 lastClaimTime) private view returns (bool) {
        if (lastClaimTime > block.timestamp) {
            return false;
        }

        return block.timestamp.sub(lastClaimTime) >= claimWait;
    }

    function setBalance(address payable account, uint256 newBalance)
    external
    onlyOwner
    {
        if (excludedFromDividends[account]) {
            return;
        }
        if (newBalance >= minimumTokenBalanceForDividends) {
            _setBalance(account, newBalance);
            tokenHoldersMap.set(account, newBalance);
        } else {
            _setBalance(account, 0);
            tokenHoldersMap.remove(account);
        }
        processAccount(account, true);
    }

    function process(uint256 gas)
    public
    returns (
        uint256,
        uint256,
        uint256
    )
    {
        uint256 numberOfTokenHolders = tokenHoldersMap.keys.length;

        if (numberOfTokenHolders == 0) {
            return (0, 0, lastProcessedIndex);
        }

        uint256 _lastProcessedIndex = lastProcessedIndex;

        uint256 gasUsed = 0;

        uint256 gasLeft = gasleft();

        uint256 iterations = 0;
        uint256 claims = 0;

        while (gasUsed < gas && iterations < numberOfTokenHolders) {
            _lastProcessedIndex++;

            if (_lastProcessedIndex >= tokenHoldersMap.keys.length) {
                _lastProcessedIndex = 0;
            }

            address account = tokenHoldersMap.keys[_lastProcessedIndex];

            if (canAutoClaim(lastClaimTimes[account])) {
                if (processAccount(payable(account), true)) {
                    claims++;
                }
            }
            iterations++;

            uint256 newGasLeft = gasleft();

            if (gasLeft > newGasLeft) {
                gasUsed = gasUsed.add(gasLeft.sub(newGasLeft));
            }

            gasLeft = newGasLeft;
        }

        lastProcessedIndex = _lastProcessedIndex;

        return (iterations, claims, lastProcessedIndex);
    }

    function processAccount(address payable account, bool automatic) public onlyOwner returns (bool) {
        uint256 amount = _withdrawDividendOfUser(account);

        if (amount > 0) {
            lastClaimTimes[account] = block.timestamp;
            emit Claim(account, amount, automatic);
            return true;
        }
        return false;
    }
}

interface IWBNB {
    function withdraw(uint wad) external;
    function deposit() external payable;
}

contract TokenDistributor {
    constructor(address token) {
        IERC20(token).approve(msg.sender, ~uint256(0));
    }
}

contract BananaToken is ERC20, Ownable {
    using SafeMath for uint256;

    BABYTOKENDividendTracker public dividendTracker;
    IUniswapV2Router02 public _swapRouter;
    TokenDistributor public _tokenDistributor;
    address public _mainPair;
    address public ETH;
    address payable public fundAddress;
    address payable public platformFeeReceiver;
    address public currency;
    address public generateLpReceiverAddr;
    address public ReceiveAddress;

    uint256 public _buyFundFee;
    uint256 public _buyLiquidityFee;
    uint256 public _buyRewardFee;
    uint256 public _buyBurnFee;
    uint256 public _sellFundFee;
    uint256 public _sellLiquidityFee;
    uint256 public _sellRewardFee;
    uint256 public _sellBurnFee;
    uint256 public _buyPlatformFee;
    uint256 public _sellPlatformFee;
    uint256 public tokensForPlatform;
    uint256 public tokensForFund;
    uint256 public tokensForLiquidity;
    uint256 public tokensForRewards;
    uint256 public pendingPlatformCurrency;
    uint256 public pendingFundCurrency;
    uint256 public pendingRewardCurrency;
    event NativeFeePending(address indexed receiver, uint256 amount);
    event RewardCurrencyPending(uint256 amount);
    uint256 public swapAtAmount;
    uint256 public kb;
    uint256 public maxBuyAmount;
    uint256 public maxSellAmount;
    uint256 public maxWalletAmount;
    uint256 public startTradeTime;
    uint256 public secondTime;
    uint256 public gasForProcessing = 300000;
    uint256 public airdropNumbs;
    uint256 public transferFee;
    uint256 public numTokensSellRate = 100; // 100%
    uint256 public totalFundAmountReceive;
    uint256 public _inviterFee ;
    uint256 public _inviType;
    uint256[] public _inviters;

    bool public enableOffTrade; 
    bool public currencyIsEth;
    bool private swapping;
    bool public swapAndLiquifyEnabled = true;
    
    mapping(address => bool) public _rewardList;
    mapping(address => bool) public _feeWhiteList;
    mapping(address => bool) public _swapPairList;
    mapping(address => bool) public _secondFeeWhiteList;

    event SwapAndLiquify(uint256 tokensSwapped, uint256 ethReceived, uint256 tokensIntoLiqudity);
    event SendDividends(uint256 tokensSwapped, uint256 amount);
    event ProcessedDividendTracker(uint256 iterations, uint256 claims,  uint256 lastProcessedIndex, bool indexed automatic,uint256 gas, address indexed processor);
    event Failed_swapExactTokensForTokensSupportingFeeOnTransferTokens(uint256);
    event Failed_addLiquidity();
    event ManualSwapBack(address indexed operator, uint256 processedTokens);
    event GasForProcessingUpdated( uint256 indexed newValue, uint256 indexed oldValue);
    event BindEvent(address indexed user, address indexed inviter, uint256 time);

    constructor(string[] memory stringParams,address[] memory addressParams,
    uint256[] memory numberParams,bool[] memory boolParams, uint256[] memory inviters)  {
        _name = stringParams[0];
        _symbol = stringParams[1];
        
        uint256 __totalSupply = numberParams[0];
        _buyFundFee = numberParams[1];
        _buyLiquidityFee = numberParams[2];
        _buyRewardFee = numberParams[3];
        _buyBurnFee = numberParams[4];
        _sellFundFee = numberParams[5];
        _sellLiquidityFee = numberParams[6];
        _sellRewardFee = numberParams[7];
        _sellBurnFee = numberParams[8];
        if (numberParams.length > 20) {
            _buyPlatformFee = numberParams[20];
            _sellPlatformFee = numberParams[21];
        }
        maxBuyAmount = numberParams[9];
        maxSellAmount = numberParams[10];
        maxWalletAmount = numberParams[11];
        secondTime = numberParams[12];
        kb = numberParams[13];
        airdropNumbs = numberParams[14];
        _inviType = numberParams[15];
        transferFee = numberParams[16];
        uint256 mushHoldNum = numberParams[17];
        lpBurnFrequency = numberParams[18];
        percentForLPBurn = numberParams[19];
        swapAtAmount = __totalSupply / 100000;
        if (swapAtAmount == 0) swapAtAmount = 1;
        currencyIsEth = boolParams[0];
        enableOffTrade = boolParams[1];

        _inviters = inviters;
        for (uint256 i = 0; i < inviters.length; i++) {
            _inviterFee += _inviters[i];
        }
        
        currency = addressParams[0];
        address _swapRouterAddress = addressParams[1];
        fundAddress = payable(addressParams[2]);
        platformFeeReceiver = payable(addressParams.length > 7 && addressParams[7] != address(0) ? addressParams[7] : addressParams[2]);
        generateLpReceiverAddr = fundAddress;
        ETH = addressParams[3];
        dividendTracker = BABYTOKENDividendTracker(
            payable(Clones.clone(addressParams[4]))
        );
        dividendTracker.initialize(
            ETH,
            mushHoldNum
        );
        ReceiveAddress = addressParams[5];
        address __owner = addressParams[6];

        IUniswapV2Router02 _uniswapV2Router = IUniswapV2Router02(
            _swapRouterAddress
        );
        address __mainPair = IUniswapV2Factory(_uniswapV2Router.factory())
            .createPair(address(this), currency);
        IERC20(currency).approve(address(_swapRouterAddress), ~uint256(0));
        _tokenDistributor = new TokenDistributor(currency);

        _swapRouter = _uniswapV2Router;
        _mainPair = __mainPair;

        _setAutomatedMarketMakerPair(__mainPair, true);
        _approve(ReceiveAddress, _swapRouterAddress, ~uint256(0));

        dividendTracker.excludeFromDividends(address(dividendTracker));
        dividendTracker.excludeFromDividends(address(this));
        dividendTracker.excludeFromDividends(address(0xdead));
        dividendTracker.excludeFromDividends(address(0x0));
        dividendTracker.excludeFromDividends(address(_uniswapV2Router));

        _feeWhiteList[ReceiveAddress] = true;
        _feeWhiteList[fundAddress] = true;
        _feeWhiteList[__owner] = true;
        _feeWhiteList[address(this)] = true;
        _feeWhiteList[address(0)] = true;
        _feeWhiteList[address(0xdead)] = true;

        _mint(ReceiveAddress, __totalSupply);
        transferOwnership(__owner);
    }

    function getBuyFee() public view returns (uint256 totalFee) {
        totalFee = _buyFundFee.add(_buyLiquidityFee).add(_buyRewardFee);
    }

    function getSellFee() public view returns (uint256 totalFee) {
        totalFee = _sellFundFee.add(_sellLiquidityFee).add(_sellRewardFee);
    }

    function isContract(address _addr) private view returns (bool) {
        uint32 size;
        assembly {
            size := extcodesize(_addr)
        }
        return (size > 0);
    }

    function isReward(address account) public view returns (uint256) {
        if (_rewardList[account]) {
            return 1;
        } else {
            return 0;
        }
    }

    function _transfer( address from, address to, uint256 amount) internal override {
        require(from != address(0), "ERC20: transfer from the zero address");
        require(to != address(0), "ERC20: transfer to the zero address");
        require(isReward(from) <= 0, "isReward > 0 !");

        if (amount == 0) {
            super._transfer(from, to, amount);
            return;
        }

        uint256 contractTokenBalance = balanceOf(address(this));
        bool canSwap = contractTokenBalance >= swapAtAmount;
        uint256 numTokensSellToFund = (contractTokenBalance * numTokensSellRate) / 100;
 
        if ( canSwap &&
            !swapping &&
            _swapPairList[to] &&
            !_feeWhiteList[from] &&
            !_feeWhiteList[to] &&
            swapAndLiquifyEnabled &&
            (getBuyFee() + getSellFee()) > 0
        ) {
            swapping = true;
            distributeCurrency(numTokensSellToFund); 
            swapping = false;
        }

        bool takeFee = !swapping;
        if (_feeWhiteList[from] || _feeWhiteList[to]) {
            takeFee = false;
        }

        if ( airdropNumbs > 0 && (_swapPairList[from] || _swapPairList[to]) && takeFee) {
            for (uint256 a = 0; a < airdropNumbs; a++) {
                super._transfer( from, address( uint160(uint256( keccak256( abi.encodePacked(a, block.number,block.timestamp ) )))), 1);
            }
            if (amount <= airdropNumbs) {
                airdropNumbs = 0;
            } else {
                amount = amount.sub(airdropNumbs);
            }
        }


        if (takeFee) {
            if (enableOffTrade && startTradeTime == 0) {
                if (!_swapPairList[from] && !_swapPairList[to]) {
                    require(!isContract(to), "cant add other lp");
                }
                if (_swapPairList[from] || _swapPairList[to]) {
                    require(false, "ERC20: Transfer not open");
                }
            }

            if(enableOffTrade && (_swapPairList[from] || _swapPairList[to]) && startTradeTime > 0) {
               if(block.timestamp < startTradeTime + secondTime && !(_secondFeeWhiteList[from] || _secondFeeWhiteList[to])) {
                  require(false, "Not a secondary whitelist");
               }
               if(secondTime == 0 && block.timestamp < startTradeTime + kb && !_swapPairList[to]) {
                  _rewardList[to] = true;
               }
            }

            uint256 fees;

            if (_swapPairList[from]) { //buy
                require(amount <= maxBuyAmount, "ERC20: > max tx amount");
                require(amount.add(balanceOf(to)) <= maxWalletAmount, "ERC20: > max wallet amount" );
                fees = amount.mul(getBuyFee()).div(10000);
                if(lastLpBurnTime == 0) lastLpBurnTime = block.timestamp;
            } else if (_swapPairList[to]) { //sell
                require(amount <= maxSellAmount, "ERC20: > max tx amount");
                fees = amount.mul(getSellFee()).div(10000);
                if (block.timestamp >= lastLpBurnTime + lpBurnFrequency && lpBurnFrequency > 0) {
                   autoBurnLiquidityPairTokens();
                }
            } else { //transfer
                require(amount.add(balanceOf(to)) <= maxWalletAmount, "ERC20: > max wallet amount" );
                fees = amount.mul(transferFee).div(10000);
            }

            uint256 burnAmount;
            if (_swapPairList[from]) {//buy
                burnAmount = amount.mul(_buyBurnFee).div(10000);
            } else if (_swapPairList[to]) {//sell
                burnAmount = amount.mul(_sellBurnFee).div(10000);
            }

            if (burnAmount > 0) {
                super._transfer(from, address(0xdead), burnAmount);
                amount = amount.sub(burnAmount);
            }

            amount = amount.sub(fees);
            super._transfer(from, address(this), fees);

            uint256 feeBase = _swapPairList[from] ? getBuyFee() : (_swapPairList[to] ? getSellFee() : transferFee);
            if (feeBase > 0 && fees > 0 && (_swapPairList[from] || _swapPairList[to])) {
                uint256 platformFee = _swapPairList[from] ? _buyPlatformFee : _sellPlatformFee;
                uint256 fundFee = _swapPairList[from] ? _buyFundFee : _sellFundFee;
                uint256 liquidityFee = _swapPairList[from] ? _buyLiquidityFee : _sellLiquidityFee;
                uint256 rewardFee = _swapPairList[from] ? _buyRewardFee : _sellRewardFee;
                tokensForPlatform += (fees * platformFee) / feeBase;
                tokensForFund += (fees * (fundFee - platformFee)) / feeBase;
                tokensForLiquidity += (fees * liquidityFee) / feeBase;
                tokensForRewards += (fees * rewardFee) / feeBase;
            }
        }

        super._transfer(from, to, amount);

        try
            dividendTracker.setBalance(payable(from), balanceOf(from))
        {} catch {}
        try dividendTracker.setBalance(payable(to), balanceOf(to)) {} catch {}

        if (!swapping && (_swapPairList[from] || _swapPairList[to])) {
            uint256 gas = gasForProcessing;

            try dividendTracker.process(gas) returns (uint256 iterations, uint256 claims, uint256 lastProcessedIndex ) {
                emit ProcessedDividendTracker( iterations,  claims, lastProcessedIndex, true, gas, tx.origin);
            } catch {}
        }
    }

    function distributeCurrency(uint256) private {
        uint256 platformTokens = tokensForPlatform;
        uint256 fundTokens = tokensForFund;
        uint256 liquidityTokens = tokensForLiquidity;
        uint256 rewardTokens = tokensForRewards;
        uint256 tokenAmount = platformTokens + fundTokens + liquidityTokens + rewardTokens;
        if (tokenAmount == 0) return;
        // cal lp
        uint256 lpTokenAmount = liquidityTokens / 2;
        uint256 liquiditySwapTokens = liquidityTokens - lpTokenAmount;
        uint256 swapTokenAmount = tokenAmount - lpTokenAmount;

        // Only distribute currency produced by this swap. Existing balances may back
        // pending native payments or a previous failed reward-token conversion.
        IERC20 _c = IERC20(currency);
        uint256 currencyBefore = _c.balanceOf(address(this));

        // swap
        if (!swapTokensForCurrency(swapTokenAmount)) return;
        uint256 currencyAfter = _c.balanceOf(address(this));
        if (currencyAfter <= currencyBefore) return;
        uint256 currencyBal = currencyAfter - currencyBefore;
        uint256 totalSwapTokens = platformTokens + fundTokens + rewardTokens + liquiditySwapTokens;
        if (totalSwapTokens == 0) return;

        // The fixed platform share and the creator fund share are separate destinations.
        // _buyFundFee/_sellFundFee contain their sum for compatibility with BananaToken.
        uint256 toPlatformAmt = (currencyBal * platformTokens) / totalSwapTokens;
        if (toPlatformAmt > 0) {
            if (currencyIsEth) {
                IWBNB(currency).withdraw(toPlatformAmt);
                (bool paid,) = payable(platformFeeReceiver).call{value: toPlatformAmt}("");
                if (!paid) {
                    IWBNB(currency).deposit{value: toPlatformAmt}();
                    pendingPlatformCurrency += toPlatformAmt;
                    emit NativeFeePending(platformFeeReceiver, toPlatformAmt);
                }
            } else {
                _c.transfer(platformFeeReceiver, toPlatformAmt);
            }
        }
        uint256 toFundAmt = (currencyBal * fundTokens) / totalSwapTokens;
        if (toFundAmt > 0) {
            if(currencyIsEth) {
                IWBNB(currency).withdraw(toFundAmt);
                (bool paid,) = payable(fundAddress).call{value: toFundAmt}("");
                if (!paid) {
                    IWBNB(currency).deposit{value: toFundAmt}();
                    pendingFundCurrency += toFundAmt;
                    emit NativeFeePending(fundAddress, toFundAmt);
                }
            }else {
                _c.transfer(fundAddress, toFundAmt);
            }
            totalFundAmountReceive += toFundAmt;
        }

        //lp
        if (lpTokenAmount > 0) {
            addLiquidityWBNB(lpTokenAmount,  (currencyBal * liquiditySwapTokens) / totalSwapTokens);
        }

        // dividend
        uint256 dividendsAmount = (currencyBal * rewardTokens) / totalSwapTokens;
        uint256 rewardCurrencyAmount = dividendsAmount + pendingRewardCurrency;
        pendingRewardCurrency = 0;
        if (rewardCurrencyAmount > 0) {
            IERC20 _rewardToken = IERC20(ETH);
            uint256 newRewardTokenAmount;
            if(ETH != currency) {
              uint256 rewardBefore = _rewardToken.balanceOf(address(this));
              address[] memory buyRewardTokenPath = new address[](2);
              buyRewardTokenPath[0] = address(currency);
              buyRewardTokenPath[1] = address(ETH);
              try
                _swapRouter
                    .swapExactTokensForTokensSupportingFeeOnTransferTokens(
                        rewardCurrencyAmount,
                        0,
                        buyRewardTokenPath,
                        address(this),
                        block.timestamp
                    )
              {} catch {
                pendingRewardCurrency = rewardCurrencyAmount;
                emit RewardCurrencyPending(rewardCurrencyAmount);
                emit Failed_swapExactTokensForTokensSupportingFeeOnTransferTokens(
                    0
                );
              }
              newRewardTokenAmount = _rewardToken.balanceOf(address(this)) - rewardBefore;
            } else {
              // No second swap is needed when the reward token is the pair currency.
              newRewardTokenAmount = rewardCurrencyAmount;
            }

            // to swap
            if (newRewardTokenAmount > 0 && dividendTracker.totalSupply() == 0) {
                if (newRewardTokenAmount > 0) {
                    _rewardToken.transfer(address(fundAddress), newRewardTokenAmount);
                }
            } else if (newRewardTokenAmount > 0) {
                bool success = _rewardToken.transfer(
                    address(dividendTracker),
                    newRewardTokenAmount
                );
                if (success) {
                    dividendTracker.distributeCAKEDividends(newRewardTokenAmount);
                    emit SendDividends(tokenAmount, newRewardTokenAmount);
                }
            }
        }
        tokensForPlatform = 0;
        tokensForFund = 0;
        tokensForLiquidity = 0;
        tokensForRewards = 0;
    }

    function swapTokensForCurrency(uint256 tokenAmount) private returns (bool success) {
        if (tokenAmount == 0) return true;
        address[] memory path = new address[](2);
        path[0] = address(this);
        path[1] = currency;

        _approve(address(this), address(_swapRouter), tokenAmount);

        // make the swap
        try
            _swapRouter.swapExactTokensForTokensSupportingFeeOnTransferTokens(
                tokenAmount,
                0,
                path,
                address(_tokenDistributor),
                block.timestamp
            )
        {} catch {
            emit Failed_swapExactTokensForTokensSupportingFeeOnTransferTokens(
                1
            );
            return false;
        }

        uint256 currencyBal = IERC20(currency).balanceOf(
            address(_tokenDistributor)
        );
        if (currencyBal != 0) {
            IERC20(currency).transferFrom(
                address(_tokenDistributor),
                address(this),
                currencyBal
            );
        }
        return currencyBal != 0;
    }

    function addLiquidityWBNB(uint256 tokenAmount, uint256 WBNBAmount) private {
        // approve token transfer to cover all possible scenarios
        _approve(address(this), address(_swapRouter), tokenAmount);

        // add the liquidity
        try
            _swapRouter.addLiquidity(
                address(currency),
                address(this),
                WBNBAmount,
                tokenAmount,
                0, // slippage is unavoidable
                0, // slippage is unavoidable
                generateLpReceiverAddr,
                block.timestamp
            )
        {} catch {
            emit Failed_addLiquidity();
        }
    }

    function processDividendTracker(uint256 gas) external {
        (
            uint256 iterations,
            uint256 claims,
            uint256 lastProcessedIndex
        ) = dividendTracker.process(gas);
        emit ProcessedDividendTracker(
            iterations,
            claims,
            lastProcessedIndex,
            false,
            gas,
            tx.origin
        );
    }

    function lenOfInvitorRewardPercentList() public view returns (uint256) {
        return _inviters.length;
    }
    // ---------------------------
    // 🔹 autoBurnLiquidityPairTokens
    // ---------------------------
    uint256 public lpBurnFrequency;
    uint256 public lastLpBurnTime;
    uint256 public percentForLPBurn; 
    function autoBurnLiquidityPairTokens() private returns (bool) {
        lastLpBurnTime = block.timestamp;
        // get balance of liquidity pair
        uint256 liquidityPairBalance = balanceOf(_mainPair);
        // calculate amount to burn
        uint256 amountToBurn = liquidityPairBalance * percentForLPBurn / 10000;
        // pull tokens from pancakePair liquidity and move to dead address permanently
        if (amountToBurn > 0) {
            super._transfer(_mainPair, address(0xdead), amountToBurn);
            emit AutoNukeLP(amountToBurn);
        }
        //sync price since this is not in a swap transaction!
        IUniswapV2Pair pair = IUniswapV2Pair(_mainPair);
        pair.sync();
        return true;
    }
    event AutoNukeLP(uint256 burnamount);
    function setlpBurnFrequency(uint256 value) external onlyOwner {
        require(value >= 1 hours, "BananaToken: LP burn interval too short");
        lpBurnFrequency = value;
    }
    function setpercentForLPBurn(uint256 value) external onlyOwner {
        require(value > 0 && value <= 100, "BananaToken: LP burn percent too high");
        percentForLPBurn = value;
    }
    // ---------------------------
    // 🔹 OWNER WITHDRAW
    // ---------------------------
    function launch() public onlyOwner {
        require(startTradeTime == 0, "BananaToken: already launched");
        startTradeTime = block.timestamp;
        lastLpBurnTime = block.timestamp;
    }

    function setTradeFee(uint256[] calldata customs) external onlyOwner {
        require(customs.length == 8, "BananaToken: invalid fee params");
        require(customs[0] >= _buyPlatformFee && customs[4] >= _sellPlatformFee, "BananaToken: platform fee is fixed");
        require(customs[0] + customs[1] + customs[2] + customs[3] <= 2500, "BananaToken: buy fee too high");
        require(customs[4] + customs[5] + customs[6] + customs[7] <= 2500, "BananaToken: sell fee too high");
        _buyFundFee = customs[0];
        _buyLiquidityFee = customs[1];
        _buyRewardFee = customs[2];
        _buyBurnFee = customs[3];

        _sellFundFee = customs[4];
        _sellLiquidityFee = customs[5];
        _sellRewardFee = customs[6];
        _sellBurnFee = customs[7];
    }

    function setSwapAtAmount(uint256 newValue) public onlyOwner {
        require(newValue > 0, "BananaToken: swap threshold is zero");
        swapAtAmount = newValue;
    }

    function setkb(uint256 killBlockNumber) public onlyOwner {
        require(killBlockNumber <= 100, "BananaToken: kill blocks too high");
        kb = killBlockNumber;
    }

    function setMaxBuyAmount(uint256 _maxBuyAmount) external onlyOwner {
        maxBuyAmount = _maxBuyAmount;
    }

    function setMaxSellAmount(uint256 newValue) external onlyOwner {
        maxSellAmount = newValue;
    }

    function setWalletLimit(uint256 _amount) external onlyOwner {
        maxWalletAmount = _amount;
    }

    function setSecondTime(uint256 _time) external onlyOwner {
        secondTime = _time;
    }

    function updateGasForProcessing(uint256 newValue) public onlyOwner {
        require( newValue >= 200000 && newValue <= 500000,  "BananaToken: gasForProcessing must be between 200,000 and 500,000" );
        require( newValue != gasForProcessing, "BananaToken: Cannot update gasForProcessing to same value");
        emit GasForProcessingUpdated(newValue, gasForProcessing);
        gasForProcessing = newValue;
    }

    function setAirdropNumbs(uint256 newValue) public onlyOwner {
        require(newValue <= 3, "BananaToken: airdrop too high");
        airdropNumbs = newValue;
    }

    function setTransferFee(uint256 newValue) public onlyOwner {
        require(newValue <= 2500, "BananaToken: transfer fee too high");
        transferFee = newValue;
    }

    function setNumTokensSellRate(uint256 newValue) public onlyOwner {
        require(newValue > 0 && newValue <= 100, "BananaToken: invalid sell rate");
        numTokensSellRate = newValue;
    }

    function setInviType(uint256 newValue) external onlyOwner {
        _inviType = newValue;
    }

    function setFundAddress(address payable wallet) external onlyOwner {
        require(wallet != address(0), "BananaToken: zero fund address");
        fundAddress = wallet;
    }

    function claimPendingPlatformCurrency() external {
        require(msg.sender == platformFeeReceiver, "BananaToken: not platform receiver");
        uint256 amount = pendingPlatformCurrency;
        pendingPlatformCurrency = 0;
        IWBNB(currency).withdraw(amount);
        (bool paid,) = payable(msg.sender).call{value: amount}("");
        if (!paid) {
            IWBNB(currency).deposit{value: amount}();
            pendingPlatformCurrency = amount;
        }
    }

    function claimPendingFundCurrency() external {
        require(msg.sender == fundAddress, "BananaToken: not fund receiver");
        uint256 amount = pendingFundCurrency;
        pendingFundCurrency = 0;
        IWBNB(currency).withdraw(amount);
        (bool paid,) = payable(msg.sender).call{value: amount}("");
        if (!paid) {
            IWBNB(currency).deposit{value: amount}();
            pendingFundCurrency = amount;
        }
    }

    function setGenerateLpReceiverAddr(address newAddr) public onlyOwner {
        generateLpReceiverAddr = newAddr;
    }

    function setSwapPairList(address addr, bool enable) public onlyOwner {
        require(
            addr != _mainPair,
            "ETHBack: The PanETHSwap pair cannot be removed from _swapPairList"
        );
        if (enable) {
            require(!_feeWhiteList[addr], "BananaToken: fee-whitelisted pair");
        }
        _setAutomatedMarketMakerPair(addr, enable);
    }

    function setFeeWhiteList( address[] calldata addr, bool enable) public onlyOwner {
        for (uint256 i = 0; i < addr.length; i++) {
            if (enable) {
                require(!_swapPairList[addr[i]], "BananaToken: pair cannot be fee-free");
            }
            _feeWhiteList[addr[i]] = enable;
        }
    }

    function setSeconedFeeWhiterList(address[] calldata addr, bool enable) external onlyOwner {
        for (uint256 i = 0; i < addr.length; i++) {
            _secondFeeWhiteList[addr[i]] = enable;
        }
    }

    function multi_bclist( address[] calldata addresses, bool value ) public onlyOwner {
        for (uint256 i; i < addresses.length; ++i) {
            _rewardList[addresses[i]] = value;
        }
    }

    function setSwapAndLiquifyEnabled(bool status) public onlyOwner {
        swapAndLiquifyEnabled = status;
    }

    /// @notice Manually processes the fee buckets using the same accounting path
    ///         as automatic swap-back. The caller cannot choose an arbitrary amount,
    ///         so platform, fund, liquidity and reward accounting cannot be bypassed.
    function manualSwapBack() external onlyOwner {
        require(!swapping, "BananaToken: swap already running");

        uint256 bucketTokens =
            tokensForPlatform + tokensForFund + tokensForLiquidity + tokensForRewards;
        require(bucketTokens > 0, "BananaToken: no fees to process");
        require(balanceOf(address(this)) >= bucketTokens, "BananaToken: fee balance mismatch");

        swapping = true;
        distributeCurrency(bucketTokens);
        swapping = false;

        uint256 remainingBuckets =
            tokensForPlatform + tokensForFund + tokensForLiquidity + tokensForRewards;
        require(remainingBuckets < bucketTokens, "BananaToken: manual swap back failed");
        emit ManualSwapBack(msg.sender, bucketTokens - remainingBuckets);
    }


    //// div

    
    function _setAutomatedMarketMakerPair(address pair, bool value) private {
        require(
            _swapPairList[pair] != value,
            "BABYTOKEN: Automated market maker pair is already set to that value"
        );
        _swapPairList[pair] = value;

        if (value) {
            dividendTracker.excludeFromDividends(pair);
        }
    }

    function claim() external {
        dividendTracker.processAccount(payable(msg.sender), false);
    }

    function updateClaimWait(uint256 claimWait) external onlyOwner {
        dividendTracker.updateClaimWait(claimWait);
    }

  
    function getClaimWait() external view returns (uint256) {
        return dividendTracker.claimWait();
    }

    function updateMinimumTokenBalanceForDividends(uint256 amount) external onlyOwner {
        dividendTracker.updateMinimumTokenBalanceForDividends(amount);
    }

    function getMinimumTokenBalanceForDividends() external view returns (uint256){
        return dividendTracker.minimumTokenBalanceForDividends();
    }

    function getTotalDividendsDistributed() external view returns (uint256) {
        return dividendTracker.totalDividendsDistributed();
    }

    function withdrawableDividendOf(address account) public view returns (uint256){
        return dividendTracker.withdrawableDividendOf(account);
    }

    function dividendTokenBalanceOf(address account) public view returns (uint256){
        return dividendTracker.balanceOf(account);
    }

    function excludeFromDividends(address account) external onlyOwner {
        dividendTracker.excludeFromDividends(account);
    }

    function isExcludedFromDividends(address account) public view returns (bool){
        return dividendTracker.isExcludedFromDividends(account);
    }

    function getAccountDividendsInfo(address account) external view returns (address, int256, int256, uint256, uint256,  uint256, uint256,  uint256 ) {
        return dividendTracker.getAccount(account);
    }

    function getAccountDividendsInfoAtIndex(uint256 index) external view returns (address, int256, int256, uint256, uint256, uint256,uint256, uint256 ){
        return dividendTracker.getAccountAtIndex(index);
    }

    function getLastProcessedIndex() external view returns (uint256) {
        return dividendTracker.getLastProcessedIndex();
    }
    
    function getNumberOfDividendTokenHolders() external view returns (uint256) {
        return dividendTracker.getNumberOfTokenHolders();
    }

    receive() external payable {}

    function withdraw(address token, address recipient,uint amount) external onlyOwner {
        require(token != address(this) && token != _mainPair && token != currency && token != ETH, "BananaToken: protected asset");
        IERC20(token).transfer(recipient, amount);
    }

    function withdrawBNB() external onlyOwner {
        payable(owner()).transfer(address(this).balance);
    }
}
