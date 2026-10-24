// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {BarloventoTx} from "./BarloventoTx.sol";

/// @title BarloventoFactory — registro de pares underlying→SuperToken (decisión D12)
/// @notice v1 registra un único par BRLT→BRLTx; la estructura deja abierta la
///         multi-moneda del ejercicio avanzado sin coste contractual adicional.
contract BarloventoFactory {
    using SafeERC20 for IERC20;

    struct Pair {
        address superToken; // BarloventoTx creado para ese subyacente
        bool exists;
    }

    address public owner;
    mapping(address underlying => Pair) public pairs;
    address[] public allUnderlyings;

    event PairRegistered(address indexed underlying, address indexed superToken, address indexed registrant);

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Factory: not owner");
        _;
    }

    /// @dev Despliega un BarloventoTx para `underlying` y lo registra. Revert si ya existe par.
    function createPair(address underlying, string calldata name, string calldata symbol)
        external
        onlyOwner
        returns (address)
    {
        require(underlying != address(0), "Factory: zero addr");
        require(!pairs[underlying].exists, "Factory: pair exists");

        BarloventoTx x = new BarloventoTx(underlying, name, symbol);
        pairs[underlying] = Pair(address(x), true);
        allUnderlyings.push(underlying);
        emit PairRegistered(underlying, address(x), msg.sender);
        return address(x);
    }

    function getSuperToken(address underlying) external view returns (address) {
        return pairs[underlying].superToken;
    }

    function allPairsLength() external view returns (uint256) {
        return allUnderlyings.length;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Factory: zero addr");
        owner = newOwner;
    }
}
