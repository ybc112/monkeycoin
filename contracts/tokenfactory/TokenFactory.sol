// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { BananaToken } from "./BananaToken.sol";

interface IBananaTokenDeployer {
    function deploy(
        string[] calldata stringParams,
        address[] calldata addressParams,
        uint256[] calldata numberParams,
        bool[] calldata boolParams,
        uint256[] calldata inviters,
        bytes32 salt
    )
        external
        returns (address token);

}

/// @notice 雪球发射台 TokenFactory —— 一键部署 BananaToken（对标链上
///         SGPRS 0xfc6d3753e47139ffe7a2eaa3347ca248ada35555 已验证合约）。
///
/// 职责（用户友好 → BananaToken 四数组）：
///   1. 接收前端傻瓜式参数（只填名称/符号/总量/项目方/fund/分红币/交易对币/
///      总买税/总卖税/四项占比/开盘保护/限买限卖限钱包/单边燃烧参数）
///   2. 平台费固定 20% 内部计算，用户不传：
///        platformFee  = totalTax × 20%                    → 独立平台收款地址
///        leftTax      = totalTax − platformFee
///        rewardFee    = leftTax × rewardShare / 10000
///        liquidityFee = leftTax × liquidityShare / 10000
///        burnFee      = leftTax × burnShare / 10000
///        fundFee      = leftTax − reward − liquidity − burn （余数）
///      例：总税 5% → 平台 1% + 分红 2.29% + 回流 0.57% + 燃烧 1.14% = 5%
///   3. 拼好 stringParams / addressParams / numberParams / boolParams
///   4. new BananaToken(...) + emit TokenCreated
///
/// 靓号：salt 由前端离线挖盐传入（CREATE2 initCodeHash 可预测），
///       部署后链上校验实际地址后缀，不匹配则整笔回滚。
///
/// 两个入口：
///   - createToken()                ：只部署代币（简单稳定，可自己加池）
///   - createTokenAndAddLiquidity() ：部署 + 自动加池 + LP 锁黑洞 + 开盘 +
///                                     剩余币转项目方 + owner 转项目方（全自动）
contract TokenFactory {
    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant PLATFORM_FEE_BPS = 2_000; // 平台抽成固定 20%（内部，用户不可传）
    uint256 public constant MAX_TAX_BPS = 2_500;
    address public constant LP_BLACK_HOLE = 0x000000000000000000000000000000000000dEaD;
    address public constant DEFAULT_REWARD_TOKEN = 0x55d398326f99059fF775485246999027B3197955; // BSC USDT

    address public feeRecipient;          // 发币费 + 固定平台税收款（fundAddress 默认也指向这里）
    uint256 public creationFee;           // 发币费（BNB，可为 0）
    address public creationFeeToken;      // 发币费代币（0 = 关闭，仅收 BNB）
    uint256 public creationFeeTokenAmount; // 发币费代币数量（部署时转黑洞销毁）
    address public router;                // PancakeSwap Router
    address public dividendTrackerImpl;   // BABYTOKENDividendTracker 实现（Clones.clone 用）
    address public tokenDeployer;         // BananaTokenDeployer（CREATE2 部署，避免字节码超限）
    uint16 public immutable requiredTokenSuffix; // 靓号后缀（0 = 关闭）

    address[] public allTokens;
    bool private entered;

    modifier nonReentrant() {
        if (entered) revert InvalidFee();
        entered = true;
        _;
        entered = false;
    }

    struct LaunchParams {
        string name;
        string symbol;
        uint256 totalSupply;
        address receiver;        // 项目方地址（ReceiveAddress + owner）
        address fundAddress;     // 项目 fund 收款地址（不含平台税；0 = feeRecipient）
        address rewardToken;     // 分红币地址（0 = USDT 默认）
        address currency;        // 交易对币地址（0 = WBNB 原生）
        uint256 totalBuyTax;     // 总买税 bps（如 500 = 5%）
        uint256 totalSellTax;    // 总卖税 bps
        uint256 rewardShare;     // 剩余税中 分红 占比 bps
        uint256 liquidityShare;  // 剩余税中 LP 回流 占比 bps
        uint256 burnShare;       // 剩余税中 黑洞燃烧 占比 bps
        uint256 fundShare;       // 剩余税中 fund 占比 bps（须 == 10000−前三项）
        uint256 maxBuyAmount;    // 限买（0 = 不限 → 链上传 type(uint256).max）
        uint256 maxSellAmount;   // 限卖（同上）
        uint256 maxWalletAmount; // 限钱包（同上）
        uint256 secondTime;      // 开盘保护：二次白名单时长（秒）
        uint256 killBlocks;      // 开盘保护：反机器人块数（kb）
        uint256 airdropNumbs;    // 空投份数（≤3，0=关闭）
        uint256 transferFee;     // 转账税 bps
        uint256 mushHoldNum;     // 分红持币门槛（0 = 不限）
        uint256 lpBurnFrequency; // LP 单边燃烧间隔（秒，默认 3600）
        uint256 percentForLPBurn;// LP 单边燃烧比例 bps（默认 50 = 0.5%/次）
        bool enableOffTrade;     // 是否启用开盘保护（未 launch 禁止交易）
    }

    struct FeeSplit {
        uint256 platformFee;
        uint256 rewardFee;
        uint256 liquidityFee;
        uint256 burnFee;
        uint256 fundFee; // 仅项目 fund 余数；传入 BananaToken 时再与 platformFee 相加
    }

    error InvalidFee();
    error InvalidParams();
    error InvalidTokenSuffix(address token, uint16 requiredSuffix);
    error ZeroAddress();
    error TokenTransferFailed();

    event TokenCreated(
        address indexed creator,
        address indexed token,
        string name,
        string symbol,
        uint256 totalSupply,
        uint256 buyRewardFee,
        uint256 buyLiquidityFee,
        uint256 buyBurnFee,
        uint256 buyFundFee,
        uint256 sellRewardFee,
        uint256 sellLiquidityFee,
        uint256 sellBurnFee,
        uint256 sellFundFee,
        uint256 maxBuyAmount,
        uint256 maxSellAmount,
        uint256 maxWalletAmount,
        uint256 lpBurnFrequency,
        uint256 percentForLPBurn,
        bool addLiquidity
    );
    event CreationFeeUpdated(uint256 creationFee);
    event FeeRecipientUpdated(address indexed feeRecipient);

    constructor(
        address feeRecipient_,
        uint256 creationFee_,
        address router_,
        address dividendTrackerImpl_,
        address tokenDeployer_,
        uint16 requiredTokenSuffix_,
        address creationFeeToken_,
        uint256 creationFeeTokenAmount_
    ) {
        if (
            feeRecipient_ == address(0) || router_ == address(0)
                || dividendTrackerImpl_ == address(0) || tokenDeployer_ == address(0)
        ) {
            revert ZeroAddress();
        }

        feeRecipient = feeRecipient_;
        creationFee = creationFee_;
        creationFeeToken = creationFeeToken_;
        creationFeeTokenAmount = creationFeeTokenAmount_;
        router = router_;
        dividendTrackerImpl = dividendTrackerImpl_;
        tokenDeployer = tokenDeployer_;
        requiredTokenSuffix = requiredTokenSuffix_;
    }

    // ── 版本一：只部署代币 ───────────────────────────────────────────────

    function createToken(LaunchParams calldata params, bytes32 salt) external payable nonReentrant returns (address token) {
        return _create(params, salt, 0, 0, false);
    }

    // ── 版本二：部署 + 自动加池 + 开盘（全自动）─────────────────────────
    //
    // msg.value = creationFee + addLiquidityEth（多退少补）
    // 流程：Token mint 到 Factory → addLiquidity → LP 转黑洞锁死 →
    //       剩余币转项目方 → launch() 开盘 → owner 转项目方。
    // 限制：仅支持 currency == WBNB（原生加池）。
    function createTokenAndAddLiquidity(
        LaunchParams calldata params,
        bytes32 salt,
        uint256 addLiquidityTokens,
        uint256 addLiquidityEth
    )
        external
        payable
        nonReentrant
        returns (address token)
    {
        if (addLiquidityTokens == 0 || addLiquidityTokens > params.totalSupply) {
            revert InvalidParams();
        }
        if (msg.value < creationFee + addLiquidityEth) {
            revert InvalidFee();
        }
        return _create(params, salt, addLiquidityTokens, addLiquidityEth, true);
    }

    /// @notice 公开预览：把用户参数换算成 8 个费率 bps（前端实时预览用）。
    function previewFees(
        uint256 totalBuyTax,
        uint256 totalSellTax,
        uint256 rewardShare,
        uint256 liquidityShare,
        uint256 burnShare,
        uint256 fundShare
    )
        public
        pure
        returns (FeeSplit memory buy, FeeSplit memory sell)
    {
        if (
            totalBuyTax == 0 || totalBuyTax > MAX_TAX_BPS
                || totalSellTax == 0 || totalSellTax > MAX_TAX_BPS
                || rewardShare + liquidityShare + burnShare + fundShare != BPS_DENOMINATOR
        ) {
            revert InvalidParams();
        }

        buy = _splitFee(totalBuyTax, rewardShare, liquidityShare, burnShare);
        sell = _splitFee(totalSellTax, rewardShare, liquidityShare, burnShare);
    }

    function allTokensLength() external view returns (uint256) {
        return allTokens.length;
    }

    /// @notice 公开参数构建（前端挖盐/预览用）：返回与 createToken 完全一致的
    ///         四个数组 + inviters，配合 BananaToken creationCode 可离线计算
    ///         CREATE2 部署地址（靓号找盐）。
    function buildParams(LaunchParams calldata params, bool withLiquidity)
        external
        view
        returns (
            string[] memory stringParams,
            address[] memory addressParams,
            uint256[] memory numberParams,
            bool[] memory boolParams
        )
    {
        return (
            _buildStringParams(params),
            _buildAddressParams(params, withLiquidity),
            _buildNumberParams(params),
            _buildBoolParams(params)
        );
    }

    function setCreationFee(uint256 nextFee) external {
        if (msg.sender != feeRecipient) {
            revert InvalidFee();
        }
        creationFee = nextFee;
        emit CreationFeeUpdated(nextFee);
    }

    function setFeeRecipient(address nextFeeRecipient) external {
        if (msg.sender != feeRecipient) {
            revert InvalidFee();
        }
        if (nextFeeRecipient == address(0)) {
            revert ZeroAddress();
        }
        feeRecipient = nextFeeRecipient;
        emit FeeRecipientUpdated(nextFeeRecipient);
    }

    // ── Internal ─────────────────────────────────────────────────────────

    function _create(
        LaunchParams calldata params,
        bytes32 salt,
        uint256 addLiquidityTokens,
        uint256 addLiquidityEth,
        bool withLiquidity
    )
        private
        returns (address token)
    {
        _validateParams(params, withLiquidity);

        // 1) 发币费 + 加池资金
        _collectPayment(creationFee);

        // 2) 部署（经 BananaTokenDeployer，避免 TokenFactory 内嵌 BananaToken 代码超限；
        //    BananaToken 构造内部会 createPair + approve router + clone dividend tracker）
        token = IBananaTokenDeployer(tokenDeployer).deploy(
            _buildStringParams(params),
            _buildAddressParams(params, withLiquidity),
            _buildNumberParams(params),
            _buildBoolParams(params),
            new uint256[](0), // inviters：邀请机制关闭
            salt
        );

        // 5) 靓号校验：不匹配则整笔回滚（已部署的合约随交易一起丢弃）
        _requireTokenSuffix(token);

        if (withLiquidity) {
            _addLiquidityAndLaunch(token, params, addLiquidityTokens, addLiquidityEth);
        }

        // 6) 超额 BNB 退款
        uint256 required = creationFee + addLiquidityEth;
        if (msg.value > required) {
            (bool refunded,) = payable(msg.sender).call{ value: msg.value - required }("");
            if (!refunded) {
                revert InvalidFee();
            }
        }

        allTokens.push(token);

        FeeSplit memory buy = _splitFee(params.totalBuyTax, params.rewardShare, params.liquidityShare, params.burnShare);
        FeeSplit memory sell = _splitFee(params.totalSellTax, params.rewardShare, params.liquidityShare, params.burnShare);

        emit TokenCreated(
            msg.sender,
            token,
            params.name,
            params.symbol,
            params.totalSupply,
            buy.rewardFee,
            buy.liquidityFee,
            buy.burnFee,
            buy.platformFee + buy.fundFee,
            sell.rewardFee,
            sell.liquidityFee,
            sell.burnFee,
            sell.platformFee + sell.fundFee,
            params.maxBuyAmount,
            params.maxSellAmount,
            params.maxWalletAmount,
            params.lpBurnFrequency,
            params.percentForLPBurn,
            withLiquidity
        );
    }

    /// @notice 一键加池：Factory 持有全部 mint 的 token（ReceiveAddress=Factory），
    ///         加池后 LP 锁黑洞、剩余币转项目方、launch() 开盘、owner 转项目方。
    function _addLiquidityAndLaunch(
        address token,
        LaunchParams calldata params,
        uint256 addLiquidityTokens,
        uint256 addLiquidityEth
    )
        private
    {
        address wbnb = IUniswapV2Router02(router).WETH();
        address pair = IUniswapV2Factory(IUniswapV2Router02(router).factory()).getPair(token, wbnb);
        BananaToken bt = BananaToken(payable(token));

        if (!bt.approve(router, type(uint256).max)) revert TokenTransferFailed();
        (, , uint256 liquidity) = IUniswapV2Router02(router).addLiquidityETH{ value: addLiquidityEth }(
            token,
            addLiquidityTokens,
            0,
            0,
            address(this),
            block.timestamp
        );

        // LP 锁死（永久锁定，对标"LP 转黑洞 / 锁仓"）
        if (liquidity > 0 && pair != address(0)) {
            if (!IERC20(pair).transfer(LP_BLACK_HOLE, liquidity)) revert TokenTransferFailed();
        }

        // 剩余币转项目方
        uint256 remaining = bt.balanceOf(address(this));
        if (remaining > 0) {
            if (!bt.transfer(params.receiver, remaining)) revert TokenTransferFailed();
        }
        if (!bt.approve(router, 0)) revert TokenTransferFailed();

        // 开盘（owner 此时是 Factory）→ owner 转项目方
        bt.launch();
        bt.transferOwnership(params.receiver);
    }

    // ── 参数构建（拆成小函数，避免 _create 栈深，支持非 viaIR 编译）──────

    function _buildStringParams(LaunchParams calldata params) private pure returns (string[] memory stringParams) {
        stringParams = new string[](2);
        stringParams[0] = params.name;
        stringParams[1] = params.symbol;
    }

    function _buildAddressParams(LaunchParams calldata params, bool withLiquidity)
        private
        view
        returns (address[] memory addressParams)
    {
        address wbnb = IUniswapV2Router02(router).WETH();
        address currency = params.currency == address(0) ? wbnb : params.currency;
        address rewardToken = params.rewardToken == address(0) ? DEFAULT_REWARD_TOKEN : params.rewardToken;
        address fundAddress = params.fundAddress == address(0) ? feeRecipient : params.fundAddress;

        addressParams = new address[](8);
        addressParams[0] = currency;
        addressParams[1] = router;
        addressParams[2] = fundAddress;
        addressParams[3] = rewardToken;
        addressParams[4] = dividendTrackerImpl;
        addressParams[5] = withLiquidity ? address(this) : params.receiver; // ReceiveAddress
        // 一键版 owner 先归 Factory（负责 launch + 转余币），最后再转给项目方；
        // 纯部署版 owner 直接给项目方
        addressParams[6] = withLiquidity ? address(this) : params.receiver;
        // BananaToken uses this separate receiver for the fixed 20% platform share.
        addressParams[7] = feeRecipient;
    }

    function _buildNumberParams(LaunchParams calldata params) private pure returns (uint256[] memory numberParams) {
        // 平台 20% 固定内部计算。BananaToken 的兼容 fund 费率字段保存
        // platform + project fund 总和，末尾两个索引另传平台份额用于独立记账。
        FeeSplit memory buy = _splitFee(params.totalBuyTax, params.rewardShare, params.liquidityShare, params.burnShare);
        FeeSplit memory sell = _splitFee(params.totalSellTax, params.rewardShare, params.liquidityShare, params.burnShare);

        numberParams = new uint256[](22);
        numberParams[0] = params.totalSupply;
        numberParams[1] = buy.platformFee + buy.fundFee;
        numberParams[2] = buy.liquidityFee;
        numberParams[3] = buy.rewardFee;
        numberParams[4] = buy.burnFee;
        numberParams[5] = sell.platformFee + sell.fundFee;
        numberParams[6] = sell.liquidityFee;
        numberParams[7] = sell.rewardFee;
        numberParams[8] = sell.burnFee;
        numberParams[9] = _unlimitedIfZero(params.maxBuyAmount);
        numberParams[10] = _unlimitedIfZero(params.maxSellAmount);
        numberParams[11] = _unlimitedIfZero(params.maxWalletAmount);
        numberParams[12] = params.secondTime;
        numberParams[13] = params.killBlocks;
        numberParams[14] = params.airdropNumbs;
        numberParams[15] = 0; // _inviType：meme 傻瓜式，邀请机制关闭
        numberParams[16] = params.transferFee;
        numberParams[17] = params.mushHoldNum;
        numberParams[18] = params.lpBurnFrequency;
        numberParams[19] = params.percentForLPBurn;
        numberParams[20] = buy.platformFee;
        numberParams[21] = sell.platformFee;
    }

    function _buildBoolParams(LaunchParams calldata params) private view returns (bool[] memory boolParams) {
        address wbnb = IUniswapV2Router02(router).WETH();
        boolParams = new bool[](2);
        boolParams[0] = (params.currency == address(0) ? wbnb : params.currency) == wbnb; // currencyIsEth
        boolParams[1] = params.enableOffTrade;
    }

    function _splitFee(
        uint256 totalTax,
        uint256 rewardShare,
        uint256 liquidityShare,
        uint256 burnShare
    )
        private
        pure
        returns (FeeSplit memory split)
    {
        split.platformFee = (totalTax * PLATFORM_FEE_BPS) / BPS_DENOMINATOR;
        uint256 leftTax = totalTax - split.platformFee;
        split.rewardFee = (leftTax * rewardShare) / BPS_DENOMINATOR;
        split.liquidityFee = (leftTax * liquidityShare) / BPS_DENOMINATOR;
        split.burnFee = (leftTax * burnShare) / BPS_DENOMINATOR;
        split.fundFee = leftTax - split.rewardFee - split.liquidityFee - split.burnFee;
    }

    function _validateParams(LaunchParams calldata params, bool withLiquidity) private view {
        if (
            bytes(params.name).length == 0 || bytes(params.symbol).length == 0
                || params.totalSupply == 0 || params.receiver == address(0)
        ) {
            revert InvalidParams();
        }
        // 买卖税必须 > 0 且 ≤ 25%（与 previewFees 一致）
        if (
            params.totalBuyTax == 0 || params.totalBuyTax > MAX_TAX_BPS
                || params.totalSellTax == 0 || params.totalSellTax > MAX_TAX_BPS
                || params.rewardShare + params.liquidityShare + params.burnShare + params.fundShare != BPS_DENOMINATOR
        ) {
            revert InvalidParams();
        }
        // 一键加池仅支持原生 WBNB 交易对（addLiquidityETH 用 BNB 作货币侧）
        if (withLiquidity && params.currency != address(0) && params.currency != IUniswapV2Router02(router).WETH()) {
            revert InvalidParams();
        }
        if (params.airdropNumbs > 3 || params.transferFee > MAX_TAX_BPS || params.killBlocks > 100) {
            revert InvalidParams();
        }
        if (params.percentForLPBurn == 0 || params.percentForLPBurn > 100) {
            revert InvalidParams();
        }
        if (params.lpBurnFrequency < 1 hours) {
            revert InvalidParams();
        }
    }

    function _collectPayment(uint256 required) private {
        if (msg.value < required) {
            revert InvalidFee();
        }
        if (required > 0) {
            (bool paid,) = payable(feeRecipient).call{ value: required }("");
            if (!paid) {
                revert InvalidFee();
            }
        }
    }

    function _unlimitedIfZero(uint256 value) private pure returns (uint256) {
        return value == 0 ? type(uint256).max : value;
    }

    function _requireTokenSuffix(address token) private view {
        if (requiredTokenSuffix == 0) {
            return;
        }
        if (uint16(uint160(token)) != requiredTokenSuffix) {
            revert InvalidTokenSuffix(token, requiredTokenSuffix);
        }
    }
}

interface IUniswapV2Router02 {
    function WETH() external view returns (address);
    function factory() external view returns (address);
    function addLiquidityETH(
        address token,
        uint256 amountTokenDesired,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline
    )
        external
        payable
        returns (uint256 amountToken, uint256 amountETH, uint256 liquidity);
}

interface IUniswapV2Factory {
    function getPair(address tokenA, address tokenB) external view returns (address pair);
    function createPair(address tokenA, address tokenB) external returns (address pair);
}

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
}
