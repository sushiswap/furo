// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity >=0.8.0;

import "./interfaces/IFuro.sol";
import "./utils/BoringBatchable.sol";
import "./utils/BoringOwnable.sol";

contract Furo is IFuro, BoringOwnable, BoringBatchable {
    IBentoBoxMinimal public immutable bentoBox;
    address public immutable wETH;

    uint256 public streamIds;

    mapping(uint256 => Stream) public streams;
    mapping(ISwapReceiver => bool) public whitelistedReceivers;

    modifier onlySenderOrRecipient(uint256 streamId) {
        require(
            msg.sender == streams[streamId].sender ||
                msg.sender == streams[streamId].recipient,
            "Furo: !sender or !recipient"
        );
        _;
    }

    modifier validStream(uint256 streamId) {
        require(streams[streamId].exists, "Furo: Invalid Stream");
        _;
    }

    constructor(IBentoBoxMinimal _bentoBox, address _wETH) {
        bentoBox = _bentoBox;
        wETH = _wETH;
        streamIds = 1;
        _bentoBox.registerProtocol();
    }

    function setBentoBoxApproval(
        address user,
        bool approved,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external override {
        bentoBox.setMasterContractApproval(
            user,
            address(this),
            approved,
            v,
            r,
            s
        );
    }

    function createStream(
        address recipient,
        address token,
        uint64 startTime,
        uint64 endTime,
        uint256 amount, /// @dev in token amount and not in shares
        bool fromBentoBox
    )
        external
        payable
        override
        returns (
            uint256 streamId,
            uint256 depositedShares,
            uint256 rate
        )
    {
        require(recipient != address(0), "Furo: to address 0");
        require(recipient != address(this), "Furo: to contract");
        require(recipient != msg.sender, "Furo: to caller");
        require(amount > 0, "Furo: 0 deposit");
        require(startTime >= block.timestamp, "Furo: invalid startTime");
        require(endTime > startTime, "Furo: invalid endTime");

        uint256 timeDifference = endTime - startTime;

        depositedShares = _depositToken(
            token,
            msg.sender,
            address(this),
            amount,
            fromBentoBox
        );

        require(depositedShares >= timeDifference, "Furo: deposit too small");
        require(
            depositedShares % timeDifference == 0,
            "Furo: not multiple of time"
        );

        rate = depositedShares / timeDifference;

        streamId = streamIds++;

        streams[streamId] = Stream({
            exists: true,
            sender: msg.sender,
            recipient: recipient,
            token: token,
            depositedShares: uint128(depositedShares),
            rate: uint128(rate),
            withdrawnShares: 0,
            startTime: startTime,
            endTime: endTime
        });

        emit LogCreateStream(
            streamId,
            msg.sender,
            recipient,
            token,
            depositedShares,
            startTime,
            endTime,
            fromBentoBox
        );
    }

    function withdrawFromStream(
        uint256 streamId,
        uint256 sharesToWithdraw,
        address withdrawTo,
        bool toBentoBox
    )
        external
        override
        validStream(streamId)
        onlySenderOrRecipient(streamId)
        returns (uint256 recipientBalance, address to)
    {
        Stream storage stream = streams[streamId];
        (, recipientBalance) = _balanceOf(stream);
        require(
            recipientBalance >= sharesToWithdraw,
            "Furo: withdraw too much"
        );
        stream.withdrawnShares += uint128(sharesToWithdraw);
        if (msg.sender == stream.recipient && withdrawTo != address(0)) {
            to = withdrawTo;
        } else {
            to = stream.recipient;
        }

        _transferToken(
            stream.token,
            address(this),
            to,
            sharesToWithdraw,
            toBentoBox
        );

        emit LogWithdrawFromStream(
            streamId,
            sharesToWithdraw,
            withdrawTo,
            stream.token,
            toBentoBox
        );
    }

    function withdrawSwap(
        uint256 streamId,
        uint256 sharesToWithdraw,
        address toToken,
        uint256 amountOutMin,
        ISwapReceiver swapReceiver,
        bytes calldata data,
        bool toBentoBox
    )
        external
        override
        validStream(streamId)
        returns (uint256 recipientBalance)
    {
        require(whitelistedReceivers[swapReceiver], "Furo: !whitelisted");
        Stream storage stream = streams[streamId];
        require(msg.sender == stream.recipient, "Furo: !recipient");
        (, recipientBalance) = _balanceOf(stream);
        require(
            recipientBalance >= sharesToWithdraw,
            "Furo: withdraw too much"
        );
        stream.withdrawnShares += uint128(sharesToWithdraw);
        uint256 toTokenBalanceBefore = bentoBox.balanceOf(
            toToken,
            address(this)
        );
        _transferToken(
            stream.token,
            address(this),
            address(swapReceiver),
            sharesToWithdraw,
            true
        );
        swapReceiver.onSwapReceive(
            stream.token,
            toToken,
            sharesToWithdraw,
            amountOutMin,
            data
        );
        uint256 toTokenBalanceAfter = bentoBox.balanceOf(
            toToken,
            address(this)
        );
        require(
            toTokenBalanceAfter >= toTokenBalanceBefore + amountOutMin,
            "Furo: received too less"
        );

        _transferToken(
            toToken,
            address(this),
            stream.recipient,
            toTokenBalanceAfter - toTokenBalanceBefore,
            toBentoBox
        );

        emit LogWithdrawFromStream(
            streamId,
            sharesToWithdraw,
            stream.recipient,
            toToken,
            toBentoBox
        );
    }

    function cancelStream(uint256 streamId, bool toBentoBox)
        external
        override
        validStream(streamId)
        onlySenderOrRecipient(streamId)
        returns (uint256 senderBalance, uint256 recipientBalance)
    {
        Stream memory stream = streams[streamId];
        (senderBalance, recipientBalance) = _balanceOf(stream);

        delete streams[streamId];

        _transferToken(
            stream.token,
            address(this),
            stream.recipient,
            recipientBalance,
            toBentoBox
        );
        _transferToken(
            stream.token,
            address(this),
            stream.sender,
            senderBalance,
            toBentoBox
        );

        emit LogCancelStream(
            streamId,
            senderBalance,
            recipientBalance,
            stream.token,
            toBentoBox
        );
    }

    function getStream(uint256 streamId)
        external
        view
        override
        validStream(streamId)
        returns (Stream memory)
    {
        return streams[streamId];
    }

    function balanceOf(uint256 streamId)
        external
        view
        override
        validStream(streamId)
        returns (uint256 senderBalance, uint256 recipientBalance)
    {
        return _balanceOf(streams[streamId]);
    }

    function _balanceOf(Stream memory stream)
        internal
        view
        returns (uint256 senderBalance, uint256 recipientBalance)
    {
        if (block.timestamp <= stream.startTime) {
            senderBalance = stream.depositedShares;
            recipientBalance = 0;
        } else if (stream.endTime <= block.timestamp) {
            uint256 timeDelta = stream.endTime - stream.startTime;
            recipientBalance =
                (stream.rate * timeDelta) -
                stream.withdrawnShares;
            senderBalance = 0;
        } else {
            uint256 timeDelta = block.timestamp - stream.startTime;
            recipientBalance =
                (stream.rate * timeDelta) -
                uint256(stream.withdrawnShares);
            senderBalance = uint256(stream.depositedShares) - recipientBalance;
        }
    }

    function whitelistReceiver(ISwapReceiver receiver, bool approved)
        external
        onlyOwner
    {
        whitelistedReceivers[receiver] = approved;
        emit LogWhitelistReceiver(receiver, approved);
    }

    function _depositToken(
        address token,
        address from,
        address to,
        uint256 amount,
        bool fromBentoBox
    ) internal returns (uint256 depositedShares) {
        if (token == wETH && address(this).balance >= amount) {
            (, depositedShares) = bentoBox.deposit{value: amount}(
                address(0),
                from,
                to,
                amount,
                0
            );
        } else {
            if (fromBentoBox) {
                depositedShares = bentoBox.toShare(token, amount, false);
                bentoBox.transfer(token, from, to, depositedShares);
            } else {
                (, depositedShares) = bentoBox.deposit(
                    token,
                    from,
                    to,
                    amount,
                    0
                );
            }
        }
    }

    function _transferToken(
        address token,
        address from,
        address to,
        uint256 amount,
        bool toBentoBox
    ) internal {
        if (toBentoBox) {
            bentoBox.transfer(token, from, to, amount);
        } else {
            bentoBox.withdraw(token, from, to, 0, amount);
        }
    }
}
