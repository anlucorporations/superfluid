// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Brlt} from "../src/Brlt.sol";
import {BrltX} from "../src/BrltX.sol";

/**
 * @notice Handler de invariantes: ejecuta secuencias aleatorias de operaciones
 *         sobre BrltX (envolver, crear, pausar, reanudar, liquidar, terminar).
 */
contract BrltXHandler is Test {
    BrltX internal immutable brltX;
    Brlt internal immutable brlt;
    address internal immutable admin;
    address[] internal receivers;
    uint256[] internal flowIds;

    constructor(Brlt brlt_, BrltX brltX_, address admin_, address[] memory receivers_) {
        brlt = brlt_;
        brltX = brltX_;
        admin = admin_;
        receivers = receivers_;
    }

    function receiverCount() external view returns (uint256) {
        return receivers.length;
    }

    function flowCount() external view returns (uint256) {
        return flowIds.length;
    }

    function warp(uint256 delta) external {
        vm.warp(block.timestamp + bound(delta, 0, 12 hours));
    }

    function wrap(uint256 amountSeed, uint256 receiverSeed, uint256 durationSeed) external {
        uint64[4] memory durations = [uint64(6 days), uint64(15 days), uint64(30 days), uint64(90 days)];
        uint64 duration = durations[durationSeed % 4];
        address receiver = receivers[receiverSeed % receivers.length];
        uint256 amount = bound(amountSeed, 1e12, 5_000e18);

        vm.prank(admin);
        try brltX.wrapAndCreateFlow(amount, receiver, duration) returns (uint256 id) {
            flowIds.push(id);
        } catch {}
    }

    function upgradeDowngrade(uint256 amountSeed) external {
        uint256 balance = brlt.balanceOf(admin);
        uint256 amount = bound(amountSeed, 0, balance / 4);
        if (amount == 0) return;

        vm.prank(admin);
        try brltX.upgrade(amount) {} catch {}

        uint256 wrapped = brltX.balanceOf(admin);
        if (wrapped == 0) return;
        vm.prank(admin);
        try brltX.downgrade(wrapped / 2) {} catch {}
    }

    function pauseFlow(uint256 seed) external {
        if (flowIds.length == 0) return;
        uint256 id = flowIds[seed % flowIds.length];
        vm.prank(admin);
        try brltX.updateFlow(id, 0) {} catch {}
    }

    function resumeFlow(uint256 seed) external {
        if (flowIds.length == 0) return;
        uint256 id = flowIds[seed % flowIds.length];
        BrltX.Flow memory f = brltX.getFlow(id);
        if (!f.paused || f.rateBeforePause == 0) return;
        uint128 rate = uint128(f.rateBeforePause);
        vm.prank(admin);
        try brltX.updateFlow(id, rate) {} catch {}
    }

    function settleFlow(uint256 seed) external {
        if (flowIds.length == 0) return;
        uint256 id = flowIds[seed % flowIds.length];
        try brltX.settleFlow(id) {} catch {}
    }

    function deleteFlow(uint256 seed) external {
        if (flowIds.length == 0) return;
        uint256 id = flowIds[seed % flowIds.length];
        vm.prank(admin);
        try brltX.deleteFlow(id) {} catch {}
    }
}

contract InvariantsTest is Test {
    Brlt internal brlt;
    BrltX internal brltX;
    BrltXHandler internal handler;

    address internal admin;

    function setUp() public {
        vm.warp(1_700_000_000);
        admin = makeAddr("admin");

        brlt = new Brlt(admin, address(this));
        brltX = new BrltX(address(brlt), address(this));

        vm.prank(admin);
        brlt.approve(address(brltX), type(uint256).max);

        address[] memory receivers = new address[](3);
        receivers[0] = makeAddr("emp-1");
        receivers[1] = makeAddr("emp-2");
        receivers[2] = makeAddr("emp-3");

        handler = new BrltXHandler(brlt, brltX, admin, receivers);
        targetContract(address(handler));
    }

    /// @notice Todo el BRLT retenido respalda exactamente BrltX emitido + escrow.
    function invariant_backing() public view {
        assertEq(brlt.balanceOf(address(brltX)), brltX.totalSupply() + brltX.totalEscrow(), "respaldo roto");
    }

    /// @notice El escrow nunca supera el BRLT disponible en el contrato.
    function invariant_escrowCovered() public view {
        assertLe(brltX.totalEscrow(), brlt.balanceOf(address(brltX)), "escrow sin respaldo");
    }

    /// @notice Ningún flujo liquida más de lo depositado (shortfall imposible).
    function invariant_settledNeverExceedsDeposited() public view {
        uint256 last = brltX.lastFlowId();
        for (uint256 id = 1; id <= last; ++id) {
            BrltX.Flow memory f = brltX.getFlow(id);
            assertLe(f.settled, f.deposited, "settled > deposited");
            if (f.terminated) assertEq(f.flowRate, 0, "flujo terminado con tasa");
        }
    }

    /// @notice Un flujo terminado no vuelve a devengar.
    function invariant_terminatedFlowsDoNotAccrue() public view {
        uint256 last = brltX.lastFlowId();
        for (uint256 id = 1; id <= last; ++id) {
            BrltX.Flow memory f = brltX.getFlow(id);
            if (f.terminated) assertEq(brltX.getPending(id), 0, "devengo tras terminar");
        }
    }
}
