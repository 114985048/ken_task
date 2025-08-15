import { useEffect, useState } from "react";
import { ethers } from "ethers";

// 声明 window.ethereum 类型
declare global {
  interface Window {
    ethereum?: any;
  }
}

// ======= 这里替换成你部署的地址 =======
const tokenAddress = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
const bankAddress = "0x959922bE3CAee4b8Cd9a407cc3ac1C251C2007B1";

// MyToken ABI（最简）
const tokenAbi = [
  "function balanceOf(address account) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function name() view returns (string)",
  "function symbol() view returns (string)"
];

// TokenBank ABI（最简）
const bankAbi = [
  "function getBalance(address user) view returns (uint256)",
  "function deposit(uint256 amount)",
  "function withdraw(uint256 amount)",
  "function token() view returns (address)"
];

export default function App() {
  const [account, setAccount] = useState<string | null>(null);
  const [tokenBalance, setTokenBalance] = useState<string>("0");
  const [bankBalance, setBankBalance] = useState<string>("0");
  const [allowance, setAllowance] = useState<string>("0");
  const [rawTokenBalance, setRawTokenBalance] = useState<string>("0");
  const [tokenDecimals, setTokenDecimals] = useState<number>(18);
  const [amount, setAmount] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<string>("");

  const [tokenContract, setTokenContract] = useState<ethers.Contract | null>(null);
  const [bankContract, setBankContract] = useState<ethers.Contract | null>(null);

  // 连接钱包
  const connectWallet = async () => {
    if (window.ethereum) {
      try {
        const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
        setAccount(accounts[0]);
        setMessage("钱包连接成功！");
      } catch (error) {
        setMessage("连接钱包失败，请重试");
      }
    } else {
      setMessage("请先安装 MetaMask");
    }
  };

  // 初始化 ethers
  useEffect(() => {
    if (account && window.ethereum) {
      const provider = new ethers.BrowserProvider(window.ethereum);
      provider.getSigner().then(async (signer) => {
        const tokenContract = new ethers.Contract(tokenAddress, tokenAbi, signer);
        const bankContract = new ethers.Contract(bankAddress, bankAbi, signer);
        
        // 获取 Token 精度
        try {
          const decimals = await tokenContract.decimals();
          setTokenDecimals(decimals);
        } catch (error) {
          console.log("获取 Token 精度失败，使用默认值 18");
          setTokenDecimals(18);
        }
        
        setTokenContract(tokenContract);
        setBankContract(bankContract);
      });
    }
  }, [account]);

  // 加载余额
  const loadBalances = async () => {
    if (tokenContract && bankContract && account) {
      try {
        const bal = await tokenContract.balanceOf(account);
        const bankBal = await bankContract.getBalance(account);
        const allow = await tokenContract.allowance(account, bankAddress);
        
        // 使用正确的精度格式化
        setTokenBalance(ethers.formatUnits(bal, tokenDecimals));
        setBankBalance(ethers.formatUnits(bankBal, tokenDecimals));
        setAllowance(ethers.formatUnits(allow, tokenDecimals));
        setRawTokenBalance(bal.toString()); // 存储原始余额
        
        console.log("原始余额:", bal.toString());
        console.log("Token 精度:", tokenDecimals);
        console.log("格式化后余额:", ethers.formatUnits(bal, tokenDecimals));
      } catch (error) {
        setMessage("加载余额失败");
        console.error("加载余额错误:", error);
      }
    }
  };

  useEffect(() => {
    if (account) {
      loadBalances();
    }
  }, [tokenContract, bankContract]);

  // 存款
  const deposit = async () => {
    if (!amount || !tokenContract || !bankContract) {
      setMessage("请输入存款金额");
      return;
    }
    
    if (parseFloat(amount) <= 0) {
      setMessage("存款金额必须大于0");
      return;
    }

    // 验证 Token 余额是否足够
    if (parseFloat(amount) > parseFloat(tokenBalance)) {
      setMessage(`Token 余额不足！当前余额: ${tokenBalance} MTK，需要: ${amount} MTK`);
      return;
    }

    setLoading(true);
    setMessage("正在处理存款...");
    
    try {
      const amt = ethers.parseUnits(amount, tokenDecimals);
      
      // 调试信息
      console.log("存款调试信息:");
      console.log("- 输入金额:", amount);
      console.log("- Token 精度:", tokenDecimals);
      console.log("- 解析后金额:", amt.toString());
      console.log("- 当前 Token 余额:", rawTokenBalance);
      console.log("- 格式化后余额:", tokenBalance);
      console.log("- Token 合约地址:", tokenAddress);
      console.log("- Bank 合约地址:", bankAddress);
      
      // 再次验证原始余额
      const currentBalance = await tokenContract.balanceOf(account);
      console.log("- 实时查询余额:", currentBalance.toString());
      
      if (currentBalance < amt) {
        throw new Error(`余额不足: 当前余额 ${currentBalance.toString()}, 需要 ${amt.toString()}`);
      }
      
      // 先检查当前授权额度
      const currentAllowance = await tokenContract.allowance(account, bankAddress);
      console.log("- 当前授权额度:", currentAllowance.toString());
      
      if (currentAllowance < amt) {
        // 需要授权
        setMessage("正在授权 Token 使用...");
        const approveTx = await tokenContract.approve(bankAddress, amt);
        setMessage("等待授权确认...");
        await approveTx.wait();
        setMessage("授权成功，正在存款...");
      }
      
      // 存款
      const depositTx = await bankContract.deposit(amt);
      setMessage("等待存款确认...");
      await depositTx.wait();
      
      setAmount("");
      await loadBalances();
      setMessage("存款成功！");
    } catch (error: any) {
      console.error("存款错误:", error);
      
      // 解析错误信息
      if (error.reason) {
        setMessage(`存款失败: ${error.reason}`);
      } else if (error.message) {
        if (error.message.includes("Not enough balance")) {
          setMessage("存款失败: Token 余额不足");
        } else if (error.message.includes("insufficient funds")) {
          setMessage("存款失败: 账户 ETH 余额不足");
        } else if (error.message.includes("余额不足")) {
          setMessage(`存款失败: ${error.message}`);
        } else {
          setMessage(`存款失败: ${error.message}`);
        }
      } else {
        setMessage("存款失败，请重试");
      }
    } finally {
      setLoading(false);
    }
  };

  // 取款
  const withdraw = async () => {
    if (!amount || !bankContract) {
      setMessage("请输入取款金额");
      return;
    }
    
    if (parseFloat(amount) <= 0) {
      setMessage("取款金额必须大于0");
      return;
    }
    
    if (parseFloat(amount) > parseFloat(bankBalance)) {
      setMessage(`取款金额不能超过存款余额！当前存款: ${bankBalance} MTK，取款: ${amount} MTK`);
      return;
    }

    setLoading(true);
    setMessage("正在处理取款...");
    
    try {
      const amt = ethers.parseUnits(amount, tokenDecimals);
      const withdrawTx = await bankContract.withdraw(amt);
      setMessage("等待取款确认...");
      await withdrawTx.wait();
      
      setAmount("");
      await loadBalances();
      setMessage("取款成功！");
    } catch (error: any) {
      console.error("取款错误:", error);
      
      // 解析错误信息
      if (error.reason) {
        setMessage(`取款失败: ${error.reason}`);
      } else if (error.message) {
        if (error.message.includes("Not enough balance")) {
          setMessage("取款失败: Bank 余额不足");
        } else if (error.message.includes("insufficient funds")) {
          setMessage("取款失败: 账户 ETH 余额不足");
        } else {
          setMessage(`取款失败: ${error.message}`);
        }
      } else {
        setMessage("取款失败，请重试");
      }
    } finally {
      setLoading(false);
    }
  };

  // 刷新余额
  const refreshBalances = async () => {
    setMessage("正在刷新余额...");
    await loadBalances();
    setMessage("余额已刷新");
  };

  // 验证合约连接
  const verifyContracts = async () => {
    if (!tokenContract || !bankContract) {
      setMessage("请先连接钱包");
      return;
    }
    
    try {
      setMessage("正在验证合约连接...");
      
      // 验证 Token 合约
      let tokenName, tokenSymbol, tokenDecimals;
      try {
        tokenName = await tokenContract.name();
        tokenSymbol = await tokenContract.symbol();
        tokenDecimals = await tokenContract.decimals();
        
        console.log("Token 合约信息:");
        console.log("- 名称:", tokenName);
        console.log("- 符号:", tokenSymbol);
        console.log("- 精度:", tokenDecimals);
        console.log("- 地址:", tokenAddress);
      } catch (error) {
        console.error("Token 合约验证失败:", error);
        setMessage("Token 合约验证失败，请检查合约地址");
        return;
      }
      
      // 验证 Bank 合约
      let bankToken;
      try {
        bankToken = await bankContract.token();
        console.log("Bank 合约信息:");
        console.log("- 连接的 Token:", bankToken);
        console.log("- 地址:", bankAddress);
      } catch (error) {
        console.error("Bank 合约验证失败:", error);
        setMessage("Bank 合约验证失败，请检查合约地址");
        return;
      }
      
      // 检查 Token 地址是否匹配
      if (bankToken.toLowerCase() !== tokenAddress.toLowerCase()) {
        setMessage(`⚠️ 警告: Bank 合约连接的 Token 地址不匹配！\nBank: ${bankToken}\n前端: ${tokenAddress}`);
        console.warn("Token 地址不匹配:", { bank: bankToken, frontend: tokenAddress });
      } else {
        setMessage("✅ 合约验证成功！Token 地址匹配");
        console.log("✅ 合约验证成功！");
      }
      
      // 更新精度
      setTokenDecimals(tokenDecimals);
      
      // 显示合约摘要
      console.log("📋 合约验证摘要:");
      console.log("- Token 名称:", tokenName);
      console.log("- Token 符号:", tokenSymbol);
      console.log("- Token 精度:", tokenDecimals);
      console.log("- Token 地址:", tokenAddress);
      console.log("- Bank 地址:", bankAddress);
      console.log("- Bank 连接的 Token:", bankToken);
      
    } catch (error) {
      console.error("合约验证失败:", error);
      setMessage("合约验证失败，请检查合约地址和网络连接");
    }
  };

  // 检查余额详情
  const checkBalanceDetails = async () => {
    if (!tokenContract || !account) {
      setMessage("请先连接钱包");
      return;
    }
    
    try {
      setMessage("正在检查余额详情...");
      
      const rawBalance = await tokenContract.balanceOf(account);
      const decimals = await tokenContract.decimals();
      const formattedBalance = ethers.formatUnits(rawBalance, decimals);
      
      console.log("💰 余额详情:");
      console.log("- 账户地址:", account);
      console.log("- 原始余额:", rawBalance.toString());
      console.log("- Token 精度:", decimals);
      console.log("- 格式化余额:", formattedBalance);
      console.log("- 前端显示余额:", tokenBalance);
      
      // 检查余额是否匹配
      if (Math.abs(parseFloat(formattedBalance) - parseFloat(tokenBalance)) > 0.001) {
        setMessage(`⚠️ 余额不匹配！\n实际: ${formattedBalance} MTK\n前端: ${tokenBalance} MTK`);
        console.warn("余额不匹配:", { actual: formattedBalance, frontend: tokenBalance });
      } else {
        setMessage(`✅ 余额检查通过！\n实际余额: ${formattedBalance} MTK`);
        console.log("✅ 余额检查通过！");
      }
      
    } catch (error) {
      console.error("余额检查失败:", error);
      setMessage("余额检查失败，请重试");
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>🏦 TokenBank DApp</h1>
        
        {!account ? (
          <div style={styles.connectSection}>
            <p style={styles.description}>连接您的钱包开始使用 TokenBank</p>
            <button 
              onClick={connectWallet} 
              style={styles.connectButton}
            >
              🔗 连接钱包
            </button>
          </div>
        ) : (
          <>
            <div style={styles.accountInfo}>
              <p style={styles.accountText}>
                <strong>当前账户:</strong> {account.slice(0, 6)}...{account.slice(-4)}
              </p>
            </div>

            <div style={styles.balanceSection}>
              <div style={styles.balanceCard}>
                <h3 style={styles.balanceTitle}>💰 Token 余额</h3>
                <p style={styles.balanceAmount}>{tokenBalance} MTK</p>
              </div>
              
              <div style={styles.balanceCard}>
                <h3 style={styles.balanceTitle}>🏦 Bank 存款</h3>
                <p style={styles.balanceAmount}>{bankBalance} MTK</p>
              </div>
              
              <div style={styles.balanceCard}>
                <h3 style={styles.balanceTitle}>🔐 授权额度</h3>
                <p style={styles.balanceAmount}>{allowance} MTK</p>
              </div>
            </div>

            <div style={styles.debugInfo}>
              <p style={styles.debugText}>
                🔍 调试信息: Token 精度 = {tokenDecimals} | 
                原始余额 = {rawTokenBalance}
              </p>
              {tokenContract && (
                <p style={styles.debugText}>
                  💡 提示: 如果 Token 精度 = 1，输入 1 实际代表 0.1 MTK
                </p>
              )}
            </div>

            <button 
              onClick={refreshBalances} 
              style={styles.refreshButton}
              disabled={loading}
            >
              🔄 刷新余额
            </button>

            <button 
              onClick={verifyContracts} 
              style={styles.verifyButton}
              disabled={loading}
            >
              🔍 验证合约
            </button>

            <button 
              onClick={checkBalanceDetails} 
              style={styles.verifyButton}
              disabled={loading}
            >
              💰 检查余额详情
            </button>

            <div style={styles.tipsSection}>
              <p style={styles.tipsText}>
                💡 <strong>操作提示:</strong> 首次存款需要先授权，后续存款如果授权额度足够则无需重复授权
              </p>
            </div>

            <div style={styles.inputSection}>
              <input
                type="number"
                placeholder={`输入数量 (精度: ${tokenDecimals})`}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                style={styles.input}
                disabled={loading}
                min="0"
                step={tokenDecimals === 1 ? "0.1" : "0.01"}
              />
              
              {tokenDecimals === 1 && (
                <p style={styles.inputHint}>
                  💡 提示: Token 精度为 1，输入 10 代表 1.0 MTK，输入 100 代表 10.0 MTK
                </p>
              )}
              
              <div style={styles.buttonGroup}>
                <button 
                  onClick={deposit} 
                  style={styles.depositButton}
                  disabled={loading || !amount}
                >
                  💰 存款
                </button>
                
                <button 
                  onClick={withdraw} 
                  style={styles.withdrawButton}
                  disabled={loading || !amount}
                >
                  💸 取款
                </button>
              </div>
            </div>

            {message && (
              <div style={styles.message}>
                {message}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    padding: '20px',
    fontFamily: 'Arial, sans-serif'
  },
  card: {
    maxWidth: '600px',
    margin: '0 auto',
    background: 'white',
    borderRadius: '20px',
    padding: '40px',
    boxShadow: '0 20px 40px rgba(0,0,0,0.1)',
    textAlign: 'center' as const
  },
  title: {
    color: '#333',
    marginBottom: '30px',
    fontSize: '2.5em',
    fontWeight: 'bold'
  },
  connectSection: {
    marginTop: '40px'
  },
  description: {
    color: '#666',
    fontSize: '1.1em',
    marginBottom: '30px'
  },
  connectButton: {
    background: 'linear-gradient(45deg, #667eea, #764ba2)',
    color: 'white',
    border: 'none',
    padding: '15px 30px',
    borderRadius: '25px',
    fontSize: '1.1em',
    cursor: 'pointer',
    fontWeight: 'bold',
    transition: 'transform 0.2s',
    ':hover': {
      transform: 'scale(1.05)'
    }
  },
  accountInfo: {
    background: '#f8f9fa',
    padding: '15px',
    borderRadius: '10px',
    marginBottom: '30px'
  },
  accountText: {
    margin: '0',
    color: '#333',
    fontSize: '1em'
  },
  balanceSection: {
    display: 'flex',
    gap: '20px',
    marginBottom: '30px',
    justifyContent: 'center',
    flexWrap: 'wrap' as const
  },
  balanceCard: {
    background: 'linear-gradient(135deg, #667eea, #764ba2)',
    color: 'white',
    padding: '20px',
    borderRadius: '15px',
    minWidth: '150px',
    boxShadow: '0 10px 20px rgba(0,0,0,0.1)'
  },
  balanceTitle: {
    margin: '0 0 10px 0',
    fontSize: '1em',
    opacity: 0.9
  },
  balanceAmount: {
    margin: '0',
    fontSize: '1.5em',
    fontWeight: 'bold'
  },
  refreshButton: {
    background: '#28a745',
    color: 'white',
    border: 'none',
    padding: '10px 20px',
    borderRadius: '20px',
    cursor: 'pointer',
    marginBottom: '30px',
    fontSize: '1em',
    transition: 'background 0.2s'
  },
  inputSection: {
    marginBottom: '20px'
  },
  input: {
    width: '100%',
    padding: '15px',
    border: '2px solid #e9ecef',
    borderRadius: '10px',
    fontSize: '1em',
    marginBottom: '20px',
    boxSizing: 'border-box' as const,
    ':focus': {
      outline: 'none',
      borderColor: '#667eea'
    }
  },
  buttonGroup: {
    display: 'flex',
    gap: '15px',
    justifyContent: 'center',
    flexWrap: 'wrap' as const
  },
  depositButton: {
    background: 'linear-gradient(45deg, #28a745, #20c997)',
    color: 'white',
    border: 'none',
    padding: '15px 30px',
    borderRadius: '25px',
    fontSize: '1.1em',
    cursor: 'pointer',
    fontWeight: 'bold',
    transition: 'transform 0.2s',
    ':hover': {
      transform: 'scale(1.05)'
    }
  },
  withdrawButton: {
    background: 'linear-gradient(45deg, #dc3545, #fd7e14)',
    color: 'white',
    border: 'none',
    padding: '15px 30px',
    borderRadius: '25px',
    fontSize: '1.1em',
    cursor: 'pointer',
    fontWeight: 'bold',
    transition: 'transform 0.2s',
    ':hover': {
      transform: 'scale(1.05)'
    }
  },
  message: {
    background: '#e3f2fd',
    color: '#1976d2',
    padding: '15px',
    borderRadius: '10px',
    marginTop: '20px',
    fontSize: '1em'
  },
  tipsSection: {
    background: '#f0f9eb',
    color: '#67c23a',
    padding: '15px',
    borderRadius: '10px',
    marginBottom: '20px',
    fontSize: '0.9em',
    fontWeight: 'bold'
  },
  tipsText: {
    margin: '0'
  },
  debugInfo: {
    background: '#f8f9fa',
    padding: '15px',
    borderRadius: '10px',
    marginBottom: '20px',
    fontSize: '0.9em',
    color: '#333'
  },
  debugText: {
    margin: '0'
  },
  inputHint: {
    color: '#666',
    fontSize: '0.9em',
    marginTop: '10px',
    textAlign: 'left' as const,
    paddingLeft: '10px'
  },
  verifyButton: {
    background: '#007bff',
    color: 'white',
    border: 'none',
    padding: '10px 20px',
    borderRadius: '20px',
    cursor: 'pointer',
    marginBottom: '30px',
    fontSize: '1em',
    transition: 'background 0.2s'
  }
};
