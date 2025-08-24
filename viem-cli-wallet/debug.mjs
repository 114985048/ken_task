#!/usr/bin/env node
// debug.mjs - ERC20 转账调试工具
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import {
  createPublicClient,
  http,
  parseUnits,
  encodeFunctionData,
  getAddress,
  formatEther,
} from 'viem';
import { sepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

// ---------- 配置 ----------
const WALLET_FILE = resolve(process.cwd(), 'wallet.json');
const RPC_URL = process.argv.includes('--rpc')
  ? process.argv[process.argv.indexOf('--rpc') + 1]
  : process.env.SEPOLIA_RPC_URL;

function requireRpc() {
  if (!RPC_URL) {
    console.error('缺少 RPC：请设置环境变量 SEPOLIA_RPC_URL，或在命令后加 --rpc <url>');
    process.exit(1);
  }
}

function loadWallet() {
  if (!existsSync(WALLET_FILE)) {
    console.error('未找到 wallet.json，请先执行：node wallet.mjs gen');
    process.exit(1);
  }
  const { privateKey, address } = JSON.parse(readFileSync(WALLET_FILE, 'utf8'));
  return { privateKey, address };
}

function client() {
  requireRpc();
  return createPublicClient({
    chain: sepolia,
    transport: http(RPC_URL),
  });
}

// ---------- 调试函数 ----------
async function debugTokenInfo(tokenAddress) {
  const c = client();
  const tokenAddr = getAddress(tokenAddress);
  
  console.log('🔍 代币信息诊断');
  console.log('代币地址:', tokenAddr);
  console.log('网络: Sepolia');
  console.log('---');
  
  // 最小 ERC20 ABI
  const erc20Abi = [
    { type: 'function', name: 'name', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
    { type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
    { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
    { type: 'function', name: 'totalSupply', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
    { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }], outputs: [{ type: 'uint256' }] },
    { type: 'function', name: 'transfer', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] },
  ];

  try {
    // 检查代币基本信息
    const [name, symbol, decimals, totalSupply] = await Promise.all([
      c.readContract({ address: tokenAddr, abi: erc20Abi, functionName: 'name' }).catch(() => 'Unknown'),
      c.readContract({ address: tokenAddr, abi: erc20Abi, functionName: 'symbol' }).catch(() => 'Unknown'),
      c.readContract({ address: tokenAddr, abi: erc20Abi, functionName: 'decimals' }).catch(() => 18),
      c.readContract({ address: tokenAddr, abi: erc20Abi, functionName: 'totalSupply' }).catch(() => 0n),
    ]);

    console.log('代币名称:', name);
    console.log('代币符号:', symbol);
    console.log('小数位数:', decimals);
    console.log('总供应量:', formatEther(totalSupply), symbol);
    console.log('---');

    // 检查发送者余额
    const { address } = loadWallet();
    const balance = await c.readContract({
      address: tokenAddr,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [address],
    });

    console.log('发送者地址:', address);
    console.log('代币余额:', formatEther(balance), symbol);
    console.log('---');

    // 检查 ETH 余额（用于支付 gas）
    const ethBalance = await c.getBalance({ address });
    console.log('ETH 余额:', formatEther(ethBalance), 'ETH');
    console.log('---');

    return { name, symbol, decimals, totalSupply, balance, ethBalance };
  } catch (error) {
    console.error('❌ 读取代币信息失败:', error.message);
    return null;
  }
}

async function debugTransferSimulation(tokenAddress, toAddress, amount) {
  const c = client();
  const { privateKey, address } = loadWallet();
  const account = privateKeyToAccount(privateKey);
  
  console.log('🧪 转账模拟诊断');
  console.log('---');
  
  try {
    const tokenInfo = await debugTokenInfo(tokenAddress);
    if (!tokenInfo) return;
    
    const { decimals, balance } = tokenInfo;
    const amountUnits = parseUnits(amount, decimals);
    
    console.log('转账详情:');
    console.log('发送数量:', amount, `(${amountUnits} 最小单位)`);
    console.log('接收地址:', toAddress);
    console.log('---');
    
    // 检查余额是否足够
    if (balance < amountUnits) {
      console.error('❌ 余额不足!');
      console.error(`需要: ${amount} ${tokenInfo.symbol}`);
      console.error(`可用: ${formatEther(balance)} ${tokenInfo.symbol}`);
      return;
    }
    
    // 模拟 gas 估算
    const erc20Abi = [
      { type: 'function', name: 'transfer', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] },
    ];
    
    const data = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transfer',
      args: [getAddress(toAddress), amountUnits],
    });
    
    console.log('正在估算 gas...');
    const gas = await c.estimateGas({
      account: account.address,
      to: getAddress(tokenAddress),
      data,
      value: 0n,
    });
    
    const { maxFeePerGas, maxPriorityFeePerGas } = await c.estimateFeesPerGas();
    const estimatedCost = (gas * maxFeePerGas) / 1e18;
    
    console.log('Gas 估算成功!');
    console.log('预估 Gas:', gas.toString());
    console.log('预估费用:', formatEther(gas * maxFeePerGas), 'ETH');
    console.log('---');
    
    // 检查 ETH 是否足够支付 gas
    if (tokenInfo.ethBalance < estimatedCost) {
      console.error('❌ ETH 余额不足以支付 gas 费用!');
      console.error(`需要: ${formatEther(gas * maxFeePerGas)} ETH`);
      console.error(`可用: ${formatEther(tokenInfo.ethBalance)} ETH`);
      return;
    }
    
    console.log('✅ 所有检查通过，转账应该可以成功执行');
    
  } catch (error) {
    console.error('❌ 转账模拟失败:', error.message);
    
    // 提供常见错误的解决方案
    if (error.message.includes('insufficient funds')) {
      console.log('💡 解决方案: 确保账户有足够的 ETH 支付 gas 费用');
    } else if (error.message.includes('execution reverted')) {
      console.log('💡 可能原因:');
      console.log('   - 代币合约已暂停或有限制');
      console.log('   - 代币合约地址错误');
      console.log('   - 代币合约有特殊权限要求');
    } else if (error.message.includes('nonce')) {
      console.log('💡 解决方案: 等待之前的交易确认，或手动设置正确的 nonce');
    }
  }
}

async function debugContractCode(tokenAddress) {
  const c = client();
  const tokenAddr = getAddress(tokenAddress);
  
  console.log('📜 合约代码诊断');
  console.log('代币地址:', tokenAddr);
  console.log('---');
  
  try {
    const code = await c.getBytecode({ address: tokenAddr });
    
    if (!code || code === '0x') {
      console.error('❌ 该地址没有合约代码！');
      console.log('可能原因:');
      console.log('  - 地址错误');
      console.log('  - 合约已被销毁');
      console.log('  - 该地址从未部署过合约');
      return;
    }
    
    console.log('✅ 合约代码存在');
    console.log('代码长度:', (code.length - 2) / 2, '字节'); // 减去 0x 前缀
    
    // 检查是否是代理合约
    if (code.includes('363d3d373d3d3d363d73')) {
      console.log('🔍 检测到可能的代理合约模式');
    }
    
    // 检查是否包含 ERC20 相关函数签名
    const erc20Signatures = [
      'a9059cbb', // transfer(address,uint256)
      '70a08231', // balanceOf(address)
      '18160ddd', // totalSupply()
      '313ce567', // decimals()
    ];
    
    const hasErc20Functions = erc20Signatures.some(sig => code.includes(sig));
    if (hasErc20Functions) {
      console.log('✅ 包含标准 ERC20 函数');
    } else {
      console.log('⚠️  可能不是标准 ERC20 合约');
    }
    
  } catch (error) {
    console.error('❌ 读取合约代码失败:', error.message);
  }
}

// ---------- CLI 路由 ----------
const [, , cmd, ...rest] = process.argv;

function getFlag(name) {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : undefined;
}

(async () => {
  try {
    switch (cmd) {
      case 'token':
        const tokenAddr = getFlag('address');
        if (!tokenAddr) {
          console.error('用法: node debug.mjs token --address <代币地址> [--rpc <url>]');
          process.exit(1);
        }
        await debugTokenInfo(tokenAddr);
        break;
        
      case 'simulate':
        const token = getFlag('token');
        const to = getFlag('to');
        const amount = getFlag('amount');
        if (!token || !to || !amount) {
          console.error('用法: node debug.mjs simulate --token <代币地址> --to <接收地址> --amount <数量> [--rpc <url>]');
          process.exit(1);
        }
        await debugTransferSimulation(token, to, amount);
        break;
        
      case 'code':
        const codeAddr = getFlag('address');
        if (!codeAddr) {
          console.error('用法: node debug.mjs code --address <合约地址> [--rpc <url>]');
          process.exit(1);
        }
        await debugContractCode(codeAddr);
        break;
        
      default:
        console.log(`🔧 Viem CLI Wallet 调试工具

用法：
  # 1) 检查代币信息
  node debug.mjs token --address <代币地址> [--rpc <url>]

  # 2) 模拟转账（检查是否可能成功）
  node debug.mjs simulate --token <代币地址> --to <接收地址> --amount <数量> [--rpc <url>]

  # 3) 检查合约代码
  node debug.mjs code --address <合约地址> [--rpc <url>]

示例：
  node debug.mjs token --address 0x1234... --rpc https://sepolia.infura.io/v3/YOUR_KEY
  node debug.mjs simulate --token 0x1234... --to 0x5678... --amount 1.5 --rpc https://sepolia.infura.io/v3/YOUR_KEY

备注：
- 默认从环境变量 SEPOLIA_RPC_URL 读取 RPC
- 也可以使用 --rpc 传入 RPC URL`);
        process.exit(0);
    }
  } catch (err) {
    console.error('❌ 错误:', err?.shortMessage ?? err?.message ?? err);
    process.exit(1);
  }
})();
