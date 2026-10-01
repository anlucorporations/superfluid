// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title Euro — Token ERC20 de prueba "EUR" (CodeCrypto Academy)
/// @notice Tokens de prueba SIN respaldo ni valor. Ver LICENSE.md / disclaimer.
/// @dev RF-01, CU-10, D11: hard-cap 10_000_000e18 enforced en el supply total.
contract Euro is ERC20, Ownable {
    /// @dev Convención de producto: 18 decimales (diccionario_datos.md).
    uint256 public constant MAX_SUPPLY = 10_000_000e18;

    /// @param initialSupply EUR minteados al deployer (<= MAX_SUPPLY).
    constructor(uint256 initialSupply) ERC20("Euro (test token)", "EUR") Ownable(msg.sender) {
        require(initialSupply <= MAX_SUPPLY, "EUR: over cap");
        if (initialSupply > 0) {
            _mint(msg.sender, initialSupply);
        }
    }

    /// @notice Owner puede mintear mientras el total no supere el hard-cap.
    function mint(address to, uint256 amount) external onlyOwner {
        require(totalSupply() + amount <= MAX_SUPPLY, "EUR: over cap");
        _mint(to, amount);
    }

    /// @notice Owner puede quemar desde su propio saldo (operación de tesorería simple v1).
    function burn(uint256 amount) external onlyOwner {
        _burn(msg.sender, amount);
    }
}
