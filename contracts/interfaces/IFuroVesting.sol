// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity 0.8.10;

import "./ITasker.sol";
import "./IBentoBoxMinimal.sol";
import "../utils/BoringBatchable.sol";
import "../utils/BoringOwnable.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

interface IFuroVesting {
    function setBentoBoxApproval(
        address user,
        bool approved,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

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
    ) external payable returns (uint256 depositedShares, uint256 vestId);

    function withdraw(
        uint256 vestId,
        bytes memory taskData,
        bool toBentoBox
    ) external;

    function stopVesting(uint256 vestId, bool toBentoBox) external;

    function vestBalance(uint256 vestId) external view returns (uint256);

    function updateOwner(uint256 vestId, address newOwner) external;

    struct Vest {
        address owner;
        IERC20 token;
        uint32 start;
        uint32 cliffDuration;
        uint32 stepDuration;
        uint32 steps;
        uint128 cliffAmount;
        uint128 stepAmount;
        uint128 claimed;
    }
}
