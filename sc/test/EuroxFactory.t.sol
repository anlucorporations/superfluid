// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Euro} from "../src/Euro.sol";
import {EuroX} from "../src/EuroX.sol";
import {EuroxFactory} from "../src/EuroxFactory.sol";

contract EuroxFactoryTest is Test {
    EuroxFactory internal factory;
    Euro internal eur;
    address internal owner = address(this);
    address internal stranger = makeAddr("stranger");

    function setUp() public {
        eur = new Euro(1000e18);
        factory = new EuroxFactory();
    }

    function test_create_pair_and_getSuperToken() public {
        address x = factory.createPair(address(eur), "EURx", "EURx");
        assertEq(factory.getSuperToken(address(eur)), x);
        assertEq(factory.allPairsLength(), 1);
        assertEq(address(EuroX(x).underlying()), address(eur));
        assertEq(EuroX(x).decimals(), 18);
    }

    function test_pair_exists_reverts() public {
        factory.createPair(address(eur), "a", "b");
        vm.expectRevert("Factory: pair exists");
        factory.createPair(address(eur), "a", "b");
    }

    function test_zero_addr_reverts() public {
        vm.expectRevert("Factory: zero addr");
        factory.createPair(address(0), "a", "b");
    }

    function test_only_owner() public {
        vm.prank(stranger);
        vm.expectRevert("Factory: not owner");
        factory.createPair(address(eur), "a", "b");
    }

    function test_transfer_ownership() public {
        factory.transferOwnership(stranger);
        assertEq(factory.owner(), stranger);
        vm.expectRevert("Factory: zero addr");
        vm.prank(stranger);
        factory.transferOwnership(address(0));
        vm.prank(stranger);
        factory.transferOwnership(stranger); // auto-transferencia permitida (solo-owner)
        assertEq(factory.owner(), stranger);
        vm.prank(owner);
        vm.expectRevert("Factory: not owner");
        factory.createPair(address(eur), "a", "b");
    }

    function test_getSuperToken_unregistered_is_zero() public {
        assertEq(factory.getSuperToken(makeAddr("nothing")), address(0));
    }
}
