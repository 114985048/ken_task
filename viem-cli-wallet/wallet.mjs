#!/usr/bin/env node
// wallet.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import {
  createPublicClient,
  http,
  parseEther,
  formatEther,
  parseUnits,
  encodeFunctionData,
  getAddress,
//   privateKeyToAccount,
//   generatePrivateKey,
} from 'viem';
import { sepolia } from 'viem/chains';
// wallet.mjs
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
// ---------- Helpers ----------
const WALLET_FILE = resolve(process.cwd(), 'wallet.json');
const ENV = process.env;
const RPC_URL =
  process.argv.includes('--rpc')
    ? process.argv[process.argv.indexOf('--rpc') + 1]
    : ENV.SEPOLIA_RPC_URL;

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

function saveWallet({ privateKey, address }) {
  writeFileSync(
    WALLET_FILE,
    JSON.stringify({ privateKey, address }, null, 2),
    'utf8',
  );
  console.log(`已保存到 ${WALLET_FILE}`);
}

function client() {
  requireRpc();
  return createPublicClient({
    chain: sepolia,
    transport: http(RPC_URL),
  });
}

// ---------- Commands ----------
async function cmdGen() {
  const pk = generatePrivateKey(); // 0x...
  const account = privateKeyToAccount(pk);
  console.log('=== 新钱包 ===');
  console.log('Address :', account.address);
  console.log('PrivKey :', pk);
  console.log('（请妥善保管私钥！此示例未做加密，仅演示用）');
  saveWallet({ privateKey: pk, address: account.address });
}

async function cmdBalance({ address }) {
  const c = client();
  const addr =
    address ??
    (existsSync(WALLET_FILE) ? JSON.parse(readFileSync(WALLET_FILE, 'utf8')).address : null);

  if (!addr) {
    console.error('请通过 --address <0x...> 指定地址，或先生成钱包：node wallet.mjs gen');
    process.exit(1);
  }
  const checksum = getAddress(addr);
  const wei = await c.getBalance({ address: checksum });
  console.log('地址：', checksum);
  console.log('Sepolia ETH 余额：', formatEther(wei), 'ETH');
}

async function cmdErc20Transfer({ token, to, amount, fromPk }) {
  if (!token || !to || !amount) {
    console.error('缺少参数：--token <erc20地址> --to <接收地址> --amount <数量(十进制)>');
    process.exit(1);
  }

  // 账户来源：优先 --from-pk；否则 wallet.json
  let pk = fromPk;
  let fromAddr;
  if (!pk) {
    const { privateKey, address } = loadWallet();
    pk = privateKey;
    fromAddr = address;
  }
  const account = privateKeyToAccount(pk);
  if (!fromAddr) fromAddr = account.address;

  const c = client();

  const tokenAddr = getAddress(token);
  const toAddr = getAddress(to);

  // 最小 ERC20 ABI
  const erc20Abi = [
    { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
    { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }], outputs: [{ type: 'uint256' }] },
    { type: 'function', name: 'transfer', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] },
  ];

  // 读取 decimals 并把十进制字符串转换成最小单位
  const decimals = await c.readContract({
    address: tokenAddr,
    abi: erc20Abi,
    functionName: 'decimals',
  });
  const amountUnits = parseUnits(amount, decimals);

  // 编码 data
  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: 'transfer',
    args: [toAddr, amountUnits],
  });

  // 构建 EIP-1559 交易
  const nonce = await c.getTransactionCount({ address: account.address });
  const { maxFeePerGas, maxPriorityFeePerGas } = await c.estimateFeesPerGas();

  // 估算 gas（给出上限缓冲）
  const gas = await c.estimateGas({
    account: account.address,
    to: tokenAddr,
    data,
    value: 0n,
  });

  const tx = {
    chainId: sepolia.id,           // 11155111
    to: tokenAddr,
    nonce,
    data,
    value: 0n,
    type: 'eip1559',
    maxFeePerGas,
    maxPriorityFeePerGas,
    gas: (gas * 120n) / 100n,      // +20% buffer
  };

  // 本地签名
  const signed = await account.signTransaction(tx);

  // 广播
  const hash = await c.sendRawTransaction({ serializedTransaction: signed });

  console.log('已发送 ERC20 转账交易：');
  console.log('From   :', account.address);
  console.log('To     :', toAddr);
  console.log('Token  :', tokenAddr);
  console.log('Amount :', amount, `(decimals=${decimals})`);
  console.log('TxHash :', hash);
  console.log('在区块浏览器查询： https://sepolia.etherscan.io/tx/' + hash);
}

// ---------- CLI Router ----------
const [, , cmd, ...rest] = process.argv;

function getFlag(name) {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : undefined;
}

(async () => {
  try {
    switch (cmd) {
      case 'gen':
        await cmdGen();
        break;
      case 'balance':
        await cmdBalance({ address: getFlag('address') });
        break;
      case 'erc20:transfer':
        await cmdErc20Transfer({
          token: getFlag('token'),
          to: getFlag('to'),
          amount: getFlag('amount'),     // 十进制字符串，例如 "1.5"
          fromPk: getFlag('from-pk'),    // 可选：覆盖使用的私钥
        });
        break;
      default:
        console.log(`Viem CLI Wallet
用法：
  # 1) 生成私钥（保存到 wallet.json）
  node wallet.mjs gen [--rpc <url>]

  # 2) 查询 Sepolia ETH 余额（可先人工转入测试币）
  node wallet.mjs balance [--address <0x地址>] [--rpc <url>]

  # 3) 发送 ERC20 转账（EIP-1559，先保证地址有少量ETH付gas）
  node wallet.mjs erc20:transfer --token <token地址> --to <接收地址> --amount <数量> [--from-pk <私钥>] [--rpc <url>]

备注：
- 默认从 .env 的 SEPOLIA_RPC_URL 读取 RPC；也可以使用 --rpc 传入。
- 不指定 --from-pk 时，会读取本地 wallet.json 的私钥。`);
        process.exit(0);
    }
  } catch (err) {
    console.error('❌ 错误：', err?.shortMessage ?? err?.message ?? err);
    
    // 提供更详细的错误信息和解决方案
    if (err?.message?.includes('execution reverted')) {
      console.log('\n💡 常见解决方案:');
      console.log('1. 检查代币合约地址是否正确');
      console.log('2. 确认代币合约在 Sepolia 网络上存在');
      console.log('3. 检查代币余额是否足够');
      console.log('4. 确认代币合约没有特殊限制');
      console.log('\n🔧 使用调试工具:');
      console.log('node debug.mjs token --address <代币地址> --rpc <rpc_url>');
      console.log('node debug.mjs simulate --token <代币地址> --to <接收地址> --amount <数量> --rpc <rpc_url>');
    } else if (err?.message?.includes('insufficient funds')) {
      console.log('\n💡 解决方案: 确保账户有足够的 ETH 支付 gas 费用');
    } else if (err?.message?.includes('nonce')) {
      console.log('\n💡 解决方案: 等待之前的交易确认，或手动设置正确的 nonce');
    }
    
    process.exit(1);
  }
})();
