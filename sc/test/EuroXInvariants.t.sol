// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {Euro} from "../src/Euro.sol";
import {EuroX} from "../src/EuroX.sol";
import {EuroxFactory} from "../src/EuroxFactory.sol";

/// Handler que ejecuta mutaciones aleatorias sobre EuroX (RNF-03/RNF-08 fuzz).
contract Handler is Test {
    Euro public eur;
    EuroX public eurx;
    address[5] internal _actors;

    constructor(Euro e_, EuroX x_) {
        eur = e_;
        eurx = x_;
        _actors = [address(0xB1), address(0xB2), address(0xB3), address(0xB4), address(0xB5)];
        for (uint256 i = 0; i < 5; ++i) {
            vm.prank(address(0xA11CE));
            eur.transfer(_actors[i], 100 ether);
            vm.startPrank(_actors[i]);
            eur.approve(address(eurx), type(uint256).max);
            eurx.upgradeTo(50 ether);
            vm.stopPrank();
        }
    }

    function actors(uint256 i) external view returns (address) {
        return _actors[i];
    }

    function actorCount() external pure returns (uint256) {
        return 5;
    }

    function warp(uint256 d) external {
        vm.warp(block.timestamp + _bound(d, 0, 7 days));
    }

    function doWrap(uint256 seed) external {
        address a = _actors[seed % 5];
        uint256 amt = _bound(seed, 1, 5 ether);
        if (eur.balanceOf(a) >= amt) {
            vm.prank(a);
            try eurx.upgradeTo{gas: 5_000_000}(amt) {} catch {}
        }
    }

    function doUnwrap(uint256 seed) external {
        address a = _actors[seed % 5];
        uint256 amt = _bound(seed >> 3, 1, 5 ether);
        vm.prank(a);
        try eurx.downgradeTo{gas: 5_000_000}(amt) {} catch {}
    }

    function doCreateFlow(uint256 seed) external {
        address s = _actors[seed % 5];
        address r = _actors[(seed + 1 + (seed % 2)) % 5];
        if (s == r) return;
        vm.prank(s);
        try eurx.createFlow{gas: 5_000_000}(r, int96(int256(_bound(seed >> 5, 1e12, 1e15)))) {} catch {}
    }

    function doPauseResumeClose(uint256 seed) external {
        address s = _actors[seed % 5];
        address r = _actors[(seed + 1) % 5];
        if (s == r) return;
        vm.prank(s);
        uint256 op = seed % 3;
        if (op == 0) {
            try eurx.pauseFlow{gas: 5_000_000}(r) {} catch {}
        } else if (op == 1) {
            try eurx.resumeFlow{gas: 5_000_000}(r) {} catch {}
        } else {
            try eurx.closeFlow{gas: 5_000_000}(r) {} catch {}
        }
    }

    function doSettleClaim(uint256 seed) external {
        address target = _actors[seed % 5];
        vm.prank(makeAddr("keeper"));
        try eurx.settle{gas: 8_000_000}(target) {} catch {}
        address receiver = _actors[(seed + 1) % 5];
        vm.prank(receiver);
        try eurx.claimSettled{gas: 5_000_000}(target) {} catch {}
        address other = _actors[(seed + 2) % 5];
        vm.prank(other);
        try eurx.claimSettled{gas: 5_000_000}(target) {} catch {}
    }
}

contract EuroXInvariants is StdInvariant, Test {
    Euro internal eur;
    EuroX internal eurx;
    Handler internal handler;

    function setUp() public {
        vm.prank(address(0xA11CE));
        eur = new Euro(10_000_000e18);
        EuroxFactory f = new EuroxFactory(); // owner = address(this) del test
        address x = f.createPair(address(eur), "EURx", "EURx");
        eurx = EuroX(x);
        handler = new Handler(eur, eurx);

        bytes4[] memory sel = new bytes4[](6);
        sel[0] = handler.warp.selector;
        sel[1] = handler.doWrap.selector;
        sel[2] = handler.doUnwrap.selector;
        sel[3] = handler.doCreateFlow.selector;
        sel[4] = handler.doPauseResumeClose.selector;
        sel[5] = handler.doSettleClaim.selector;
        targetContract(address(handler));
        targetSelector(FuzzSelector({addr: address(handler), selectors: sel}));
    }

    /// RNF-08 global (RE-01a solvencia): supply EURx custodiado == EUR retenido. I4.
    function invariant_custody_solvency() public view {
        assertEq(eurx.totalSupplyX(), eur.balanceOf(address(eurx)), "custodia 1:1");
    }

    /// I1 (V3, hallazgo CRITICO auditoría código): Σ real == totalSupplyX — sin acuñación.
    function invariant_no_minting() public view {
        uint256 sum;
        for (uint256 i = 0; i < handler.actorCount(); ++i) {
            sum += eurx.realBalanceOf(handler.actors(i));
        }
        assertEq(sum, eurx.totalSupplyX(), "- real == supplyX");
    }

    /// RNF-08 por cuenta: realBalanceOf(a) >= depositTotal(a).
    function invariant_free_nonnegative() public view {
        for (uint256 i = 0; i < handler.actorCount(); ++i) {
            address a = handler.actors(i);
            (,, uint256 dep,,) = eurx.getAccountInfo(a);
            assertGe(eurx.realBalanceOf(a), dep, "real >= depositTotal");
        }
    }

    /// Depósito canónico §0: depositTotal == netOutflowGarantizado * 3600.
    function invariant_deposit_formula() public view {
        for (uint256 i = 0; i < handler.actorCount(); ++i) {
            address a = handler.actors(i);
            (, int96 g, uint256 dep,,) = eurx.getAccountInfo(a);
            assertEq(dep, uint256(int256(g)) * 3600, "deposit formula");
        }
    }
}
