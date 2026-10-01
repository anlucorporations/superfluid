// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Euro} from "../src/Euro.sol";
import {EuroX} from "../src/EuroX.sol";

/// PoC LECTURA-ONLY (no modifica src): verificación de sospechas de la auditoría Solidity.
contract POC is Test {
    int96 internal constant RATE = 771604938271604;
    Euro internal eur;
    EuroX internal eurx;
    address owner = address(0xA11CE);
    address R1 = makeAddr("r1");
    address R2 = makeAddr("r2");

    function setUp() public {
        vm.prank(owner);
        eur = new Euro(10_000_000e18);
        vm.prank(owner);
        eurx = new EuroX(address(eur), "EURx", "EURx");
        vm.startPrank(owner);
        eur.transfer(R1, 100 ether);
        eur.transfer(R2, 100 ether);
        vm.stopPrank();
    }

    function _wrap(address who, uint256 amt) internal {
        vm.startPrank(who);
        eur.approve(address(eurx), amt);
        eurx.upgradeTo(amt);
        vm.stopPrank();
    }

    // A) residuos del prorrateo quedan en pendingPool: nadie puede reclamarlos
    function testA_pendingPool_orphan() public {
        address poor = makeAddr("poor");
        vm.prank(owner); eur.transfer(poor, 10 ether);
        _wrap(poor, 10 ether);
        vm.startPrank(poor);
        eurx.createFlow(R1, RATE);
        eurx.createFlow(R2, RATE);
        vm.stopPrank();
        vm.warp(block.timestamp + 10 days);
        vm.prank(owner);
        eurx.settle(poor);
        uint256 e1 = eurx.earnedUnclaimed(R1, poor);
        uint256 e2 = eurx.earnedUnclaimed(R2, poor);
        console.log("A shares e1/e2/sum:", e1, e2, e1 + e2);
        vm.prank(R1); eurx.claimSettled(poor);
        vm.prank(R2); eurx.claimSettled(poor);
        console.log("A supply vs underlying after claims:", eurx.totalSupplyX(), eur.balanceOf(address(eurx)));
        assertEq(eurx.totalSupplyX(), eur.balanceOf(address(eurx)), "custodia 1:1");
    }

    // B) cerrar flow PAUSADO libera depósito sin materializar: el emisor pode desenvolver TODO
    function testB_closePaused_freesDepositWithoutAccrual() public {
        address a = makeAddr("a");
        vm.prank(owner); eur.transfer(a, 6 ether);
        _wrap(a, 6 ether);
        vm.startPrank(a);
        eurx.createFlow(R1, RATE);
        vm.warp(block.timestamp + 3600);
        eurx.pauseFlow(R1);
        vm.warp(block.timestamp + 3600);
        eurx.closeFlow(R1);
        vm.stopPrank();
        (,, uint256 dep,,) = eurx.getAccountInfo(a);
        console.log("B dep after close(paused):", dep);
        console.log("B real after:", eurx.realBalanceOf(a), "earned:", eurx.earnedUnclaimed(R1, a));
        vm.prank(a);
        eurx.downgradeTo(eurx.realBalanceOf(a));
        console.log("B real after full downgrade:", eurx.realBalanceOf(a), "earned still:", eurx.earnedUnclaimed(R1, a));
        console.log("B supply vs underlying:", eurx.totalSupplyX(), eur.balanceOf(address(eurx)));
        assertEq(eurx.totalSupplyX(), eur.balanceOf(address(eurx)));
    }

    // C) reabrir flow Closed con credito pendiente no cubre ese credito
    function testC_reopenDoesNotCoverExistingCredit() public {
        address a = makeAddr("a");
        vm.prank(owner); eur.transfer(a, 1000 ether);
        _wrap(a, 1000e18);
        vm.startPrank(a);
        eurx.createFlow(R1, RATE);
        vm.warp(block.timestamp + 100000);
        eurx.closeFlow(R1);
        uint256 credit = eurx.earnedUnclaimed(R1, a);
        console.log("C outstanding credit after close:", credit);
        eurx.createFlow(R1, RATE);
        vm.stopPrank();
        (,, uint256 dep,,) = eurx.getAccountInfo(a);
        uint256 owed = eurx.earnedUnclaimed(R1, a);
        console.log("C dep after reopen:", dep, "owed:", owed, "deps>=owed?", dep >= owed);
        console.log("C virtualBalanceOf(a):", eurx.virtualBalanceOf(a));
    }

    // D) trigger de settle: compara earnedUnclaimed vs real+deps, NO virtualBalance<=0
    function testD_settle_trigger_not_virtual_balance() public {
        address a = makeAddr("a");
        vm.prank(owner); eur.transfer(a, 10 ether);
        _wrap(a, 10 ether);
        vm.startPrank(a);
        eurx.createFlow(R1, RATE);
        vm.warp(block.timestamp + 5 days);
        vm.stopPrank();
        int256 vb = eurx.virtualBalanceOf(a);
        console.log("D virtualBalanceOf BEFORE settle:", vb);
        vm.prank(owner);
        try eurx.settle(a) {
            console.log("D settle OK despite virtualBalance =", uint256(vb));
        } catch bytes memory err {
            console.log("D settle reverted:", string(err));
        }
        console.log("D virtualBalanceOf AFTER settle:", eurx.virtualBalanceOf(a));
    }

    // E) deficit: cuanto se pierde realmente y si queda respaldo
    function testE_deficit_accounting() public {
        address a = makeAddr("a");
        vm.prank(owner); eur.transfer(a, 10 ether);
        _wrap(a, 10 ether);
        vm.startPrank(a);
        eurx.createFlow(R1, RATE);
        eurx.createFlow(R2, RATE);
        vm.warp(block.timestamp + 10 days);
        vm.stopPrank();
        uint256 supplyBefore = eurx.totalSupplyX();
        vm.prank(owner);
        eurx.settle(a);
        (,,, , uint256 deficit) = eurx.getAccountInfo(a);
        console.log("E pendingDeficit:", deficit);
        console.log("E real after settle:", eurx.realBalanceOf(a));
        console.log("E supply before/after:", supplyBefore, eurx.totalSupplyX());
        console.log("E underlying in contract:", eur.balanceOf(address(eurx)));
        vm.prank(a);
        try eurx.downgradeTo(1) { console.log("E downgrade 1 OK?!"); }
        catch bytes memory err { console.log("E downgrade reverted:", string(err)); }
    }
}
