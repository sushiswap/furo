// SPDX-License-Identifier: GPL-3.0-or-later

interface ISwapReceiver {
    function onSwapReceive(
        address tokenIn,
        address tokenOut,
        uint256 shares,
        uint256 amountOutMin,
        bytes calldata data
    ) external;
}

interface IRecipient {
    function onTokensReceived(bytes calldata data) external;
}
