// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract DemoToken is ERC20 {
    constructor() ERC20("DemoToken", "MTK") {
        // 部署时给部署者铸造 1000 个代币
        _mint(msg.sender, 1000 * 10 ** decimals());
    }
}
