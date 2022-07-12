// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity 0.8.10;

import "../libraries/SafeERC20.sol";
import "../interfaces/ITasker.sol";
import "../interfaces/IBentoBoxMinimal.sol";
import "../interfaces/ITridentRouter.sol";

contract TridentSwapTasker is ITasker, ITridentRouter {
    // Custom Error
    error TooLittleReceived();

    using SafeERC20 for IERC20;

    IBentoBoxMinimal private immutable bentoBox;

    constructor(IBentoBoxMinimal _bentoBox) {
        bentoBox = _bentoBox;
    }

    function onTaskReceived(bytes calldata data) external override {
        (bool exactInput, bytes memory swapData) = abi.decode(
            data,
            (bool, bytes)
        );

        if (exactInput) {
            ExactInputParams memory params = abi.decode(
                swapData,
                (ExactInputParams)
            );

            IERC20(params.tokenIn).safeTransfer(
                address(bentoBox),
                params.amountIn
            );

            bentoBox.deposit(
                params.tokenIn,
                address(bentoBox),
                params.path[0].pool,
                params.amountIn,
                0
            );

            uint256 amountOut;

            uint256 n = params.path.length;
            for (uint256 i = 0; i < n; i = _increment(i)) {
                amountOut = IPool(params.path[i].pool).swap(
                    params.path[i].data
                );
            }
            // Ensure that the slippage wasn't too much. This assumes that the pool is honest.
            if (amountOut < params.amountOutMinimum) revert TooLittleReceived();
        } else {
            ComplexPathParams memory params = abi.decode(
                swapData,
                (ComplexPathParams)
            );

            uint256 n = params.initialPath.length;
            for (uint256 i = 0; i < n; i = _increment(i)) {
                bentoBox.transfer(
                    params.initialPath[i].tokenIn,
                    address(this),
                    params.initialPath[i].pool,
                    params.initialPath[i].amount
                );

                IPool(params.initialPath[i].pool).swap(
                    params.initialPath[i].data
                );
            }
            // Do all the middle swaps. Input comes from previous pools.
            n = params.percentagePath.length;
            for (uint256 i = 0; i < n; i = _increment(i)) {
                uint256 balanceShares = bentoBox.balanceOf(
                    params.percentagePath[i].tokenIn,
                    address(this)
                );
                uint256 transferShares = (balanceShares *
                    params.percentagePath[i].balancePercentage) /
                    uint256(10)**8;
                bentoBox.transfer(
                    params.percentagePath[i].tokenIn,
                    address(this),
                    params.percentagePath[i].pool,
                    transferShares
                );
                IPool(params.percentagePath[i].pool).swap(
                    params.percentagePath[i].data
                );
            }
            // Ensure enough was received and transfer the ouput to the recipient.
            n = params.output.length;
            for (uint256 i = 0; i < n; i = _increment(i)) {
                uint256 balanceShares = bentoBox.balanceOf(
                    params.output[i].token,
                    address(this)
                );
                if (balanceShares < params.output[i].minAmount)
                    revert TooLittleReceived();
                if (params.output[i].unwrapBento) {
                    bentoBox.withdraw(
                        params.output[i].token,
                        address(this),
                        params.output[i].to,
                        0,
                        balanceShares
                    );
                } else {
                    bentoBox.transfer(
                        params.output[i].token,
                        address(this),
                        params.output[i].to,
                        balanceShares
                    );
                }
            }
        }
    }

    function _increment(uint256 i) internal pure returns (uint256) {
        unchecked {
            return i + 1;
        }
    }
}
