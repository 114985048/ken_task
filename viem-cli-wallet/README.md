# Viem CLI Wallet

一个基于 Viem 的命令行以太坊钱包工具，支持 Sepolia 测试网。

## 功能特性

- 🔑 生成和管理私钥
- 💰 查询 ETH 余额
- 🪙 发送 ERC20 代币转账
- 🔧 内置调试工具
- 📱 支持 EIP-1559 交易类型

## 安装依赖

```bash
npm install
```

## 使用方法

### 1. 生成钱包

```bash
# 生成新的私钥和地址
node wallet.mjs gen --rpc https://sepolia.infura.io/v3/YOUR_KEY

# 或设置环境变量
export SEPOLIA_RPC_URL="https://sepolia.infura.io/v3/5d5f5f69309e4db2a9db93070fd9e8c4"
node wallet.mjs gen
```

### 2. 查询余额

```bash
# 查询钱包中的 ETH 余额
node wallet.mjs balance --rpc https://sepolia.infura.io/v3/5d5f5f69309e4db2a9db93070fd9e8c4

# 查询指定地址的余额
node wallet.mjs balance --address 0x1234... --rpc https://sepolia.infura.io/v3/5d5f5f69309e4db2a9db93070fd9e8c4
```

### 3. 发送 ERC20 代币

```bash
# 发送代币转账
node wallet.mjs erc20:transfer \
  --token 0xfd844f145dc16cca4a2f87a86935945850db86af \
  --to 0xD02Df345F3DbbeFCE420048eC0f2562a18d40B0F \
  --amount 1 \
  --rpc https://sepolia.infura.io/v3/5d5f5f69309e4db2a9db93070fd9e8c4
```

## 调试工具

当遇到 "Execution reverted" 等错误时，可以使用内置的调试工具：

### 1. 检查代币信息

```bash
# 检查代币的基本信息、余额等
node debug.mjs token --address 0xfd844f145dc16cca4a2f87a86935945850db86af --rpc https://sepolia.infura.io/v3/5d5f5f69309e4db2a9db93070fd9e8c4
```

### 2. 模拟转账

```bash
# 模拟转账操作，检查是否可能成功
node debug.mjs simulate \
  --token 0xfd844f145dc16cca4a2f87a86935945850db86af \
  --to 0x接收地址 \
  --amount 1.5 \
  --rpc https://sepolia.infura.io/v3/5d5f5f69309e4db2a9db93070fd9e8c4
```

### 3. 检查合约代码

```bash
# 检查合约地址是否包含代码
node debug.mjs code --address 0xfd844f145dc16cca4a2f87a86935945850db86af --rpc https://sepolia.infura.io/v3/5d5f5f69309e4db2a9db93070fd9e8c4
```

## 常见问题解决

### "Execution reverted for an unknown reason"

这个错误通常由以下原因引起：

1. **代币合约地址错误**
   - 确认代币合约地址正确
   - 确认代币合约在 Sepolia 网络上存在

2. **代币余额不足**
   - 检查发送地址的代币余额
   - 使用 `debug.mjs token` 命令查看余额

3. **代币合约限制**
   - 某些代币合约可能有转账限制
   - 合约可能已暂停或有限制

4. **ETH 余额不足**
   - 确保账户有足够的 ETH 支付 gas 费用
   - 建议至少保持 0.01 ETH 用于 gas

### 调试步骤

1. 首先使用 `debug.mjs token` 检查代币信息
2. 使用 `debug.mjs simulate` 模拟转账
3. 使用 `debug.mjs code` 检查合约代码
4. 查看详细的错误信息和解决方案

## 安全注意事项

⚠️ **重要提醒**：

- 此工具仅用于测试和学习目的
- 私钥以明文形式存储在 `wallet.json` 中，请勿用于生产环境
- 请勿在钱包中存储大量资金
- 定期更换测试用的私钥

## 环境变量

- `SEPOLIA_RPC_URL`: Sepolia 测试网的 RPC 端点
- 也可以在命令行中使用 `--rpc <url>` 参数

## 网络支持

目前支持：
- ✅ Sepolia 测试网

计划支持：
- 🔄 Ethereum 主网
- 🔄 其他 EVM 兼容链

## 故障排除

如果遇到问题：

1. 检查 RPC 端点是否可访问
2. 确认网络连接正常
3. 查看详细的错误信息
4. 使用调试工具诊断问题
5. 检查 Sepolia 测试网状态

## 许可证

MIT License
