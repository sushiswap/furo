// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity >=0.8.0;

interface ISwapReceiver {
    function onSwapReceive(
        address tokenIn,
        address tokenOut,
        uint256 shares,
        uint256 amountOutMin,
        bytes calldata data
    ) external;
}
