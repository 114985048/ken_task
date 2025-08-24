// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/NFTMarket.sol";

contract NFTMarketTest is Test {
    MyToken token;
    MyNFT nft;
    NFTMarket market;

    address seller = address(0x1);
    address buyer = address(0x2);

    function setUp() public {
        token = new MyToken(1_000 ether);
        nft = new MyNFT();
        market = new NFTMarket(address(token), address(nft));

        // 给 seller 一些 token 和 NFT
        token.transfer(seller, 500 ether);
        vm.startPrank(seller);
        nft.mint(seller); // tokenId = 0
        nft.approve(address(market), 0);
        vm.stopPrank();

        // 给 buyer 一些 token
        token.transfer(buyer, 500 ether);
    }

    function test_ListAndBuyNFT() public {
        vm.startPrank(seller);
        vm.expectEmit(true, true, false, true);
        emit NFTMarket.Listed(seller, 0, 100 ether);
        market.list(0, 100 ether);
        vm.stopPrank();

        vm.startPrank(buyer);
        token.approve(address(market), 100 ether);
        vm.expectEmit(true, true, false, true);
        emit NFTMarket.Purchased(buyer, 0, 100 ether);
        market.buyNFT(0);
        vm.stopPrank();
    }
}
