// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Brlt} from "../src/Brlt.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract BrltTest is Test {
    Brlt internal brlt;

    address internal holder;
    address internal alice;
    address internal bob;

    function setUp() public {
        holder = makeAddr("holder");
        alice = makeAddr("alice");
        bob = makeAddr("bob");
        brlt = new Brlt(holder, address(this));
    }

    function testMetadata() public view {
        assertEq(brlt.name(), "CriptoPeso");
        assertEq(brlt.symbol(), "BRLT");
        assertEq(brlt.decimals(), 18);
    }

    function testInitialSupply() public view {
        assertEq(brlt.totalSupply(), brlt.INITIAL_SUPPLY());
        assertEq(brlt.totalSupply(), 10_000_000e18);
        assertEq(brlt.balanceOf(holder), 10_000_000e18);
        assertEq(brlt.MAX_SUPPLY(), 50_000_000e18);
    }

    function testMintRespectsCap() public {
        uint256 room = brlt.MAX_SUPPLY() - brlt.totalSupply();
        brlt.mint(alice, room);
        assertEq(brlt.totalSupply(), brlt.MAX_SUPPLY());

        vm.expectRevert(abi.encodeWithSelector(Brlt.CapExceeded.selector, 1, 0));
        brlt.mint(alice, 1);
    }

    function testMintOnlyMinterOrOwner() public {
        brlt.setMinter(bob);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Brlt.NotMinter.selector, alice));
        brlt.mint(alice, 1e18);

        vm.prank(bob);
        brlt.mint(bob, 1e18);
        assertEq(brlt.balanceOf(bob), 1e18);

        // El owner sigue pudiendo emitir aunque haya un minter delegado.
        brlt.mint(alice, 2e18);
        assertEq(brlt.balanceOf(alice), 2e18);
    }

    function testSetMinterOnlyOwner() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        brlt.setMinter(alice);

        brlt.setMinter(bob);
        assertEq(brlt.minter(), bob);

        // Minter a cero deshabilita la emisión delegada.
        brlt.setMinter(address(0));
        assertEq(brlt.minter(), address(0));
    }

    function testBurnOwnBalance() public {
        vm.prank(holder);
        brlt.burn(1_000e18);
        assertEq(brlt.balanceOf(holder), 10_000_000e18 - 1_000e18);
        assertEq(brlt.totalSupply(), 10_000_000e18 - 1_000e18);
    }

    function testBurnFromRequiresAllowance() public {
        vm.prank(holder);
        brlt.approve(alice, 500e18);

        vm.prank(alice);
        brlt.burnFrom(holder, 500e18);
        assertEq(brlt.balanceOf(holder), 10_000_000e18 - 500e18);

        vm.prank(alice);
        vm.expectRevert();
        brlt.burnFrom(holder, 1e18);
    }

    function testCannotBurnMoreThanBalance() public {
        vm.prank(alice);
        vm.expectRevert();
        brlt.burn(1e18);
    }

    function testOwnershipTwoStep() public {
        brlt.transferOwnership(alice);
        assertEq(brlt.owner(), address(this));
        assertEq(brlt.pendingOwner(), alice);

        vm.prank(alice);
        brlt.acceptOwnership();
        assertEq(brlt.owner(), alice);
        assertEq(brlt.pendingOwner(), address(0));

        // El antiguo owner ya no puede administrar el token.
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(this)));
        brlt.setMinter(address(this));
    }

    function testFuzzMintNeverExceedsCap(uint256 amount) public {
        amount = bound(amount, 0, 200_000_000e18);
        uint256 room = brlt.MAX_SUPPLY() - brlt.totalSupply();
        if (amount > room) {
            vm.expectRevert(abi.encodeWithSelector(Brlt.CapExceeded.selector, amount, room));
            brlt.mint(alice, amount);
        } else {
            brlt.mint(alice, amount);
            assertLe(brlt.totalSupply(), brlt.MAX_SUPPLY());
        }
    }
}
