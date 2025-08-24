# NFT Market 部署到 Sepolia 测试网

## 准备工作

### 1. 环境变量设置

在项目根目录创建 `.env` 文件：

```bash
# 你的私钥（不要包含0x前缀）
PRIVATE_KEY=your_private_key_here

# Sepolia RPC URL（可选，脚本中已设置默认值）
ETH_RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_PROJECT_ID
```

### 2. 获取 Sepolia 测试网 ETH

在部署之前，你需要一些 Sepolia 测试网的 ETH 来支付 gas 费用。可以通过以下方式获取：

- [Sepolia Faucet](https://sepoliafaucet.com/)
- [Alchemy Sepolia Faucet](https://sepoliafaucet.com/)
- [Infura Sepolia Faucet](https://www.infura.io/faucet/sepolia)

## 部署步骤

### 1. 编译合约

```bash
forge build
```

### 2. 部署到 Sepolia

```bash
forge script script/NFTMarketDeploy.s.sol --rpc-url https://sepolia.infura.io/v3/YOUR_INFURA_PROJECT_ID --broadcast --verify
```

或者使用环境变量：

```bash
forge script script/NFTMarketDeploy.s.sol --rpc-url $ETH_RPC_URL --broadcast --verify
```

### 3. 查看部署结果

部署完成后，脚本会打印以下信息：

- MyToken 合约地址
- MyNFT 合约地址  
- NFTMarket 合约地址
- 部署者地址
- 部署者私钥

## 合约功能

### MyToken (ERC777)
- 总供应量：1,000,000 代币
- 支持 ERC777 标准
- 支持 ERC20 兼容性

### MyNFT (ERC721)
- 简单的 NFT 合约
- 支持铸造和转移
- 部署后会自动为部署者铸造 3 个 NFT

### NFTMarket
- NFT 交易市场
- 支持上架和购买 NFT
- 使用 MyToken 作为支付代币

## 注意事项

1. **私钥安全**：确保 `.env` 文件不会被提交到版本控制系统
2. **Gas 费用**：Sepolia 测试网的 gas 费用相对较低，但仍需要足够的 ETH
3. **网络确认**：部署后等待几个区块确认以确保交易成功
4. **合约验证**：建议在部署后验证合约代码

## 故障排除

如果遇到问题，请检查：

1. 私钥是否正确设置
2. 是否有足够的 Sepolia ETH
3. RPC URL 是否可访问
4. 网络连接是否正常

## 支持

如有问题，请检查：
- Foundry 版本是否最新
- 合约代码是否正确编译
- 网络配置是否正确
