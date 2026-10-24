// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {BarloventoToken} from "../src/BarloventoToken.sol";

contract BarloventoTokenTest is Test {
    BarloventoToken internal eur;
    address internal owner = address(0xA11CE);
    address internal alice = makeAddr("alice");

    function setUp() public {
        vm.prank(owner);
        eur = new BarloventoToken(10_000_000e18);
    }

    /// RF-01 / CU-10: hard-cap enforced en constructor y mint.
    function test_supply_cap() public {
        assertEq(eur.totalSupply(), 10_000_000e18, "initial supply == cap");
        assertEq(eur.MAX_SUPPLY(), 10_000_000e18);
        vm.prank(owner);
        vm.expectRevert("BRLT: over cap");
        eur.mint(alice, 1);
    }

    function test_mint_burn_owner_only() public {
        vm.prank(owner);
        eur.burn(1_000e18);
        vm.prank(owner);
        eur.mint(alice, 1_000e18);
        assertEq(eur.balanceOf(alice), 1_000e18);

        vm.prank(alice);
        vm.expectRevert();
        eur.mint(alice, 1);
    }

    function test_initial_supply_over_cap_reverts() public {
        vm.prank(alice);
        vm.expectRevert("BRLT: over cap");
        new BarloventoToken(10_000_001e18);
    }

    function test_transfer_standard() public {
        vm.prank(owner);
        eur.burn(500e18);
        vm.prank(owner);
        eur.mint(alice, 500e18);
        vm.prank(alice);
        eur.transfer(owner, 200e18);
        assertEq(eur.balanceOf(alice), 300e18);
    }
}
