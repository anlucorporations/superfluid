// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {Euro} from "../src/Euro.sol";

/// Despliegue simple del token EUR (RF-01). Preflight de red incluido.
contract DeployEuroScript is Script {
    function run() public returns (Euro) {
        _preflight();
        vm.startBroadcast();
        Euro eur = new Euro(10_000_000e18);
        vm.stopBroadcast();
        console.log("EUR deployed at:", address(eur));
        return eur;
    }

    function _preflight() internal view {
        uint256 expected = vm.envOr("CHAIN_ID", uint256(81234));
        require(block.chainid == expected, "preflight: chainId mismatch");
    }
}
