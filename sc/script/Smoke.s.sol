// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {Brlt} from "../src/Brlt.sol";
import {BrltX} from "../src/BrltX.sol";

/**
 * @title Smoke
 * @notice Prueba de humo no destructiva sobre un despliegue real: crea un flujo
 *         pequeño y lo termina en la misma sesión, comprobando tasa, devengo y
 *         devolución del escrow. Sirve para H2 (red Besu) y H7 (preview).
 *
 * Variables de entorno:
 *   ADMIN_PRIVATE_KEY  (requerida) wallet con BRLT y CC para gas.
 *   BRLT_ADDRESS       (requerida)
 *   BRLTX_ADDRESS      (requerida)
 *   EMPLOYEE_ADDRESS   (requerida) receptor de prueba.
 *   SMOKE_AMOUNT       (opcional)  por defecto 10 BRLT.
 *   SMOKE_DURATION     (opcional)  por defecto 6 días (duración permitida).
 */
contract Smoke is Script {
    function run() external {
        uint256 adminKey = vm.envUint("ADMIN_PRIVATE_KEY");
        address admin = vm.addr(adminKey);
        Brlt brlt = Brlt(vm.envAddress("BRLT_ADDRESS"));
        BrltX brltX = BrltX(vm.envAddress("BRLTX_ADDRESS"));
        address employee = vm.envAddress("EMPLOYEE_ADDRESS");
        uint256 amount = vm.envOr("SMOKE_AMOUNT", uint256(10e18));
        uint64 duration = uint64(vm.envOr("SMOKE_DURATION", uint256(6 days)));

        require(brlt.balanceOf(admin) >= amount, "admin sin BRLT suficiente");
        uint256 escrowBefore = brltX.totalEscrow();

        vm.startBroadcast(adminKey);
        brlt.approve(address(brltX), amount);
        uint256 flowId = brltX.wrapAndCreateFlow(amount, employee, duration);
        vm.stopBroadcast();

        BrltX.Flow memory created = brltX.getFlow(flowId);
        require(created.receiver == employee, "receptor incorrecto");
        require(created.deposited == amount, "deposito incorrecto");
        require(created.flowRate == uint128(amount / duration), "tasa incorrecta");
        require(brltX.totalEscrow() == escrowBefore + amount, "escrow no cuadra");

        vm.startBroadcast(adminKey);
        (uint256 paid, uint256 returned) = brltX.deleteFlow(flowId);
        vm.stopBroadcast();

        require(paid + returned == amount, "suma pago+devolucion");
        require(brltX.getFlow(flowId).terminated, "flujo no terminado");
        require(brltX.totalEscrow() == escrowBefore, "escrow no restaurado");
        require(
            brlt.balanceOf(address(brltX)) == brltX.totalSupply() + brltX.totalEscrow(), "invariante de respaldo rota"
        );

        console2.log("=== Smoke test OK ===");
        console2.log("Flow id:      ", flowId);
        console2.log("Receptor:     ", employee);
        console2.log("Depositado:   ", amount);
        console2.log("Devengado:    ", paid);
        console2.log("Devuelto:     ", returned);
        console2.log("Escrow final: ", brltX.totalEscrow());
    }
}
