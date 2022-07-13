// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity 0.8.10;

interface IL1Helper {
    function wrapAndRelayTokens(address _receiver, bytes calldata _data) external payable;
}
