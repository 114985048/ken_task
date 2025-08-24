import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { ReownAppKit } from '@reown/appkit';
import { createConfig } from '@reown/appkit-wagmi';
import { WagmiCore } from 'wagmi';

// 合约ABI定义
const NFT_MARKET_ABI = [
  "event Listed(address indexed seller, uint256 indexed tokenId, uint256 price)",
  "event Purchased(address indexed buyer, uint256 indexed tokenId, uint256 price)",
  "function list(uint256 tokenId, uint256 price) external",
  "function buyNFT(uint256 tokenId) external",
  "function listings(uint256) external view returns (address seller, uint256 price)"
];

const MY_TOKEN_ABI = [
  "function balanceOf(address account) external view returns (uint256)",
  "function transferFrom(address sender, address recipient, uint256 amount) external returns (bool)",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function send(address recipient, uint256 amount, bytes calldata data) external"
];

const MY_NFT_ABI = [
  "function mint(address to) external",
  "function ownerOf(uint256 tokenId) external view returns (address)",
  "function transferFrom(address from, address to, uint256 tokenId) external",
  "function nextTokenId() external view returns (uint256)",
  "function approve(address to, uint256 tokenId) external"
];

// 合约地址 - 替换为您实际部署的地址
const NFT_MARKET_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const MY_TOKEN_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
const MY_NFT_ADDRESS = "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0";

// 类型定义
interface Listing {
  tokenId: number;
  seller: string;
  price: string;
}

interface Notification {
  title: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface Chain {
  id: number;
  name: string;
}

const App: React.FC = () => {
  // 状态管理
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [address, setAddress] = useState<string>("");
  const [formattedAddress, setFormattedAddress] = useState<string>("");
  const [chain, setChain] = useState<Chain>({ name: "Unknown", id: 0 });
  const [tokenBalance, setTokenBalance] = useState<string>("0");
  const [listings, setListings] = useState<Listing[]>([]);
  const [listTokenId, setListTokenId] = useState<string>("");
  const [listPrice, setListPrice] = useState<string>("");
  const [listStatus, setListStatus] = useState<string>("");
  const [lastMintedTokenId, setLastMintedTokenId] = useState<number | null>(null);
  const [notification, setNotification] = useState<Notification | null>(null);
  
  // 合约实例
  const [nftMarketContract, setNftMarketContract] = useState<ethers.Contract | null>(null);
  const [tokenContract, setTokenContract] = useState<ethers.Contract | null>(null);
  const [nftContract, setNftContract] = useState<ethers.Contract | null>(null);
  
  // AppKit实例
  const [appKit, setAppKit] = useState<ReownAppKit | null>(null);
  const [provider, setProvider] = useState<ethers.providers.Web3Provider | null>(null);

  // 初始化AppKit
  const initAppKit = useCallback(() => {
    try {
      const newAppKit = new ReownAppKit.Core({
        projectId: "your-project-id", // 替换为您的Project ID
        networks: [1, 5, 137, 31337],
        metadata: {
          name: "NFT Marketplace",
          description: "A simple NFT marketplace",
          url: window.location.origin,
          icons: [`${window.location.origin}/favicon.ico`]
        }
      });

      // 初始化Wagmi配置
      const config = createConfig({
        appKit: newAppKit,
        chains: WagmiCore.chains
      });

      // 监听连接状态变化
      newAppKit.subscribe((state) => {
        if (state.accounts.length > 0 && state.chainId) {
          handleConnect(state.accounts[0], state.chainId, newAppKit);
        } else {
          handleDisconnect();
        }
      });

      setAppKit(newAppKit);
    } catch (error) {
      console.error("Failed to initialize AppKit:", error);
      showNotification("Initialization Error", "Failed to set up wallet connection", "error");
    }
  }, []);

  // 组件挂载时初始化
  useEffect(() => {
    initAppKit();
  }, [initAppKit]);

  // 处理连接
  const handleConnect = async (account: string, chainId: number, appKitInstance: ReownAppKit) => {
    try {
      setIsConnected(true);
      setAddress(account);
      setFormattedAddress(formatAddress(account));
      
      // 设置链信息
      setChain({
        id: chainId,
        name: getChainName(chainId)
      });
      
      // 初始化提供者和合约
      const newProvider = new ethers.providers.Web3Provider(appKitInstance.getProvider());
      const signer = newProvider.getSigner();
      
      setProvider(newProvider);
      
      // 创建合约实例
      const marketContract = new ethers.Contract(
        NFT_MARKET_ADDRESS, 
        NFT_MARKET_ABI, 
        signer
      );
      
      const tokenContractInstance = new ethers.Contract(
        MY_TOKEN_ADDRESS, 
        MY_TOKEN_ABI, 
        signer
      );
      
      const nftContractInstance = new ethers.Contract(
        MY_NFT_ADDRESS, 
        MY_NFT_ABI, 
        signer
      );
      
      setNftMarketContract(marketContract);
      setTokenContract(tokenContractInstance);
      setNftContract(nftContractInstance);
      
      // 加载数据
      await loadTokenBalance(tokenContractInstance, account);
      await loadListings(marketContract);
      
      showNotification("Connected", `Successfully connected with ${formattedAddress}`, "success");
    } catch (error) {
      console.error("Connection error:", error);
      showNotification("Connection Error", "Failed to complete connection", "error");
    }
  };

  // 处理断开连接
  const handleDisconnect = () => {
    setIsConnected(false);
    setAddress("");
    setFormattedAddress("");
    setChain({ name: "Unknown", id: 0 });
    setTokenBalance("0");
    setListings([]);
    setNftMarketContract(null);
    setTokenContract(null);
    setNftContract(null);
    
    showNotification("Disconnected", "Wallet disconnected successfully", "info");
  };

  // 连接/断开钱包
  const connectWallet = () => {
    if (isConnected && appKit) {
      appKit.disconnect();
    } else if (appKit) {
      appKit.open();
    }
  };

  // 加载代币余额
  const loadTokenBalance = async (contract: ethers.Contract, account: string) => {
    try {
      const balance = await contract.balanceOf(account);
      setTokenBalance(ethers.utils.formatEther(balance));
    } catch (error) {
      console.error("Error loading token balance:", error);
      showNotification("Error", "Failed to load token balance", "error");
    }
  };

  // 加载NFT列表
  const loadListings = async (contract: ethers.Contract) => {
    try {
      const newListings: Listing[] = [];
      
      // 检查前20个tokenId
      for (let i = 0; i < 20; i++) {
        try {
          const listing = await contract.listings(i);
          if (listing.price.gt(0)) {
            newListings.push({
              tokenId: i,
              seller: listing.seller,
              price: ethers.utils.formatEther(listing.price)
            });
          }
        } catch (e) {
          continue;
        }
      }
      
      setListings(newListings);
    } catch (error) {
      console.error("Error loading listings:", error);
      showNotification("Error", "Failed to load NFT listings", "error");
    }
  };

  // 铸造NFT
  const mintNFT = async () => {
    if (!isConnected || !nftContract) return;
    
    try {
      showNotification("Processing", "Minting NFT...", "info");
      
      const tx = await nftContract.mint(address);
      await tx.wait();
      
      // 获取最新铸造的tokenId
      const nextTokenId = await nftContract.nextTokenId();
      const mintedId = nextTokenId.sub(1).toNumber();
      setLastMintedTokenId(mintedId);
      
      showNotification("Success", `NFT #${mintedId} minted successfully`, "success");
    } catch (error) {
      console.error("Error minting NFT:", error);
      showNotification("Error", "Failed to mint NFT", "error");
    }
  };

  // 上架NFT
  const listNFT = async () => {
    if (!isConnected || !nftMarketContract || !nftContract || !listTokenId || !listPrice) return;
    
    try {
      setListStatus("Listing NFT...");
      
      const tokenId = parseInt(listTokenId);
      const priceInWei = ethers.utils.parseEther(listPrice);
      
      // 批准市场合约转移NFT
      const approveTx = await nftContract.approve(NFT_MARKET_ADDRESS, tokenId);
      await approveTx.wait();
      
      // 上架NFT
      const tx = await nftMarketContract.list(tokenId, priceInWei);
      await tx.wait();
      
      setListStatus(`NFT #${tokenId} listed successfully!`);
      showNotification("Success", `NFT #${tokenId} listed for ${listPrice} MTK`, "success");
      
      // 刷新列表
      if (nftMarketContract) {
        await loadListings(nftMarketContract);
      }
      
      // 重置表单
      setTimeout(() => {
        setListTokenId("");
        setListPrice("");
        setListStatus("");
      }, 2000);
    } catch (error) {
      console.error("Error listing NFT:", error);
      setListStatus("Failed to list NFT");
      showNotification("Error", "Failed to list NFT", "error");
    }
  };

  // 购买NFT
  const buyNFT = async (tokenId: number) => {
    if (!isConnected || !nftMarketContract || !tokenContract) return;
    
    try {
      showNotification("Processing", `Purchasing NFT #${tokenId}...`, "info");
      
      // 获取列表信息
      const listing = await nftMarketContract.listings(tokenId);
      const price = listing.price;
      
      // 批准市场合约使用代币
      const approveTx = await tokenContract.approve(NFT_MARKET_ADDRESS, price);
      await approveTx.wait();
      
      // 购买NFT
      const tx = await nftMarketContract.buyNFT(tokenId);
      await tx.wait();
      
      showNotification("Success", `NFT #${tokenId} purchased successfully`, "success");
      
      // 刷新数据
      if (tokenContract && address) {
        await loadTokenBalance(tokenContract, address);
      }
      if (nftMarketContract) {
        await loadListings(nftMarketContract);
      }
    } catch (error) {
      console.error("Error buying NFT:", error);
      showNotification("Error", "Failed to purchase NFT", "error");
    }
  };

  // 辅助函数：格式化地址
  const formatAddress = (addr: string) => {
    if (!addr) return "";
    return addr.slice(0, 6) + "..." + addr.slice(-4);
  };

  // 辅助函数：获取链名称
  const getChainName = (chainId: number) => {
    const chains: Record<number, string> = {
      1: "Ethereum Mainnet",
      5: "Goerli Testnet",
      137: "Polygon Mainnet",
      31337: "Hardhat Local"
    };
    
    return chains[chainId] || `Chain ID: ${chainId}`;
  };

  // 辅助函数：检查是否是当前用户
  const isCurrentUser = (addressToCheck: string) => {
    return address.toLowerCase() === addressToCheck.toLowerCase();
  };

  // 显示通知
  const showNotification = (title: string, message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setNotification({ title, message, type });
    
    // 5秒后自动清除通知
    setTimeout(() => {
      setNotification(null);
    }, 5000);
  };

  // 清除通知
  const clearNotification = () => {
    setNotification(null);
  };

  return (
    <div className="bg-gradient-to-br from-gray-900 to-[#1e1b4b] min-h-screen text-gray-100">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <header className="flex justify-between items-center mb-12">
          <div className="flex items-center space-x-2">
            <i className="fa fa-shield text-[#6366f1] text-3xl"></i>
            <h1 className="text-2xl md:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-[#6366f1] to-[#8b5cf6]">
              NFT Marketplace
            </h1>
          </div>
          
          <div className="flex items-center space-x-4">
            {isConnected && (
              <div className="hidden md:flex items-center space-x-2 bg-gray-800 rounded-full px-4 py-2">
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                <span className="text-sm truncate max-w-[150px]">{formattedAddress}</span>
              </div>
            )}
            
            <button 
              onClick={connectWallet}
              className="bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] hover:opacity-90 text-white font-medium py-2 px-6 rounded-full transition-all duration-300 flex items-center space-x-2"
            >
              <i className="fa fa-wallet"></i>
              <span>{isConnected ? 'Disconnect' : 'Connect Wallet'}</span>
            </button>
          </div>
        </header>
        
        {/* Wallet Info */}
        {isConnected && (
          <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 mb-10 border border-gray-700">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h2 className="text-xl font-semibold mb-2">Wallet Information</h2>
                <p className="text-gray-400 text-sm mb-1">Address: {address}</p>
                <p className="text-gray-400 text-sm">Network: {chain.name}</p>
              </div>
              
              <div className="flex flex-col items-end">
                <p className="text-gray-400 text-sm">Token Balance</p>
                <p className="text-2xl font-bold">{tokenBalance} MTK</p>
              </div>
            </div>
          </div>
        )}
        
        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Mint & List NFT */}
          <div className="lg:col-span-1 space-y-8">
            {/* Mint NFT */}
            <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-gray-700 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
              <h2 className="text-xl font-semibold mb-4">Mint New NFT</h2>
              <button 
                onClick={mintNFT}
                className="w-full bg-[#6366f1] hover:bg-[#6366f1]/90 text-white font-medium py-3 px-4 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2"
                disabled={!isConnected}
              >
                <i className="fa fa-magic"></i>
                <span>Mint NFT</span>
              </button>
              {lastMintedTokenId !== null && (
                <p className="mt-3 text-green-400 text-sm text-center">
                  Successfully minted NFT #{lastMintedTokenId}
                </p>
              )}
            </div>
            
            {/* List NFT */}
            <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-gray-700 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
              <h2 className="text-xl font-semibold mb-4">List NFT for Sale</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">NFT Token ID</label>
                  <input 
                    type="number" 
                    value={listTokenId}
                    onChange={(e) => setListTokenId(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[#6366f1]"
                    placeholder="Enter NFT ID"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Price (MTK)</label>
                  <input 
                    type="number" 
                    value={listPrice}
                    onChange={(e) => setListPrice(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[#6366f1]"
                    placeholder="Enter price"
                    step="0.01"
                  />
                </div>
                <button 
                  onClick={listNFT}
                  className="w-full bg-[#8b5cf6] hover:bg-[#8b5cf6]/90 text-white font-medium py-3 px-4 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2"
                  disabled={!isConnected || !listTokenId || !listPrice}
                >
                  <i className="fa fa-tag"></i>
                  <span>List NFT</span>
                </button>
              </div>
              {listStatus && (
                <p className="mt-3 text-green-400 text-sm text-center">
                  {listStatus}
                </p>
              )}
            </div>
          </div>
          
          {/* Right Column: NFT Listings */}
          <div className="lg:col-span-2">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-semibold">Available NFTs</h2>
              <p className="text-gray-400 text-sm">{listings.length} items</p>
            </div>
            
            {listings.length === 0 ? (
              <div className="bg-white/10 backdrop-blur-md rounded-xl p-10 border border-gray-700 text-center">
                <i className="fa fa-inbox text-5xl text-gray-600 mb-4"></i>
                <p className="text-gray-400">No NFTs listed for sale yet</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {listings.map((listing) => (
                  <div 
                    key={listing.tokenId}
                    className="bg-white/10 backdrop-blur-md rounded-xl overflow-hidden border border-gray-700 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
                  >
                    <div className="h-48 bg-gray-800 flex items-center justify-center">
                      <img 
                        src={`https://picsum.photos/seed/nft${listing.tokenId}/400/300`} 
                        alt={`NFT #${listing.tokenId}`} 
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="p-5">
                      <div className="flex justify-between items-start mb-3">
                        <h3 className="font-semibold text-lg">NFT #{listing.tokenId}</h3>
                        <span className="bg-[#6366f1]/20 text-[#6366f1] text-sm px-2 py-1 rounded-full">
                          {listing.price} MTK
                        </span>
                      </div>
                      <p className="text-gray-400 text-sm mb-4">Seller: {formatAddress(listing.seller)}</p>
                      <button 
                        onClick={() => buyNFT(listing.tokenId)}
                        className="w-full bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] hover:opacity-90 text-white font-medium py-2 px-4 rounded-lg transition-all duration-300"
                        disabled={!isConnected || isCurrentUser(listing.seller)}
                      >
                        Buy Now
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        
        {/* Notifications */}
        {notification && (
          <div className="fixed bottom-6 right-6 max-w-sm bg-white/10 backdrop-blur-md rounded-lg p-4 border border-gray-700 shadow-lg transform transition-all duration-500 ease-in-out">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                {notification.type === 'success' && <i className="fa fa-check-circle text-green-500 text-xl"></i>}
                {notification.type === 'error' && <i className="fa fa-exclamation-circle text-red-500 text-xl"></i>}
                {notification.type === 'info' && <i className="fa fa-info-circle text-blue-500 text-xl"></i>}
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium">{notification.title}</p>
                <p className="text-sm text-gray-400 mt-1">{notification.message}</p>
              </div>
              <button 
                onClick={clearNotification} 
                className="ml-auto flex-shrink-0 text-gray-400 hover:text-gray-200"
              >
                <i className="fa fa-times"></i>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
