// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {Brlt} from "../src/Brlt.sol";

/**
 * @title DeployBrlt
 * @notice Despliega únicamente el token BRLT y completa el traspaso de ownership
 *         (propose desde la clave de despliegue + accept desde la wallet admin) en
 *         la misma sesión, dejando el minter en la wallet admin (AC-06).
 *
 * Variables de entorno:
 *   ADMIN_PRIVATE_KEY    (requerida) wallet administrativa final.
 *   DEPLOYER_PRIVATE_KEY (opcional)  clave efímera de despliegue; si falta se usa
 *                                    la del admin (modo de una sola clave).
 *   INITIAL_HOLDER       (opcional)  receptor del supply inicial; por defecto el admin.
 */
contract DeployBrlt is Script {
    function run() external returns (Brlt brlt) {
        uint256 adminKey = vm.envUint("ADMIN_PRIVATE_KEY");
        uint256 deployerKey = vm.envOr("DEPLOYER_PRIVATE_KEY", adminKey);
        address admin = vm.addr(adminKey);
        address deployer = vm.addr(deployerKey);
        address holder = vm.envOr("INITIAL_HOLDER", admin);

        require(admin != address(0), "ADMIN_PRIVATE_KEY invalida");

        vm.startBroadcast(deployerKey);
        brlt = new Brlt(holder, deployer);
        brlt.transferOwnership(admin);
        vm.stopBroadcast();

        vm.startBroadcast(adminKey);
        brlt.acceptOwnership();
        brlt.setMinter(admin); // la clave efimera no conserva privilegios de emision
        vm.stopBroadcast();

        require(brlt.owner() == admin, "Brlt: owner != admin");
        require(brlt.minter() == admin, "Brlt: minter != admin");
        require(brlt.decimals() == 18, "Brlt: decimales != 18");
        require(brlt.totalSupply() == brlt.INITIAL_SUPPLY(), "Brlt: supply inicial inesperado");

        console2.log("Brlt desplegado en:", address(brlt));
        console2.log("Owner/minter:", admin);
        console2.log("Holder supply inicial:", holder);
        console2.log("Chain id:", block.chainid);

        _write(address(brlt), admin);
    }

    function _write(address brltAddress, address admin) internal {
        string memory obj = "deploymentBrlt";
        vm.serializeUint(obj, "chainId", block.chainid);
        vm.serializeAddress(obj, "brlt", brltAddress);
        string memory json = vm.serializeAddress(obj, "owner", admin);
        vm.createDir("deployments", true);
        vm.writeJson(json, string.concat("deployments/brlt-", vm.toString(block.chainid), ".json"));
    }
}
