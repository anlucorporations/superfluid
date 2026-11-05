// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/**
 * @title Brlt
 * @notice Token ERC-20 de nómina "CriptoPeso" (BRLT), 18 decimales.
 *
 * RF-01 (requerimientos.md):
 *  - supply inicial 10.000.000 BRLT;
 *  - tope duro de emisión 50.000.000 BRLT (AC-16);
 *  - `mint` restringido a un minter explícito designado por el owner;
 *  - `burn`/`burnFrom` para retirar circulante.
 *
 * El ownership se transfiere con `Ownable2Step`: el despliegue propone al admin y
 * el admin acepta en la misma sesión (AC-06), de modo que la clave efímera de
 * despliegue queda sin privilegios.
 */
contract Brlt is ERC20, ERC20Burnable, Ownable2Step {
    /// @notice Tope absoluto de emisión, en wei de BRLT (18 decimales).
    uint256 public constant MAX_SUPPLY = 50_000_000e18;

    /// @notice Emisión inicial del despliegue (RF-01).
    uint256 public constant INITIAL_SUPPLY = 10_000_000e18;

    /// @notice Cuenta autorizada a emitir, además del owner.
    address public minter;

    event MinterUpdated(address indexed previousMinter, address indexed newMinter);

    error ZeroAddress();
    error CapExceeded(uint256 requested, uint256 available);
    error NotMinter(address caller);

    modifier onlyMinter() {
        if (msg.sender != minter && msg.sender != owner()) revert NotMinter(msg.sender);
        _;
    }

    /**
     * @param initialHolder Cuenta que recibe el supply inicial.
     * @param initialOwner  Owner inicial del token (típicamente la wallet de despliegue).
     */
    constructor(address initialHolder, address initialOwner) ERC20("CriptoPeso", "BRLT") Ownable(initialOwner) {
        if (initialHolder == address(0)) revert ZeroAddress();
        if (initialOwner == address(0)) revert ZeroAddress();
        minter = initialOwner;
        _mint(initialHolder, INITIAL_SUPPLY);
    }

    /// @notice Fija el minter explícito. `address(0)` deshabilita la emisión delegada.
    function setMinter(address newMinter) external onlyOwner {
        address previous = minter;
        minter = newMinter;
        emit MinterUpdated(previous, newMinter);
    }

    /// @notice Emite BRLT respetando el tope de 50.000.000.
    function mint(address to, uint256 amount) external onlyMinter {
        if (to == address(0)) revert ZeroAddress();
        uint256 available = MAX_SUPPLY - totalSupply();
        if (amount > available) revert CapExceeded(amount, available);
        _mint(to, amount);
    }

    /**
     * @notice Quema BRLT del propio saldo (ERC20Burnable).
     * @dev Se conserva público porque cualquier titular puede destruir su propio
     *      saldo sin afectar a terceros; la variante `burnFrom` exige allowance.
     */
    function burn(uint256 amount) public override {
        super.burn(amount);
    }

    /// @dev `burnFrom` heredado de ERC20Burnable (allowance-based).
    function burnFrom(address account, uint256 amount) public override {
        super.burnFrom(account, amount);
    }
}
