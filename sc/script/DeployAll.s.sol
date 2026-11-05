// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {Brlt} from "../src/Brlt.sol";
import {BrltX} from "../src/BrltX.sol";

/**
 * @title DeployAll
 * @notice Despliegue completo de BRLT + BrltX con traspaso de ownership atómico
 *         (AC-06): la clave efímera despliega y propone; la wallet admin acepta y
 *         queda como owner y minter en la misma sesión.
 *
 * Después del script:
 *   - owner(Brlt) = owner(BrltX) = admin;
 *   - minter(Brlt) = admin (la clave de despliegue no conserva privilegios);
 *   - BrltX apunta al BRLT desplegado;
 *   - `deployments/<chainId>.json` contiene las addresses.
 *
 * Variables de entorno:
 *   ADMIN_PRIVATE_KEY    (requerida)
 *   DEPLOYER_PRIVATE_KEY (opcional; si falta, se usa la admin)
 *   INITIAL_HOLDER       (opcional; por defecto la wallet admin)
 */
contract DeployAll is Script {
    struct Deployment {
        address brlt;
        address brltX;
        address admin;
        uint256 chainId;
        uint256 deployBlock;
    }

    function run() external returns (Brlt brlt, BrltX brltX) {
        uint256 adminKey = vm.envUint("ADMIN_PRIVATE_KEY");
        uint256 deployerKey = vm.envOr("DEPLOYER_PRIVATE_KEY", adminKey);
        address admin = vm.addr(adminKey);
        address deployer = vm.addr(deployerKey);
        address holder = vm.envOr("INITIAL_HOLDER", admin);

        require(admin != address(0), "ADMIN_PRIVATE_KEY invalida");

        vm.startBroadcast(deployerKey);
        brlt = new Brlt(holder, deployer);
        brltX = new BrltX(address(brlt), deployer);
        brlt.transferOwnership(admin);
        brltX.transferOwnership(admin);
        vm.stopBroadcast();

        vm.startBroadcast(adminKey);
        brlt.acceptOwnership();
        brltX.acceptOwnership();
        brlt.setMinter(admin);
        vm.stopBroadcast();

        require(brlt.owner() == admin, "Brlt: owner != admin");
        require(brltX.owner() == admin, "BrltX: owner != admin");
        require(brlt.minter() == admin, "Brlt: minter != admin");
        require(address(brltX.brlt()) == address(brlt), "BrltX: brlt incorrecto");
        require(brlt.decimals() == 18, "Brlt: decimales != 18");
        require(brlt.totalSupply() == brlt.INITIAL_SUPPLY(), "Brlt: supply inicial inesperado");
        require(brltX.lastFlowId() == 0, "BrltX: flujos preexistentes");
        require(brltX.totalEscrow() == 0, "BrltX: escrow preexistente");

        console2.log("=== Despliegue Superfluid Brlt Streaming v2 ===");
        console2.log("Chain id:      ", block.chainid);
        console2.log("Admin (owner): ", admin);
        console2.log("Deployer:      ", deployer);
        console2.log("Brlt:          ", address(brlt));
        console2.log("BrltX:         ", address(brltX));
        console2.log("Supply inicial:", brlt.totalSupply());
        console2.log("Bloque deploy: ", block.number);

        _write(Deployment(address(brlt), address(brltX), admin, block.chainid, block.number));
    }

    function _write(Deployment memory d) internal {
        string memory obj = "deployment";
        vm.serializeUint(obj, "chainId", d.chainId);
        vm.serializeUint(obj, "deployBlock", d.deployBlock);
        vm.serializeAddress(obj, "brlt", d.brlt);
        vm.serializeAddress(obj, "brltX", d.brltX);
        string memory json = vm.serializeAddress(obj, "owner", d.admin);
        vm.createDir("deployments", true);
        vm.writeJson(json, string.concat("deployments/", vm.toString(d.chainId), ".json"));
    }
}
