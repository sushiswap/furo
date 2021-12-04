// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity >=0.8.0;

import "./ISwapReceiver.sol";
import "./IBentoBoxMinimal.sol";

interface IFuro {
    function setBentoBoxApproval(
        address user,
        bool approved,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    function createStream(
        address recipient,
        address token,
        uint64 startTime,
        uint64 endTime,
        uint256 amount, /// @dev in token amount and not in shares
        bool fromBento
    )
        external
        payable
        returns (
            uint256 streamId,
            uint256 depositedShares,
            uint256 rate
        );

    function withdrawFromStream(
        uint256 streamId,
        uint256 sharesToWithdraw,
        address withdrawTo,
        bool toBentoBox
    ) external returns (uint256 recipientBalance, address to);

    function withdrawSwap(
        uint256 streamId,
        uint256 sharesToWithdraw,
        address toToken,
        uint256 amountOutMin,
        ISwapReceiver swapReceiver,
        bytes calldata data,
        bool toBentoBox
    ) external returns (uint256 recipientBalance);

    function cancelStream(uint256 streamId, bool toBentoBox)
        external
        returns (uint256 senderBalance, uint256 recipientBalance);

    function balanceOf(uint256 streamId)
        external
        view
        returns (uint256 senderBalance, uint256 recipientBalance);

    function getStream(uint256 streamId) external view returns (Stream memory);

    event LogCreateStream(
        uint256 indexed streamId,
        address indexed sender,
        address indexed recipient,
        address token,
        uint256 amount,
        uint256 startTime,
        uint256 endTime,
        bool fromBentoBox
    );

    event LogWithdrawFromStream(
        uint256 indexed streamId,
        uint256 indexed sharesToWithdraw,
        address indexed withdrawTo,
        address token,
        bool toBentoBox
    );

    event LogCancelStream(
        uint256 indexed streamId,
        uint256 indexed senderBalance,
        uint256 indexed recipientBalance,
        address token,
        bool toBentoBox
    );

    event LogWhitelistReceiver(ISwapReceiver indexed swapReceiver, bool approved);

    struct Stream {
        bool exists;
        address sender;
        address recipient;
        address token;
        uint128 depositedShares;
        uint128 withdrawnShares;
        uint128 rate;
        uint64 startTime;
        uint64 endTime;
    }
}
