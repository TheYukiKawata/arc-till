// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {DepositAddress, Till} from "../src/Till.sol";

contract TillTest is Test {
    Till internal till;

    address payable internal merchant = payable(makeAddr("merchant"));
    address internal customer = makeAddr("customer");

    function setUp() public {
        till = new Till();
        vm.deal(customer, 100 ether);
    }

    function _pay(address to, uint256 amount) internal {
        vm.prank(customer);
        (bool ok,) = to.call{value: amount}("");
        assertTrue(ok);
    }

    function test_depositAddressDiffersPerOrderAndMerchant() public {
        address first = till.depositAddress(merchant, 1);

        assertTrue(first != till.depositAddress(merchant, 2));
        assertTrue(first != till.depositAddress(makeAddr("other"), 1));
        assertEq(first, till.depositAddress(merchant, 1));
    }

    function test_depositAddressAcceptsPaymentBeforeDeployment() public {
        address deposit = till.depositAddress(merchant, 7);

        _pay(deposit, 4.5 ether);

        assertEq(deposit.balance, 4.5 ether);
        assertEq(deposit.code.length, 0);
    }

    function test_sweepMovesFundsToMerchant() public {
        address deposit = till.depositAddress(merchant, 7);
        _pay(deposit, 4.5 ether);

        vm.expectEmit(address(till));
        emit Till.Swept(merchant, 7, deposit, 4.5 ether);
        uint256 amount = till.sweep(merchant, 7);

        assertEq(amount, 4.5 ether);
        assertEq(merchant.balance, 4.5 ether);
        assertEq(deposit.balance, 0);
    }

    function test_sweepRejectsEmptyDeposit() public {
        vm.expectRevert(Till.NothingToSweep.selector);
        till.sweep(merchant, 7);

        assertEq(till.depositAddress(merchant, 7).code.length, 0);
    }

    function test_sweepRejectsZeroMerchant() public {
        vm.expectRevert(Till.ZeroMerchant.selector);
        till.sweep(payable(address(0)), 7);
    }

    function test_sweepAgainAfterLateTopUp() public {
        address deposit = till.depositAddress(merchant, 7);
        _pay(deposit, 1 ether);
        till.sweep(merchant, 7);

        vm.deal(deposit, 0.25 ether);
        till.sweep(merchant, 7);

        assertEq(merchant.balance, 1.25 ether);
    }

    function test_nativePaymentAfterSweepReverts() public {
        address deposit = till.depositAddress(merchant, 7);
        _pay(deposit, 1 ether);
        till.sweep(merchant, 7);

        vm.prank(customer);
        (bool ok,) = deposit.call{value: 1 ether}("");

        assertFalse(ok);
    }

    function test_sweepManyAddsUpOrders() public {
        uint256[] memory orderIds = new uint256[](3);
        for (uint256 i; i < 3; ++i) {
            orderIds[i] = i + 1;
            _pay(till.depositAddress(merchant, i + 1), (i + 1) * 1 ether);
        }

        uint256 total = till.sweepMany(merchant, orderIds);

        assertEq(total, 6 ether);
        assertEq(merchant.balance, 6 ether);
    }

    function test_releaseOnlyByTill() public {
        address deposit = till.depositAddress(merchant, 7);
        _pay(deposit, 1 ether);
        till.sweep(merchant, 7);
        vm.deal(deposit, 1 ether);

        vm.expectRevert(DepositAddress.NotTill.selector);
        DepositAddress(deposit).release(payable(customer));
    }

    function testFuzz_sweepReleasesExactBalance(uint256 orderId, uint96 amount) public {
        vm.assume(amount > 0);
        address deposit = till.depositAddress(merchant, orderId);
        vm.deal(deposit, amount);

        assertEq(till.sweep(merchant, orderId), amount);
        assertEq(merchant.balance, amount);
    }
}
