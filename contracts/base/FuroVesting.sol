// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity 0.8.10;

import "../interfaces/IFuroVesting.sol";

contract FuroVesting is
    IFuroVesting,
    ERC721("Furo Vesting", "FUROVEST"),
    BoringBatchable,
    BoringOwnable
{
    IBentoBoxMinimal public immutable bentoBox;
    address public immutable wETH;

    mapping(uint256 => Vest) public vests;

    uint256 public vestIds;

    // custom errors
    error InvalidStart();
    error NotOwner();

    constructor(IBentoBoxMinimal _bentoBox, address _wETH) {
        bentoBox = _bentoBox;
        wETH = _wETH;
        vestIds = 1;
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

    function createVesting(
        IERC20 token,
        address recipient,
        uint32 start,
        uint32 cliffDuration,
        uint32 stepDuration,
        uint32 steps,
        uint128 cliffAmount,
        uint128 stepAmount,
        bool fromBentoBox
    )
        external
        payable
        override
        returns (uint256 depositedShares, uint256 vestId)
    {
        if (start < block.timestamp) revert InvalidStart();
        depositedShares = _depositToken(
            address(token),
            msg.sender,
            address(this),
            cliffAmount + (stepAmount * steps),
            fromBentoBox
        );

        vestId = vestIds++;
        _mint(recipient, vestId);

        vests[vestId] = Vest({
            owner: msg.sender,
            token: token,
            start: start,
            cliffDuration: cliffDuration,
            stepDuration: stepDuration,
            steps: steps,
            cliffAmount: cliffAmount,
            stepAmount: stepAmount,
            claimed: 0
        });

        emit LogCreateVesting(
            token,
            msg.sender,
            recipient,
            start,
            cliffDuration,
            stepDuration,
            steps,
            cliffAmount,
            stepAmount
        );
    }

    function withdraw(
        uint256 vestId,
        bytes memory taskData,
        bool toBentoBox
    ) external override {
        Vest storage vest = vests[vestId];
        address recipient = ownerOf(vestId);
        if (recipient != msg.sender) revert NotOwner();
        uint256 canClaim = _balanceOf(vest) - vest.claimed;

        vest.claimed += uint128(canClaim);

        _transferToken(
            address(vest.token),
            address(this),
            recipient,
            canClaim,
            toBentoBox
        );

        if (taskData.length != 0) ITasker(recipient).onTaskReceived(taskData);

        emit LogWithdraw(vestId, vest.token, toBentoBox);
    }

    function stopVesting(uint256 vestId, bool toBentoBox) external override {
        Vest memory vest = vests[vestId];
        if (vest.owner != msg.sender) revert NotOwner();
        uint256 canClaim = _balanceOf(vest) - vest.claimed;
        uint256 returnAmount = (vest.cliffAmount +
            (vest.steps * vest.stepAmount)) - canClaim;
        _transferToken(
            address(vest.token),
            address(this),
            ownerOf(vestId),
            canClaim,
            toBentoBox
        );

        _transferToken(
            address(vest.token),
            address(this),
            msg.sender,
            returnAmount,
            toBentoBox
        );

        emit LogStopVesting(
            vestId,
            returnAmount,
            canClaim,
            vest.token,
            toBentoBox
        );

        delete vests[vestId];
    }

    function vestBalance(uint256 vestId)
        external
        view
        override
        returns (uint256)
    {
        Vest memory vest = vests[vestId];
        return _balanceOf(vest) - vest.claimed;
    }

    function _balanceOf(Vest memory vest)
        internal
        view
        returns (uint256 claimable)
    {
        uint256 timeAfterCliff = vest.start + vest.cliffDuration;

        if (block.timestamp < timeAfterCliff) {
            return claimable;
        }

        uint256 passedSinceCliff = block.timestamp - timeAfterCliff;

        uint256 stepPassed = Math.min(
            vest.steps,
            passedSinceCliff / vest.stepDuration
        );

        claimable = vest.cliffAmount + (vest.stepAmount * stepPassed);
    }

    function updateOwner(uint256 vestId, address newOwner) external override {
        Vest storage vest = vests[vestId];
        if (vest.owner != msg.sender) revert NotOwner();
        vest.owner = newOwner;
        emit LogUpdateOwner(vestId, newOwner);
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
