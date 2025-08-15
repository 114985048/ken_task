// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/* ========== ERC1820 Registry 接口 ========== */
interface IERC1820Registry {
    function setInterfaceImplementer(address account, bytes32 interfaceHash, address implementer) external;
}

/* ========== IERC777 接口 ========== */
interface IERC777 {
    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
    function send(address recipient, uint256 amount, bytes calldata data) external;
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
}

/* ========== IERC20 接口 ========== */
interface IERC20 {
    function transfer(address recipient, uint256 amount) external returns (bool);
}

/* ========== IERC777Recipient 接口 ========== */
interface IERC777Recipient {
    function tokensReceived(
        address operator,
        address from,
        address to,
        uint256 amount,
        bytes calldata userData,
        bytes calldata operatorData
    ) external;
}

/* ========== ERC721 精简版 ========== */
interface IERC721 {
    function ownerOf(uint256 tokenId) external view returns (address);
    function approve(address to, uint256 tokenId) external;
    function transferFrom(address from, address to, uint256 tokenId) external;
}

/* ========== MyToken (ERC777 简化实现) ========== */
contract MyToken {
    string public name = "MyToken";
    string public symbol = "MTK";
    uint8 public decimals = 18;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    IERC1820Registry constant ERC1820_REGISTRY =
        IERC1820Registry(0x1820a4B7618BdE71Dce8cdc73aAB6C95905faD24);

    bytes32 constant TOKENS_RECIPIENT_INTERFACE_HASH =
        keccak256("ERC777TokensRecipient");

    constructor(uint256 initialSupply) {
        balanceOf[msg.sender] = initialSupply;
        totalSupply = initialSupply;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address recipient, uint256 amount) public returns (bool) {
        require(balanceOf[msg.sender] >= amount, "Balance too low");
        balanceOf[msg.sender] -= amount;
        balanceOf[recipient] += amount;
        return true;
    }

    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool) {
        require(balanceOf[sender] >= amount, "Balance too low");
        require(allowance[sender][msg.sender] >= amount, "Allowance too low");
        allowance[sender][msg.sender] -= amount;
        balanceOf[sender] -= amount;
        balanceOf[recipient] += amount;
        return true;
    }

    // ERC777 send with data
    function send(address recipient, uint256 amount, bytes calldata data) external {
    require(balanceOf[msg.sender] >= amount, "Balance too low");

    // 先扣款、再记账
    balanceOf[msg.sender] -= amount;
    balanceOf[recipient] += amount;

    // 如果收款方是合约，直接尝试触发 ERC777 回调
    if (recipient.code.length > 0) {
        (bool ok, ) = recipient.call(
            abi.encodeWithSelector(
                IERC777Recipient.tokensReceived.selector,
                msg.sender,       // operator
                msg.sender,       // from
                recipient,        // to
                amount,
                data,
                ""                // operatorData
            )
        );
        require(ok, "tokensReceived failed"); // 回调失败就整笔回滚
    }
}


    function _getRecipientImplementer(address recipient) internal view returns (address) {
        return address(uint160(uint256(
            keccak256(abi.encodePacked(recipient, TOKENS_RECIPIENT_INTERFACE_HASH))
        )));
    }
}

/* ========== MyNFT (ERC721 简化版) ========== */
contract MyNFT {
    string public name = "MyNFT";
    string public symbol = "MNFT";
    uint256 public nextTokenId;

    mapping(uint256 => address) public ownerOf;
    mapping(uint256 => address) public getApproved;

    function mint(address to) external {
        ownerOf[nextTokenId] = to;
        nextTokenId++;
    }

    function approve(address to, uint256 tokenId) external {
        require(ownerOf[tokenId] == msg.sender, "Not owner");
        getApproved[tokenId] = to;
    }

    function transferFrom(address from, address to, uint256 tokenId) external {
        require(ownerOf[tokenId] == from, "Not owner");
        require(msg.sender == from || msg.sender == getApproved[tokenId], "Not approved");
        ownerOf[tokenId] = to;
        getApproved[tokenId] = address(0);
    }
}

/* ========== NFTMarket ========== */
contract NFTMarket is IERC777Recipient {
    IERC1820Registry private constant _ERC1820_REGISTRY =
        IERC1820Registry(0x1820a4B7618BdE71Dce8cdc73aAB6C95905faD24);

    MyToken public token;
    MyNFT public nft;

    struct Listing {
        address seller;
        uint256 price;
    }

    mapping(uint256 => Listing) public listings;

    constructor(address tokenAddress, address nftAddress) {
        token = MyToken(tokenAddress);
        nft = MyNFT(nftAddress);

        // _ERC1820_REGISTRY.setInterfaceImplementer(
        //     address(this),
        //     keccak256("ERC777TokensRecipient"),
        //     address(this)
        // );
    }

    // ===== 新增事件 =====
    event Listed(address indexed seller, uint256 indexed tokenId, uint256 price);
    event Purchased(address indexed buyer, uint256 indexed tokenId, uint256 price);

    function list(uint256 tokenId, uint256 price) external {
        require(nft.ownerOf(tokenId) == msg.sender, "Not NFT owner");
        nft.transferFrom(msg.sender, address(this), tokenId);
        listings[tokenId] = Listing(msg.sender, price);

        emit Listed(msg.sender, tokenId, price); // 触发上架事件
    }

    function buyNFT(uint256 tokenId) external {
        Listing memory item = listings[tokenId];
        require(item.price > 0, "Not listed");
        require(token.transferFrom(msg.sender, item.seller, item.price), "Token transfer failed");
        nft.transferFrom(address(this), msg.sender, tokenId);
        delete listings[tokenId];

        emit Purchased(msg.sender, tokenId, item.price); // 触发购买事件
    }

    function tokensReceived(
        address, address from, address, uint256 amount, bytes calldata userData, bytes calldata
    ) external override {
        require(msg.sender == address(token), "Only our token");
        require(userData.length == 32, "userData must contain tokenId");
        uint256 tokenId = abi.decode(userData, (uint256));

        Listing memory item = listings[tokenId];
        require(item.price > 0, "Not listed");
        require(amount >= item.price, "Not enough tokens");

        require(token.transfer(item.seller, item.price), "Pay seller failed");
        nft.transferFrom(address(this), from, tokenId);
        delete listings[tokenId];

        emit Purchased(from, tokenId, item.price); // 触发购买事件
    }
}
