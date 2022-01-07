// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity 0.8.11;

import "./interfaces/IBentoBoxMinimal.sol";
import { IRecipient } from "./interfaces/ISwapReceiver.sol";
import "./utils/BoringBatchable.sol";
import "@rari-capital/solmate/src/tokens/ERC721.sol";

contract SushiPay is ERC721("Sushi pay", "SP"), BoringBatchable {

    IBentoBoxMinimal public immutable bentoBox;

    address public immutable wETH;

    uint256 public streamIds;

    mapping(uint256 => Stream) public streams;

    event StreamCreated(
        uint256 indexed streamId,
        address indexed controller,
        address indexed recipient,
        address token,
        uint256 amount,
        uint256 startTime,
        uint256 endTIme
    );

    event Withdraw(
        uint256 indexed streamId,
        address indexed recipient,
        uint256 amount
    );

    event TransferStreamControl(
        uint256 indexed streamId,
        address indexed newController,
        address oldController
    );

    event EndStream(
        uint256 indexed streamId,
        address controller,
        address recipient,
        uint256 paid,
        uint256 reclaimed
    );

    struct Stream {
        address controller; // todo check if its worth it to pack address + timestamp into one bytes32 slot
        address token;
        uint128 startTime;
        uint128 endTime;
        uint128 totalAmount;
        uint128 claimedAmount;
    }

    constructor(address _bentoBox, address _wETH) {
        bentoBox = IBentoBoxMinimal(_bentoBox);
        bentoBox.registerProtocol();
        wETH = _wETH;
    }

    function tokenURI(uint256) public pure override returns (string memory) {return "";}

    function approveBento(
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external payable {
        bentoBox.setMasterContractApproval(msg.sender, address(this), true, v, r, s);
    }

    function createStream(
        address controller,
        address recipient,
        address token,
        uint256 amount,
        uint128 startTime,
        uint128 endTime,
        bool fromBentoBox
    ) public payable returns (uint256 streamId, uint256 depositedShares) {

        require(startTime < endTime, "Invalid period");

        depositedShares = _depositToken(token, amount, fromBentoBox);

        require(type(uint128).max > depositedShares, "Deposit too big");

        streamId = streamIds++;

        _mint(recipient, streamId);

        streams[streamId] = Stream({
            controller: controller,
            token: token,
            startTime: startTime,
            endTime: endTime,
            totalAmount: uint128(depositedShares),
            claimedAmount: 0
        });

        emit StreamCreated(streamId, controller, recipient, token, amount, startTime, endTime);
    }

    function withdraw(
        uint256 streamId,
        address to,
        bool toBentoBox,
        bytes memory data
    ) external returns (uint256 sharesWithdrawn) {
        
        require(ownerOf[streamId] == msg.sender, "Only owner");

        Stream memory stream = streams[streamId]; // todo check if using storage location is cheaper

        (sharesWithdrawn, ) = _streamBalance(stream);

        unchecked { streams[streamId].claimedAmount += uint128(sharesWithdrawn); }

        _withdrawToken(stream.token, to, sharesWithdrawn, toBentoBox);

        emit Withdraw(streamId, msg.sender, sharesWithdrawn);

        if (data.length != 0) IRecipient(to).onTokensReceived(data);
    }

    function endStream(uint256 streamId, bool toBentoBox) external returns(uint256 paid, uint256 reclaimed) {

        Stream memory stream = streams[streamId];

        require(stream.controller == msg.sender, "Only controller");

        (paid, reclaimed) = _streamBalance(stream);
        
        streams[streamId].totalAmount = 0;
        streams[streamId].claimedAmount = 0;

        _withdrawToken(stream.token, stream.controller, reclaimed, toBentoBox);
        _withdrawToken(stream.token, ownerOf[streamId], paid, toBentoBox);

        emit EndStream(streamId, stream.controller, ownerOf[streamId], paid, reclaimed);   
    }

    function transferStreamControl(uint256 streamId, address controller) external {

        Stream storage stream = streams[streamId];
        
        require(stream.controller == msg.sender, "Only controller");
        
        stream.controller = controller;

        emit TransferStreamControl(streamId, controller, msg.sender);
    }

    function streamBalance(uint256 streamId) external view returns (uint256 recipient, uint256 controller) {
        return _streamBalance(streams[streamId]);
    }

    function _streamBalance(Stream memory stream) internal view returns (uint256 recipient, uint256 controller) {
        (uint256 passedTime, uint256 totalTime) = _getStreamTime(stream.startTime, stream.endTime, block.timestamp);
        unchecked {
            recipient = (stream.totalAmount * passedTime / totalTime);
            controller = stream.totalAmount - recipient;
            recipient -= stream.claimedAmount;
        }
    }

    function _getStreamTime(
        uint256 startTime,
        uint256 endTime,
        uint256 currentTime
    ) internal pure returns(uint256 passedTime, uint256 totalTime) {
        unchecked {   
            totalTime = endTime - startTime;
            if (currentTime > endTime) {
                passedTime = totalTime;
            } else if (currentTime > startTime) {
                passedTime = currentTime - startTime;
            }
        }
    }

    function _depositToken(
        address token,
        uint256 amount,
        bool fromBentoBox
    ) internal returns (uint256 depositedShares) {
        if (token == wETH && address(this).balance >= amount) {
            (, depositedShares) = bentoBox.deposit{value: amount}(
                address(0),
                address(bentoBox),
                address(this),
                amount,
                0
            );
        } else {
            if (fromBentoBox) {
                depositedShares = bentoBox.toShare(token, amount, false);
                bentoBox.transfer(token, msg.sender, address(this), depositedShares);
            } else {
                (, depositedShares) = bentoBox.deposit(
                    token,
                    msg.sender,
                    address(this),
                    amount,
                    0
                );
            }
        }
    }

    function _withdrawToken(
        address token,
        address to,
        uint256 amount,
        bool toBentoBox
    ) internal {
        if (toBentoBox) {
            bentoBox.transfer(token, address(this), to, amount);
        } else {
            bentoBox.withdraw(token, address(this), to, 0, amount);
        }
    }
}
