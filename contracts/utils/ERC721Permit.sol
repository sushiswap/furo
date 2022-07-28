// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity 0.8.10;

import "@rari-capital/solmate/src/tokens/ERC721.sol";
import "./Domain.sol";

abstract contract ERC721Permit is ERC721, Domain {
    /*//////////////////////////////////////////////////////////////
                               CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    constructor(string memory _name, string memory _symbol) 
        ERC721(_name, _symbol) {}

    /*//////////////////////////////////////////////////////////////
                             EIP-4494 LOGIC
    //////////////////////////////////////////////////////////////*/

    function permit(
        address spender,
        uint256 tokenId,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public virtual {
        require(deadline >= block.timestamp, "PERMIT_DEADLINE_EXPIRED");
        
        address owner = ownerOf[tokenId];

        // Unchecked because the only math done is incrementing
        // the owner's nonce which cannot realistically overflow.
        unchecked {
            address recoveredAddress = ecrecover(
                keccak256(
                    abi.encodePacked(
                        "\x19\x01",
                        DOMAIN_SEPARATOR(),
                        keccak256(
                            abi.encode(
                                keccak256(
                                    "Permit(address spender,uint256 tokenId,uint256 nonce,uint256 deadline)"
                                ),
                                spender,
                                tokenId,
                                nonces[owner]++,
                                deadline
                            )
                        )
                    )
                ),
                v,
                r,
                s
            );

            require(recoveredAddress != address(0) && recoveredAddress == owner, "INVALID_SIGNER");

            getApproved[id] = spender;
        }

        emit Approval(owner, spender, id);
    }
}
