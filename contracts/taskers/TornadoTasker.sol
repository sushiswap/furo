// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity 0.8.10;

import "../interfaces/ITasker.sol";
import "../interfaces/IL1Helper.sol";
import "../interfaces/IWETH.sol";

contract TornadoTasker is ITasker {
    IL1Helper private immutable l1Helper;
    IWETH private immutable weth;

    constructor(IL1Helper _l1Helper, IWETH _weth) payable {
        l1Helper = _l1Helper;
        weth = _weth;
    }

    receive() external payable {}

    function onTaskReceived(bytes calldata data) external override payable {
        // decode data for task
        (address _receiver, bytes memory _data) = abi.decode(data, (address, bytes));
        // fetch wETH balance and convert to ETH
        weth.withdraw(weth.balanceOf(address(this)));
        // task ETH to Tornado relayer with data
        l1Helper.wrapAndRelayTokens{value: address(this).balance}(_receiver, _data);
    }
}
