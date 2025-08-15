// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import {TokenBank} from "../src/ToBank.sol";

contract DeployTokenBank is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address tokenAddress = vm.envAddress("TOKEN_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);
        TokenBank bank = new TokenBank(tokenAddress);
        vm.stopBroadcast();

        console2.log("TokenBank deployed to:", address(bank));
    }
}


