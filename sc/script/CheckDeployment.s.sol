// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {Brlt} from "../src/Brlt.sol";
import {BrltX} from "../src/BrltX.sol";

/**
 * @title CheckDeployment
 * @notice Verificación de solo lectura de un despliegue existente. No firma nada.
 *
 * Variables de entorno:
 *   BRLT_ADDRESS     (requerida)
 *   BRLTX_ADDRESS    (requerida)
 *   ADMIN_ADDRESS    (requerida) owner/minter esperado
 *
 * Uso:
 *   forge script script/CheckDeployment.s.sol --rpc-url $RPC_URL
 */
contract CheckDeployment is Script {
    function run() external view {
        address brltAddress = vm.envAddress("BRLT_ADDRESS");
        address brltXAddress = vm.envAddress("BRLTX_ADDRESS");
        address admin = vm.envAddress("ADMIN_ADDRESS");

        require(brltAddress.code.length > 0, "BRLT sin codigo");
        require(brltXAddress.code.length > 0, "BrltX sin codigo");

        Brlt brlt = Brlt(brltAddress);
        BrltX brltX = BrltX(brltXAddress);

        require(address(brltX.brlt()) == brltAddress, "BrltX no apunta al BRLT");
        require(brlt.owner() == admin, "owner(Brlt) != admin");
        require(brltX.owner() == admin, "owner(BrltX) != admin");
        require(brlt.minter() == admin, "minter(Brlt) != admin");
        require(brlt.decimals() == 18, "decimales != 18");
        require(brlt.totalSupply() == brlt.INITIAL_SUPPLY(), "supply inicial alterado");
        require(brlt.totalSupply() <= brlt.MAX_SUPPLY(), "supply por encima del tope");
        require(
            brlt.balanceOf(brltXAddress) == brltX.totalSupply() + brltX.totalEscrow(), "invariante de respaldo rota"
        );

        console2.log("=== Verificacion de despliegue ===");
        console2.log("Chain id:       ", block.chainid);
        console2.log("BRLT:           ", brltAddress);
        console2.log("BrltX:          ", brltXAddress);
        console2.log("Owner/minter:   ", admin);
        console2.log("Supply BRLT:    ", brlt.totalSupply());
        console2.log("Flujos creados: ", brltX.lastFlowId());
        console2.log("Escrow BrltX:   ", brltX.totalEscrow());
        console2.log("Respaldo BRLT:  ", brlt.balanceOf(brltXAddress));
    }
}
