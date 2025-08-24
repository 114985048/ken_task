// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/DemoToken.sol";

contract DeployToken is Script {
    function run() external {
        vm.startBroadcast();

        DemoToken token = new DemoToken();
        console.log("Token deployed at:", address(token));
        console.log("Token deployed at:", address(token));

        vm.stopBroadcast();
    }
}
