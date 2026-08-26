// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { BananaToken } from "./BananaToken.sol";

/// @notice CREATE2 部署器：TokenFactory 通过本合约部署 BananaToken。
///
/// 为什么需要独立部署器：`new BananaToken` 会把 BananaToken 的 creation code
/// 内嵌进调用合约，任何直接 new 的合约（含 TokenFactory）字节码都会超过
/// EIP-170 的 24576 字节上限。把部署动作隔离到本合约后，TokenFactory 只
/// 持有调用逻辑（< 10KB），本合约持有内嵌的 BananaToken 代码
/// （0.8.24 viaIR runs=1 压缩后 < 24KB）。
///
/// 权限：factory 一次性绑定（首次 setFactory 生效后不可更改），
///       仅绑定地址可部署；部署地址可预测（前端离线挖盐）。
contract BananaTokenDeployer {
    address public immutable admin;
    address public factory;

    error NotAdmin();
    error NotFactory();
    error ZeroAddress();
    error FactoryAlreadySet();

    constructor() {
        admin = msg.sender;
    }

    function setFactory(address factory_) external {
        if (msg.sender != admin) {
            revert NotAdmin();
        }
        if (factory_ == address(0)) {
            revert ZeroAddress();
        }
        if (factory != address(0)) {
            revert FactoryAlreadySet();
        }
        factory = factory_;
    }

    function deploy(
        string[] calldata stringParams,
        address[] calldata addressParams,
        uint256[] calldata numberParams,
        bool[] calldata boolParams,
        uint256[] calldata inviters,
        bytes32 salt
    )
        external
        returns (address token)
    {
        if (msg.sender != factory) {
            revert NotFactory();
        }

        token = address(
            new BananaToken{ salt: salt }(
                stringParams,
                addressParams,
                numberParams,
                boolParams,
                inviters
            )
        );
    }

}
