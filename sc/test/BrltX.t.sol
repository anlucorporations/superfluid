// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Brlt} from "../src/Brlt.sol";
import {BrltX} from "../src/BrltX.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ERC20Mock} from "@openzeppelin/contracts/mocks/token/ERC20Mock.sol";

contract BrltXTest is Test {
    Brlt internal brlt;
    BrltX internal brltX;

    address internal admin;
    address internal employee;
    address internal employee2;
    address internal outsider;

    uint64 internal constant SIX_DAYS = 6 days;
    uint64 internal constant FIFTEEN_DAYS = 15 days;
    uint64 internal constant THIRTY_DAYS = 30 days;
    uint64 internal constant NINETY_DAYS = 90 days;

    uint256 internal constant AMOUNT = 2_000e18;
    /// @dev 2.000 BRLT / 30 días con floor al wei (requerimientos.md §5.1).
    uint256 internal constant RATE_30D = 771_604_938_271_604;

    uint256 internal start;

    function setUp() public {
        admin = makeAddr("admin");
        employee = makeAddr("employee");
        employee2 = makeAddr("employee2");
        outsider = makeAddr("outsider");

        start = 1_700_000_000;
        vm.warp(start);

        brlt = new Brlt(admin, address(this));
        brltX = new BrltX(address(brlt), address(this));

        vm.prank(admin);
        brlt.approve(address(brltX), type(uint256).max);
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    function _assertBacking() internal view {
        assertEq(brlt.balanceOf(address(brltX)), brltX.totalSupply() + brltX.totalEscrow(), "invariante de respaldo");
    }

    function _createFlow(uint256 amount, address receiver, uint64 duration) internal returns (uint256 id) {
        vm.prank(admin);
        id = brltX.wrapAndCreateFlow(amount, receiver, duration);
    }

    // ------------------------------------------------------------------
    // Envoltura 1:1
    // ------------------------------------------------------------------

    function testUpgradeDowngradeRoundTrip() public {
        uint256 before = brlt.balanceOf(admin);

        vm.startPrank(admin);
        brltX.upgrade(500e18);
        assertEq(brltX.balanceOf(admin), 500e18);
        assertEq(brlt.balanceOf(admin), before - 500e18);

        brltX.downgrade(200e18);
        vm.stopPrank();

        assertEq(brltX.balanceOf(admin), 300e18);
        assertEq(brlt.balanceOf(admin), before - 300e18);
        _assertBacking();
    }

    function testDowngradeRequiresBalance() public {
        vm.prank(outsider);
        vm.expectRevert();
        brltX.downgrade(1e18);
    }

    // ------------------------------------------------------------------
    // Creación de flujos
    // ------------------------------------------------------------------

    function testWrapAndCreateFlowComputesFloorRate() public {
        vm.expectEmit(true, true, true, true);
        emit BrltX.FlowCreated(1, admin, employee, AMOUNT, RATE_30D, uint64(start + THIRTY_DAYS));

        uint256 id = _createFlow(AMOUNT, employee, THIRTY_DAYS);

        BrltX.Flow memory f = brltX.getFlow(id);
        assertEq(id, 1);
        assertEq(f.flowRate, RATE_30D);
        assertEq(f.deposited, AMOUNT);
        assertEq(f.startedAt, uint64(start));
        assertEq(f.endsAt, uint64(start + THIRTY_DAYS));
        assertEq(f.sender, admin);
        assertEq(f.receiver, employee);
        assertFalse(f.paused);
        assertFalse(f.terminated);

        assertEq(brltX.totalEscrow(), AMOUNT);
        assertEq(brltX.totalSupply(), 0);
        assertEq(brltX.getRealtimeBalance(employee), 0);
        assertEq(brltX.getFlowIdsByReceiver(employee).length, 1);
        assertEq(brltX.getFlowIdsBySender(admin).length, 1);
        assertEq(brltX.getFlowIdsByPair(admin, employee).length, 1);
        _assertBacking();
    }

    function testWrapRejectsInvalidInputs() public {
        vm.startPrank(admin);

        vm.expectRevert(BrltX.ZeroAmount.selector);
        brltX.wrapAndCreateFlow(0, employee, THIRTY_DAYS);

        vm.expectRevert(BrltX.ZeroAddress.selector);
        brltX.wrapAndCreateFlow(AMOUNT, address(0), THIRTY_DAYS);

        vm.expectRevert(BrltX.SelfFlow.selector);
        brltX.wrapAndCreateFlow(AMOUNT, admin, THIRTY_DAYS);

        vm.expectRevert(abi.encodeWithSelector(BrltX.InvalidDuration.selector, uint64(7 days)));
        brltX.wrapAndCreateFlow(AMOUNT, employee, 7 days);

        vm.expectRevert(abi.encodeWithSelector(BrltX.InvalidDuration.selector, uint64(0)));
        brltX.wrapAndCreateFlow(AMOUNT, employee, 0);

        vm.expectRevert(BrltX.ZeroFlowRate.selector);
        brltX.wrapAndCreateFlow(100, employee, THIRTY_DAYS); // 100 wei / 30 d = 0 wei/s

        vm.stopPrank();
    }

    function testDurationAllowlistIsOwnerManaged() public {
        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, outsider));
        brltX.setDurationAllowed(7 days, true);

        brltX.setDurationAllowed(7 days, true);
        uint256 id = _createFlow(AMOUNT, employee, 7 days);
        assertEq(brltX.getFlow(id).endsAt, uint64(start + 7 days));
    }

    // ------------------------------------------------------------------
    // Devengo y liquidación
    // ------------------------------------------------------------------

    function testAccrualIsLinear() public {
        uint256 id = _createFlow(AMOUNT, employee, THIRTY_DAYS);
        vm.warp(start + 10 days);

        uint256 expected = RATE_30D * 10 days;
        assertEq(brltX.getPending(id), expected);
        assertEq(brltX.getRealtimeBalance(employee), expected);
    }

    function testSettleBeforeEndReverts() public {
        uint256 id = _createFlow(AMOUNT, employee, THIRTY_DAYS);
        vm.expectRevert(abi.encodeWithSelector(BrltX.FlowNotExpired.selector, id, uint64(start + THIRTY_DAYS)));
        brltX.settleFlow(id);
    }

    function testPublicSettleAfterExpiryPaysAndRefunds() public {
        uint256 id = _createFlow(AMOUNT, employee, THIRTY_DAYS);
        uint256 expectedPaid = RATE_30D * THIRTY_DAYS;
        uint256 expectedRefund = AMOUNT - expectedPaid;
        uint256 adminBefore = brlt.balanceOf(admin);

        vm.warp(start + THIRTY_DAYS);

        // AC-02: un tercero sin rol puede liquidar.
        vm.prank(outsider);
        (uint256 paid, uint256 returned) = brltX.settleFlow(id);

        assertEq(paid, expectedPaid);
        assertEq(returned, expectedRefund);
        assertEq(brltX.balanceOf(employee), expectedPaid);
        assertEq(brlt.balanceOf(admin), adminBefore + expectedRefund);

        BrltX.Flow memory f = brltX.getFlow(id);
        assertTrue(f.terminated);
        assertEq(brltX.totalEscrow(), 0);
        assertEq(brltX.getRealtimeBalance(employee), expectedPaid);
        _assertBacking();

        vm.expectRevert(abi.encodeWithSelector(BrltX.FlowTerminated.selector, id));
        brltX.settleFlow(id);
    }

    function testSettleByPairOverload() public {
        _createFlow(AMOUNT, employee, THIRTY_DAYS);
        vm.warp(start + THIRTY_DAYS);
        (uint256 paid,) = brltX.settleFlow(admin, employee);
        assertEq(paid, RATE_30D * THIRTY_DAYS);
        _assertBacking();
    }

    function testAccrualCapsAtDeposited() public {
        uint256 id = _createFlow(AMOUNT, employee, THIRTY_DAYS);
        vm.warp(start + 365 days);
        BrltX.Flow memory f = brltX.getFlow(id);
        // Pasado `endsAt` el devengo se congela: nunca supera lo depositado.
        assertEq(brltX.getPending(id), RATE_30D * THIRTY_DAYS);
        assertLe(brltX.getPending(id), f.deposited);
    }

    // ------------------------------------------------------------------
    // Pausa y reanudación
    // ------------------------------------------------------------------

    function testPauseFreezesAccrualAndResumeProlongsEndsAt() public {
        uint256 id = _createFlow(AMOUNT, employee, THIRTY_DAYS);

        vm.warp(start + 5 days);
        vm.prank(admin);
        brltX.updateFlow(id, 0);

        BrltX.Flow memory paused = brltX.getFlow(id);
        assertTrue(paused.paused);
        assertEq(paused.flowRate, 0);
        assertEq(brltX.balanceOf(employee), RATE_30D * 5 days);
        assertEq(brltX.getPending(id), 0);

        vm.warp(start + 8 days); // 3 días en pausa
        assertEq(brltX.getPending(id), 0);
        assertEq(brltX.getRealtimeBalance(employee), RATE_30D * 5 days);

        vm.prank(admin);
        brltX.updateFlow(id, uint128(RATE_30D));

        BrltX.Flow memory resumed = brltX.getFlow(id);
        assertFalse(resumed.paused);
        assertEq(resumed.flowRate, RATE_30D);
        assertEq(resumed.endsAt, uint64(start + THIRTY_DAYS + 3 days));

        vm.warp(resumed.endsAt);
        brltX.settleFlow(id);
        assertEq(brltX.balanceOf(employee), RATE_30D * THIRTY_DAYS);
        _assertBacking();
    }

    function testPausedFlowCannotBeSettled() public {
        uint256 id = _createFlow(AMOUNT, employee, THIRTY_DAYS);
        vm.prank(admin);
        brltX.updateFlow(id, 0);
        vm.warp(start + 60 days);

        vm.expectRevert(abi.encodeWithSelector(BrltX.FlowPaused.selector, id));
        brltX.settleFlow(id);
    }

    function testPauseTwiceReverts() public {
        uint256 id = _createFlow(AMOUNT, employee, THIRTY_DAYS);
        vm.startPrank(admin);
        brltX.updateFlow(id, 0);
        vm.expectRevert(abi.encodeWithSelector(BrltX.FlowAlreadyPaused.selector, id));
        brltX.updateFlow(id, 0);
        vm.stopPrank();
    }

    function testUpdateExpiredFlowReverts() public {
        uint256 id = _createFlow(AMOUNT, employee, THIRTY_DAYS);
        vm.warp(start + THIRTY_DAYS);
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(BrltX.FlowExpiredAlready.selector, id));
        brltX.updateFlow(id, uint128(RATE_30D));
    }

    function testRateChangeRecalculatesEndsAt() public {
        uint256 id = _createFlow(AMOUNT, employee, THIRTY_DAYS);
        vm.warp(start + 10 days);

        uint128 doubled = uint128(RATE_30D * 2);
        vm.prank(admin);
        brltX.updateFlow(id, doubled);

        BrltX.Flow memory f = brltX.getFlow(id);
        uint256 remaining = AMOUNT - RATE_30D * 10 days;
        assertEq(f.flowRate, doubled);
        assertEq(f.endsAt, uint64(start + 10 days) + uint64(remaining / doubled));
    }

    function testUpdateOnlySender() public {
        uint256 id = _createFlow(AMOUNT, employee, THIRTY_DAYS);
        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSelector(BrltX.NotFlowSender.selector, id, outsider));
        brltX.updateFlow(id, 0);
    }

    // ------------------------------------------------------------------
    // Terminación
    // ------------------------------------------------------------------

    function testDeleteFlowRefundsRemainder() public {
        uint256 id = _createFlow(AMOUNT, employee, THIRTY_DAYS);
        vm.warp(start + 2 days);

        uint256 adminBefore = brlt.balanceOf(admin);
        uint256 expectedPaid = RATE_30D * 2 days;

        vm.prank(admin);
        (uint256 paid, uint256 returned) = brltX.deleteFlow(id);

        assertEq(paid, expectedPaid);
        assertEq(returned, AMOUNT - expectedPaid);
        assertEq(brlt.balanceOf(admin), adminBefore + returned);
        assertEq(brltX.balanceOf(employee), expectedPaid);
        assertEq(brltX.totalEscrow(), 0);
        assertTrue(brltX.getFlow(id).terminated);
        _assertBacking();
    }

    function testDeleteOnlySender() public {
        uint256 id = _createFlow(AMOUNT, employee, THIRTY_DAYS);
        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSelector(BrltX.NotFlowSender.selector, id, outsider));
        brltX.deleteFlow(id);

        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSelector(BrltX.NoFlowForPair.selector, outsider, employee));
        brltX.deleteFlow(employee);
    }

    function testDeleteTerminatedReverts() public {
        uint256 id = _createFlow(AMOUNT, employee, THIRTY_DAYS);
        vm.prank(admin);
        brltX.deleteFlow(id);

        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(BrltX.FlowTerminated.selector, id));
        brltX.deleteFlow(id);
    }

    function testDeletePausedFlowReturnsWholeEscrow() public {
        uint256 id = _createFlow(AMOUNT, employee, THIRTY_DAYS);
        vm.warp(start + 5 days);
        vm.startPrank(admin);
        brltX.updateFlow(id, 0);
        (uint256 paid, uint256 returned) = brltX.deleteFlow(id);
        vm.stopPrank();

        assertEq(paid, 0);
        assertEq(returned, AMOUNT - RATE_30D * 5 days);
        _assertBacking();
    }

    // ------------------------------------------------------------------
    // Cambio de receptor (AC-03)
    // ------------------------------------------------------------------

    function testChangeReceiverIsAtomic() public {
        uint256 id = _createFlow(AMOUNT, employee, THIRTY_DAYS);
        uint64 originalEnds = uint64(start + THIRTY_DAYS);
        vm.warp(start + 7 days);

        vm.prank(admin);
        uint256 newId = brltX.changeReceiver(id, employee2);

        assertEq(newId, 2);
        BrltX.Flow memory oldFlow = brltX.getFlow(id);
        assertTrue(oldFlow.terminated);
        assertEq(brltX.balanceOf(employee), RATE_30D * 7 days);

        BrltX.Flow memory nf = brltX.getFlow(newId);
        assertEq(nf.sender, admin);
        assertEq(nf.receiver, employee2);
        assertEq(nf.flowRate, RATE_30D);
        assertEq(nf.endsAt, originalEnds);
        assertEq(nf.deposited, AMOUNT - RATE_30D * 7 days);
        assertEq(brltX.totalEscrow(), nf.deposited);
        assertEq(brltX.getFlowIdsByReceiver(employee2).length, 1);
        _assertBacking();
    }

    function testChangeReceiverRejectsNonSenderAndSameReceiver() public {
        uint256 id = _createFlow(AMOUNT, employee, THIRTY_DAYS);

        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSelector(BrltX.NotFlowSender.selector, id, outsider));
        brltX.changeReceiver(id, employee2);

        vm.prank(admin);
        vm.expectRevert(BrltX.SameReceiver.selector);
        brltX.changeReceiver(id, employee);
    }

    function testChangeReceiverDocOverload() public {
        uint256 id = _createFlow(AMOUNT, employee, THIRTY_DAYS);
        vm.warp(start + 10 days);

        vm.prank(admin);
        uint256 newId = brltX.changeReceiver(employee, employee2, 1_000e18, THIRTY_DAYS);

        assertTrue(brltX.getFlow(id).terminated);
        BrltX.Flow memory nf = brltX.getFlow(newId);
        assertEq(nf.receiver, employee2);
        assertEq(nf.deposited, 1_000e18);
        assertEq(nf.endsAt, uint64(start + 10 days + THIRTY_DAYS));
        _assertBacking();
    }

    // ------------------------------------------------------------------
    // Multi-flujo por empleado (AC-23)
    // ------------------------------------------------------------------

    function testMultipleConcurrentFlowsPerReceiver() public {
        uint256 a = _createFlow(AMOUNT, employee, THIRTY_DAYS);
        uint256 b = _createFlow(1_000e18, employee, SIX_DAYS);
        assertEq(a, 1);
        assertEq(b, 2);

        uint256[] memory ids = brltX.getFlowIdsByReceiver(employee);
        assertEq(ids.length, 2);
        assertEq(ids[0], a);
        assertEq(ids[1], b);

        // `getFlow(sender, receiver)` devuelve el más reciente.
        assertEq(brltX.getFlow(admin, employee).deposited, 1_000e18);

        vm.warp(start + 3 days);
        uint256 rate6 = 1_000e18 / uint256(SIX_DAYS);
        assertEq(brltX.getRealtimeBalance(employee), RATE_30D * 3 days + rate6 * 3 days);
        _assertBacking();
    }

    function testLatestFlowOverloadsWithSeveralFlows() public {
        _createFlow(AMOUNT, employee, THIRTY_DAYS);
        uint256 second = _createFlow(1_000e18, employee, SIX_DAYS);

        vm.prank(admin);
        brltX.updateFlow(employee, 0);
        assertTrue(brltX.getFlow(second).paused);
        assertFalse(brltX.getFlow(1).paused);
    }

    // ------------------------------------------------------------------
    // Pausa de emergencia (AC-07)
    // ------------------------------------------------------------------

    function testEmergencyPauseBlocksCreationButNotExits() public {
        uint256 id = _createFlow(AMOUNT, employee, THIRTY_DAYS);

        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, outsider));
        brltX.pause();

        brltX.pause();

        vm.prank(admin);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        brltX.wrapAndCreateFlow(AMOUNT, employee2, THIRTY_DAYS);

        vm.prank(admin);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        brltX.updateFlow(id, 0);

        vm.prank(admin);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        brltX.changeReceiver(id, employee2);

        // Las salidas siguen disponibles: liquidar, terminar, cobrar y envolver.
        vm.warp(start + THIRTY_DAYS);
        brltX.settleFlow(id);
        assertGt(brltX.balanceOf(employee), 0);

        uint256 cobrado = brltX.balanceOf(employee);
        vm.prank(employee);
        brltX.downgrade(cobrado);
        assertGt(brlt.balanceOf(employee), 0);

        vm.prank(admin);
        brltX.upgrade(100e18);

        brltX.unpause();
        uint256 id2 = _createFlow(AMOUNT, employee2, THIRTY_DAYS);
        assertEq(brltX.getFlow(id2).receiver, employee2);
        _assertBacking();
    }

    // ------------------------------------------------------------------
    // Cobro del empleado (RF-21)
    // ------------------------------------------------------------------

    function testEmployeeCobroViaDowngrade() public {
        uint256 id = _createFlow(AMOUNT, employee, THIRTY_DAYS);
        vm.warp(start + THIRTY_DAYS);
        brltX.settleFlow(id);

        uint256 brltxBalance = brltX.balanceOf(employee);
        assertGt(brltxBalance, 0);

        vm.prank(employee);
        brltX.downgrade(brltxBalance);

        assertEq(brltX.balanceOf(employee), 0);
        assertEq(brlt.balanceOf(employee), brltxBalance);
        _assertBacking();
    }

    function testRealtimeBalanceIncludesWalletBalance() public {
        vm.prank(admin);
        brltX.upgrade(100e18);
        vm.prank(admin);
        brltX.transfer(employee, 40e18);

        _createFlow(AMOUNT, employee, THIRTY_DAYS);
        vm.warp(start + 1 days);

        assertEq(brltX.getRealtimeBalance(employee), 40e18 + RATE_30D * 1 days);
    }

    // ------------------------------------------------------------------
    // Varios
    // ------------------------------------------------------------------

    function testUnknownFlowReverts() public {
        vm.expectRevert(abi.encodeWithSelector(BrltX.UnknownFlow.selector, 99));
        brltX.settleFlow(99);

        vm.expectRevert(abi.encodeWithSelector(BrltX.NoFlowForPair.selector, admin, employee));
        brltX.settleFlow(admin, employee);
    }

    function testGetFlowForUnknownPairReturnsEmpty() public view {
        BrltX.Flow memory f = brltX.getFlow(admin, employee);
        assertEq(f.sender, address(0));
        assertEq(f.deposited, 0);
    }

    function testRecoverForeignToken() public {
        ERC20Mock other = new ERC20Mock();
        other.mint(address(brltX), 5e18);

        brltX.recoverForeignToken(other, outsider, 5e18);
        assertEq(other.balanceOf(outsider), 5e18);

        vm.expectRevert(BrltX.ProtectedToken.selector);
        brltX.recoverForeignToken(brlt, outsider, 1);
    }

    function testBrltBackingTracksEscrow() public {
        assertEq(brltX.brltBacking(), 0);
        _createFlow(AMOUNT, employee, THIRTY_DAYS);
        assertEq(brltX.brltBacking(), AMOUNT);
        _assertBacking();
    }

    function testFuzzFlowMath(uint256 amount, uint64 duration, uint64 elapsed) public {
        duration = uint64(bound(duration, 1, uint64(365 days)));
        amount = bound(amount, duration, 1_000_000e18);
        elapsed = uint64(bound(elapsed, 0, duration));

        brltX.setDurationAllowed(duration, true);
        uint256 id = _createFlow(amount, employee, duration);

        BrltX.Flow memory f = brltX.getFlow(id);
        uint128 expectedRate = uint128(amount / duration);
        assertEq(f.flowRate, expectedRate);
        assertLe(uint256(f.flowRate) * duration, amount);

        vm.warp(start + elapsed);
        assertEq(brltX.getPending(id), uint256(expectedRate) * elapsed);

        if (elapsed == duration) {
            (uint256 paid, uint256 returned) = brltX.settleFlow(id);
            assertEq(paid, uint256(expectedRate) * duration);
            assertEq(paid + returned, amount);
        }
        _assertBacking();
    }
}
