// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

contract DepositAddress {
    address private immutable till;

    error NotTill();
    error ReleaseFailed();

    constructor() {
        till = msg.sender;
    }

    function release(address payable merchant) external returns (uint256 amount) {
        if (msg.sender != till) revert NotTill();
        amount = address(this).balance;
        (bool ok,) = merchant.call{value: amount}("");
        if (!ok) revert ReleaseFailed();
    }
}

contract Till {
    bytes32 public constant DEPOSIT_ADDRESS_CODE_HASH = keccak256(type(DepositAddress).creationCode);

    event Swept(address indexed merchant, uint256 indexed orderId, address depositAddress, uint256 amount);

    error ZeroMerchant();
    error NothingToSweep();

    function depositAddress(address merchant, uint256 orderId) public view returns (address) {
        bytes32 hash = keccak256(
            abi.encodePacked(bytes1(0xff), address(this), _salt(merchant, orderId), DEPOSIT_ADDRESS_CODE_HASH)
        );
        return address(uint160(uint256(hash)));
    }

    function sweep(address payable merchant, uint256 orderId) public returns (uint256 amount) {
        if (merchant == address(0)) revert ZeroMerchant();

        address deposit = depositAddress(merchant, orderId);
        if (deposit.balance == 0) revert NothingToSweep();
        if (deposit.code.length == 0) new DepositAddress{salt: _salt(merchant, orderId)}();

        amount = DepositAddress(deposit).release(merchant);
        emit Swept(merchant, orderId, deposit, amount);
    }

    function sweepMany(address payable merchant, uint256[] calldata orderIds)
        external
        returns (uint256 total)
    {
        for (uint256 i; i < orderIds.length; ++i) {
            total += sweep(merchant, orderIds[i]);
        }
    }

    function _salt(address merchant, uint256 orderId) private pure returns (bytes32) {
        return keccak256(abi.encode(merchant, orderId));
    }
}
