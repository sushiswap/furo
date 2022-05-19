// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity 0.8.10;

import "../interfaces/IFuroVesting.sol";

contract FuroVesting is
    IFuroVesting,
    ERC721("Furo Vesting", "FUROVEST"),
    BoringBatchable
{
    IBentoBoxMinimal public immutable bentoBox;
    address public immutable wETH;

    mapping(uint256 => Vest) public vests;

    uint256 public vestIds;

    uint256 public constant PERCENTAGE_PRECISION = 1e8;

    // custom errors
    error InvalidStart();
    error NotOwner();
    error NotVestReceiver();
    error InvalidStepSetting();

    constructor(IBentoBoxMinimal _bentoBox, address _wETH) {
        bentoBox = _bentoBox;
        wETH = _wETH;
        vestIds = 1;
        _bentoBox.registerProtocol();
    }

    function tokenURI(uint256 id)
        public
        view
        override
        returns (string memory)
    {}

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
        uint128 stepPercentage,
        uint128 amount,
        bool fromBentoBox
    )
        external
        payable
        override
        returns (
            uint256 depositedShares,
            uint256 vestId,
            uint128 stepShares,
            uint128 cliffShares
        )
    {
        if (start < block.timestamp) revert InvalidStart();
        if (stepDuration == 0 || steps == 0) revert InvalidStepSetting();

        depositedShares = _depositToken(
            address(token),
            msg.sender,
            address(this),
            amount,
            fromBentoBox
        );
        stepShares = uint128(
            (stepPercentage * depositedShares) / PERCENTAGE_PRECISION
        );
        cliffShares = uint128(depositedShares - (stepShares * steps));

        vestId = vestIds++;
        _mint(recipient, vestId);

        vests[vestId] = Vest({
            owner: msg.sender,
            token: address(token) == address(0) ? IERC20(wETH) : token,
            start: start,
            cliffDuration: cliffDuration,
            stepDuration: stepDuration,
            steps: steps,
            cliffShares: cliffShares,
            stepShares: stepShares,
            claimed: 0
        });

        emit CreateVesting(vestId, vests[vestId]);
    }

    function withdraw(
        uint256 vestId,
        bytes calldata taskData,
        bool toBentoBox
    ) external override {
        Vest storage vest = vests[vestId];
        address recipient = ownerOf[vestId];
        if (recipient != msg.sender) revert NotVestReceiver();
        uint256 canClaim = _balanceOf(vest) - vest.claimed;

        if (canClaim == 0) return;

        vest.claimed += uint128(canClaim);

        _transferToken(
            address(vest.token),
            address(this),
            recipient,
            canClaim,
            toBentoBox
        );

        if (taskData.length != 0) ITasker(recipient).onTaskReceived(taskData);

        emit Withdraw(vestId, vest.token, canClaim, toBentoBox);
    }

    function stopVesting(uint256 vestId, bool toBentoBox) external override {
        Vest memory vest = vests[vestId];

        if (vest.owner != msg.sender) revert NotOwner();

        uint256 amountVested = _balanceOf(vest);
        uint256 canClaim = amountVested - vest.claimed;
        uint256 returnShares = (vest.cliffShares +
            (vest.steps * vest.stepShares)) - amountVested;

        delete vests[vestId];

        _transferToken(
            address(vest.token),
            address(this),
            ownerOf[vestId],
            canClaim,
            toBentoBox
        );

        _transferToken(
            address(vest.token),
            address(this),
            msg.sender,
            returnShares,
            toBentoBox
        );
        emit CancelVesting(
            vestId,
            returnShares,
            canClaim,
            vest.token,
            toBentoBox
        );
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

        claimable = vest.cliffShares + (vest.stepShares * stepPassed);
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
        if (fromBentoBox) {
            depositedShares = bentoBox.toShare(token, amount, false);
            bentoBox.transfer(token, from, to, depositedShares);
        } else {
            (, depositedShares) = bentoBox.deposit{
                value: token == address(0) ? amount : 0
            }(token, from, to, amount, 0);
        }
    }

    function _transferToken(
        address token,
        address from,
        address to,
        uint256 shares,
        bool toBentoBox
    ) internal {
        if (toBentoBox) {
            bentoBox.transfer(token, from, to, shares);
        } else {
            bentoBox.withdraw(token, from, to, 0, shares);
        }
    }
}
