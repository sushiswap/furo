// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity 0.8.10;

import "./interfaces/ISwapReceiver.sol";
import "./interfaces/IBentoBoxMinimal.sol";
import "./libraries/UniswapV2Library.sol";
import "./libraries/SafeERC20.sol";

contract SwapReceiver is ISwapReceiver {
    using SafeERC20 for IERC20;

    address private immutable factory;

    IBentoBoxMinimal private immutable bentoBox;

    bytes32 private immutable pairCodeHash;

    constructor(
        address _factory,
        IBentoBoxMinimal _bentoBox,
        bytes32 _pairCodeHash
    ) {
        factory = _factory;
        bentoBox = _bentoBox;
        pairCodeHash = _pairCodeHash;
    }

    function onSwapReceive(
        address tokenIn,
        address tokenOut,
        uint256 shares,
        uint256 amountOutMin,
        bytes calldata data
    ) external override {
        (uint256 amountIn, ) = bentoBox.withdraw(
            tokenIn,
            address(this),
            address(this),
            0,
            shares
        );
        address[] memory path = abi.decode(data, (address[]));
        uint256 amountOut = _swapExactTokensForTokens(
            amountIn,
            amountOutMin,
            path,
            address(bentoBox)
        );
        bentoBox.deposit(tokenOut, address(bentoBox), msg.sender, amountOut, 0);
    }

    function _swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] memory path,
        address to
    ) internal returns (uint256 amountOut) {
        uint256[] memory amounts = UniswapV2Library.getAmountsOut(
            factory,
            amountIn,
            path,
            pairCodeHash
        );
        amountOut = amounts[amounts.length - 1];
        require(amountOut >= amountOutMin, "insufficient-amount-out");
        IERC20(path[0]).safeTransfer(
            UniswapV2Library.pairFor(factory, path[0], path[1], pairCodeHash),
            amountIn
        );
        _swap(amounts, path, to);
    }

    // requires the initial amount to have already been sent to the first pair
    function _swap(
        uint256[] memory amounts,
        address[] memory path,
        address _to
    ) internal virtual {
        for (uint256 i; i < path.length - 1; i++) {
            (address input, address output) = (path[i], path[i + 1]);
            (address token0, ) = UniswapV2Library.sortTokens(input, output);
            uint256 amountOut = amounts[i + 1];
            (uint256 amount0Out, uint256 amount1Out) = input == token0
                ? (uint256(0), amountOut)
                : (amountOut, uint256(0));
            address to = i < path.length - 2
                ? UniswapV2Library.pairFor(
                    factory,
                    output,
                    path[i + 2],
                    pairCodeHash
                )
                : _to;
            IUniswapV2Pair(
                UniswapV2Library.pairFor(factory, input, output, pairCodeHash)
            ).swap(amount0Out, amount1Out, to, new bytes(0));
        }
    }
}
