// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract MockNft is ERC721 {
    constructor() ERC721("MockNFT", "MCO") {}
    
    function mint(address to, uint256 tokenId) public {
        _mint(to, tokenId);
    }
}
