// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import {MyToken} from "../src/MyToken.sol";

contract DeployMyToken is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        // 可根据需要修改初始铸造量（注意合约的 decimals = 1）
        uint256 initialSupply = 1_000_000;

        vm.startBroadcast(deployerPrivateKey);
        MyToken token = new MyToken(initialSupply);
        vm.stopBroadcast();

        console2.log("MyToken deployed to:", address(token));
    }
}


