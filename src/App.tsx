import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Settings, 
  Activity, 
  TrendingUp, 
  TrendingDown, 
  Shield, 
  Clock, 
  Zap, 
  Server, 
  Key, 
  XCircle,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  Terminal,
  Wallet,
  CheckCircle2,
  AlertCircle,
  ShieldAlert,
  FileText,
  Download,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ApiConfig, OrderForm, Position, TradeLog, AccountBalance, OpenOrder, PositionHistory } from './types';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  LabelList
} from 'recharts';
import * as XLSX from 'xlsx';

export default function App() {
  // State
  const [view, setView] = useState<'DASHBOARD' | 'REPORT'>('DASHBOARD');
  const [positionHistory, setPositionHistory] = useState<PositionHistory[]>([]);
  const [isFetchingHistory, setIsFetchingHistory] = useState(false);
  
  // Date range for history (default to last 7 days)
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });
  
  const [apiConfig, setApiConfig] = useState<ApiConfig>({
    apiKey: '',
    apiSecret: '',
    baseUrl: 'https://fapi.binance.com', // Binance Futures API
  });
  
  const [serverIp, setServerIp] = useState<string>('加载中...');
  const [isConnected, setIsConnected] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  
  const [positionMode, setPositionMode] = useState<'ONE_WAY' | 'HEDGE'>('ONE_WAY');
  const [isApiVisible, setIsApiVisible] = useState(false);
  const [isRiskVisible, setIsRiskVisible] = useState(false);
  const [isRiskProcessing, setIsRiskProcessing] = useState(false);
  const [isCancellingAll, setIsCancellingAll] = useState(false);
  const [exchangeInfo, setExchangeInfo] = useState<any>(null);

  // Active Risk Control State
  const [activeRisk, setActiveRisk] = useState({
    enabled: false,
    tp: 3,
    sl: 5,
  });

  const [orderForm, setOrderForm] = useState<OrderForm>({
    symbol: 'BTCUSDT', // Binance Futures format
    side: 'BUY',
    type: 'MARKET',
    amount: 0.001,
  });

  const [positions, setPositions] = useState<Position[]>([]);
  const [openOrders, setOpenOrders] = useState<OpenOrder[]>([]);
  const [isTrading, setIsTrading] = useState(false);
  
  const [logs, setLogs] = useState<TradeLog[]>([]);
  const [balance, setBalance] = useState<AccountBalance>({
    asset: 'USDT',
    balance: 0,
    available: 0,
    unrealizedPnl: 0
  });

  // Calculate win/loss streaks for the chart
  const chartData = React.useMemo(() => {
    const streaks: any[] = [];
    if (positionHistory.length > 0) {
      // positionHistory is sorted by timestamp DESC (newest first)
      // We need to process from oldest to newest for streaks
      const sortedHistory = [...positionHistory].sort((a, b) => a.timestamp - b.timestamp);
      
      let currentStreak: any = null;
      
      sortedHistory.forEach((h) => {
        const isWin = h.pnl > 0;
        if (!currentStreak) {
          currentStreak = { isWin, count: 1 };
        } else if (currentStreak.isWin === isWin) {
          currentStreak.count++;
        } else {
          streaks.push(currentStreak);
          currentStreak = { isWin, count: 1 };
        }
      });
      if (currentStreak) streaks.push(currentStreak);
    }

    return streaks.map((s, idx) => ({
      name: idx + 1,
      count: s.count,
      isWin: s.isWin,
      color: s.isWin ? '#10B981' : '#EF4444'
    }));
  }, [positionHistory]);

  const historyTotals = React.useMemo(() => {
    return positionHistory.reduce((acc, curr) => {
      acc.totalPnl += curr.pnl;
      acc.totalCommission += curr.commission;
      acc.totalFunding += curr.fundingFee;
      return acc;
    }, { totalPnl: 0, totalCommission: 0, totalFunding: 0 });
  }, [positionHistory]);

  const logEndRef = useRef<HTMLDivElement>(null);

  // Helper: Add Log
  const addLog = useCallback((message: string, type: TradeLog['type'] = 'INFO') => {
    const newLog: TradeLog = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: Date.now(),
      type,
      message
    };
    setLogs(prev => [newLog, ...prev].slice(0, 100)); // Keep last 100 logs
  }, []);

  const fetchExchangeInfo = async (apiKey?: string, apiSecret?: string) => {
    try {
      const response = await fetch('/api/binance-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: '/fapi/v1/exchangeInfo',
          apiKey: apiKey || apiConfig.apiKey,
          apiSecret: apiSecret || apiConfig.apiSecret
        })
      });
      const data = await response.json();
      if (response.ok) {
        setExchangeInfo(data);
        addLog('交易对精度信息已同步', 'SUCCESS');
      }
    } catch (error) {
      addLog('获取交易对精度信息失败', 'ERROR');
    }
  };

  const getSymbolInfo = (symbol: string) => {
    if (!exchangeInfo || !exchangeInfo.symbols) return null;
    return exchangeInfo.symbols.find((s: any) => s.symbol === symbol);
  };

  const formatPrice = (symbol: string, price: number) => {
    const info = getSymbolInfo(symbol);
    if (!info) return price.toString();
    
    const priceFilter = info.filters.find((f: any) => f.filterType === 'PRICE_FILTER');
    if (priceFilter) {
      const tickSize = parseFloat(priceFilter.tickSize);
      const roundedPrice = Math.round(price / tickSize) * tickSize;
      return roundedPrice.toFixed(info.pricePrecision);
    }
    
    return price.toFixed(info.pricePrecision);
  };

  const formatQty = (symbol: string, qty: number) => {
    const info = getSymbolInfo(symbol);
    if (!info) return qty.toString();
    
    const lotSizeFilter = info.filters.find((f: any) => f.filterType === 'LOT_SIZE');
    if (lotSizeFilter) {
      const stepSize = parseFloat(lotSizeFilter.stepSize);
      const roundedQty = Math.floor(qty / stepSize) * stepSize; // Use floor for quantity to avoid exceeding balance
      return roundedQty.toFixed(info.quantityPrecision);
    }
    
    return qty.toFixed(info.quantityPrecision);
  };

  // Auto-scroll logs
  useEffect(() => {
    // We don't necessarily want to scroll to bottom if they are looking at old logs, 
    // but for a trading terminal, usually we want the newest at the top or bottom.
    // Here I'm putting newest at the top, so no scroll needed.
  }, [logs]);

  // Fetch Server IP
  useEffect(() => {
    fetch('/api/server-info')
      .then(res => res.json())
      .then(data => {
        setServerIp(data.ip);
        addLog(`服务器 IP 已获取: ${data.ip}`, 'INFO');
      })
      .catch(() => {
        setServerIp('127.0.0.1');
        addLog('获取服务器 IP 失败，使用回退地址', 'ERROR');
      });
  }, [addLog]);

  // API Verification
  const handleVerifyConnection = async () => {
    if (!apiConfig.apiKey || !apiConfig.apiSecret) {
      addLog('验证失败: 请先输入 API Key 和 Secret', 'ERROR');
      return;
    }

    setIsVerifying(true);
    addLog('正在尝试连接币安永续合约服务器...', 'INFO');

    try {
      const response = await fetch('/api/binance-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: '/fapi/v2/account',
          apiKey: apiConfig.apiKey,
          apiSecret: apiConfig.apiSecret
        })
      });

      const data = await response.json();

      if (response.ok) {
        setIsConnected(true);
        fetchExchangeInfo(apiConfig.apiKey, apiConfig.apiSecret);
        const usdtAsset = data.assets.find((a: any) => a.asset === 'USDT');
        if (usdtAsset) {
          setBalance({
            asset: 'USDT',
            balance: parseFloat(usdtAsset.walletBalance),
            available: parseFloat(usdtAsset.availableBalance),
            unrealizedPnl: parseFloat(usdtAsset.unrealizedProfit)
          });
        }

        // Auto-detect Position Mode (Hedge or One-way)
        try {
          const modeResponse = await fetch('/api/binance-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              endpoint: '/fapi/v1/positionSide/dual',
              apiKey: apiConfig.apiKey,
              apiSecret: apiConfig.apiSecret
            })
          });
          const modeData = await modeResponse.json();
          if (modeResponse.ok) {
            const isHedge = modeData.dualSidePosition; // true for Hedge, false for One-way
            setPositionMode(isHedge ? 'HEDGE' : 'ONE_WAY');
            addLog(`持仓模式已同步: ${isHedge ? '双向持仓 (Hedge)' : '单向持仓 (One-way)'}`, 'INFO');
          }
        } catch (e) {
          console.error('Failed to sync position mode');
        }

        addLog('连接成功: 币安 API 验证通过', 'SUCCESS');
        addLog(`账户余额已同步: ${usdtAsset?.walletBalance || '0'} USDT`, 'INFO');
      } else {
        setIsConnected(false);
        addLog(`连接失败: ${data.msg || data.error || '未知错误'}`, 'ERROR');
      }
    } catch (error) {
      addLog('网络异常: 无法连接到代理服务器', 'ERROR');
    } finally {
      setIsVerifying(false);
    }
  };

  // Periodic Balance Refresh
  useEffect(() => {
    if (!isConnected) return;

    const fetchBalance = async () => {
      try {
        const response = await fetch('/api/binance-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: '/fapi/v2/balance',
            apiKey: apiConfig.apiKey,
            apiSecret: apiConfig.apiSecret
          })
        });
        const data = await response.json();
        if (response.ok && Array.isArray(data)) {
          const usdtBalance = data.find((b: any) => b.asset === 'USDT');
          if (usdtBalance) {
            setBalance({
              asset: 'USDT',
              balance: parseFloat(usdtBalance.balance),
              available: parseFloat(usdtBalance.availableBalance),
              unrealizedPnl: parseFloat(usdtBalance.crossUnPnl)
            });
          }
        }
      } catch (error) {
        // Silent fail for background refresh
      }
    };

    const interval = setInterval(fetchBalance, 5000);
    return () => clearInterval(interval);
  }, [isConnected, apiConfig.apiKey, apiConfig.apiSecret]);

  // Real Position & Order Updates
  useEffect(() => {
    if (!isConnected) return;

    const fetchData = async () => {
      try {
        // Fetch Positions
        const posPromise = fetch('/api/binance-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: '/fapi/v2/positionRisk',
            apiKey: apiConfig.apiKey,
            apiSecret: apiConfig.apiSecret
          })
        });

        // Fetch Normal Orders
        const ordersPromise = fetch('/api/binance-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: '/fapi/v1/openOrders',
            apiKey: apiConfig.apiKey,
            apiSecret: apiConfig.apiSecret
          })
        });

        // Fetch Algo Orders
        const algoPromise = fetch('/api/binance-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: '/fapi/v1/openAlgoOrders',
            apiKey: apiConfig.apiKey,
            apiSecret: apiConfig.apiSecret
          })
        });

        const [posRes, ordersRes, algoRes] = await Promise.all([posPromise, ordersPromise, algoPromise]);
        
        if (posRes.ok) {
          const data = await posRes.json();
          if (Array.isArray(data)) {
            const activePositions = data.filter((p: any) => parseFloat(p.positionAmt) !== 0);
            const mappedPositions: Position[] = activePositions.map((p: any) => {
              const amount = Math.abs(parseFloat(p.positionAmt));
              const entryPrice = parseFloat(p.entryPrice);
              const markPrice = parseFloat(p.markPrice);
              const pnl = parseFloat(p.unRealizedProfit);
              const pnlPercent = (pnl / (entryPrice * amount)) * 100;

              return {
                id: p.symbol + p.positionSide,
                symbol: p.symbol,
                side: parseFloat(p.positionAmt) > 0 ? 'BUY' : 'SELL',
                positionSide: p.positionSide,
                entryPrice,
                markPrice,
                amount,
                pnl,
                pnlPercent,
                timestamp: Date.now()
              };
            });
            setPositions(mappedPositions);
          }
        }

        let combinedOrders: OpenOrder[] = [];

        if (ordersRes.ok) {
          const normalOrders = await ordersRes.json();
          if (Array.isArray(normalOrders)) {
            combinedOrders = [...combinedOrders, ...normalOrders.map((o: any) => ({
              id: o.orderId.toString(),
              symbol: o.symbol,
              side: o.side,
              type: o.type,
              price: parseFloat(o.price),
              stopPrice: parseFloat(o.stopPrice),
              isAlgo: false,
              time: o.time,
              positionSide: o.positionSide
            }))];
          }
        }

        if (algoRes.ok) {
          const algoData = await algoRes.json();
          const algoOrders = Array.isArray(algoData) ? algoData : (algoData.orders || algoData.algoOrders || []);
          if (Array.isArray(algoOrders)) {
            combinedOrders = [...combinedOrders, ...algoOrders.map((o: any) => ({
              id: o.algoId.toString(),
              symbol: o.symbol,
              side: o.side,
              type: o.algoType || o.type,
              price: parseFloat(o.price || 0),
              stopPrice: parseFloat(o.stopPrice || 0),
              isAlgo: true,
              time: o.time,
              positionSide: o.positionSide
            }))];
          }
        }

        // Sort by time descending (newest first)
        setOpenOrders(combinedOrders.sort((a, b) => b.time - a.time));

      } catch (error) {
        // Silent fail for background refresh
      }
    };

    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [isConnected, apiConfig.apiKey, apiConfig.apiSecret]);

  const handleCancelOrder = async (order: OpenOrder) => {
    if (!isConnected) return;
    
    addLog(`正在撤销委托: ${order.symbol} ${order.id}...`, 'TRADE');
    
    try {
      const endpoint = order.isAlgo ? '/fapi/v1/algoOrder' : '/fapi/v1/order';
      const params = order.isAlgo ? { algoId: order.id } : { symbol: order.symbol, orderId: order.id };
      
      const response = await fetch('/api/binance-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: 'DELETE',
          endpoint: endpoint,
          params: params,
          apiKey: apiConfig.apiKey,
          apiSecret: apiConfig.apiSecret
        })
      });

      const data = await response.json();
      if (response.ok) {
        addLog(`委托已撤销: ${order.symbol} ${order.id}`, 'SUCCESS');
      } else {
        addLog(`撤销失败: ${data.msg || '未知错误'}`, 'ERROR');
      }
    } catch (error) {
      addLog('网络异常: 撤销请求失败', 'ERROR');
    }
  };

  const handlePlaceOrder = async () => {
    if (!isConnected) {
      addLog('下单失败: 请先验证 API 连接', 'ERROR');
      return;
    }

    setIsTrading(true);
    
    // Normalize symbol: uppercase and append USDT if missing
    let normalizedSymbol = orderForm.symbol.toUpperCase().trim();
    if (normalizedSymbol && !normalizedSymbol.endsWith('USDT') && !normalizedSymbol.endsWith('BUSD')) {
      normalizedSymbol += 'USDT';
    }

    addLog(`正在发送 ${orderForm.side} 订单: ${orderForm.amount} ${normalizedSymbol}...`, 'TRADE');

    // Determine positionSide based on mode
    let positionSide = 'BOTH';
    if (positionMode === 'HEDGE') {
      positionSide = orderForm.side === 'BUY' ? 'LONG' : 'SHORT';
    }

    try {
      const response = await fetch('/api/binance-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: 'POST',
          endpoint: '/fapi/v1/order',
          params: {
            symbol: normalizedSymbol,
            side: orderForm.side,
            type: orderForm.type,
            quantity: formatQty(normalizedSymbol, orderForm.amount),
            positionSide: positionSide,
          },
          apiKey: apiConfig.apiKey,
          apiSecret: apiConfig.apiSecret
        })
      });

      const data = await response.json();

      if (response.ok) {
        addLog(`订单成交: ${orderForm.side} ${orderForm.amount} ${normalizedSymbol} @ ${data.avgPrice || '市价'}`, 'SUCCESS');
      } else {
        let errorMsg = data.msg || data.error || '未知错误';
        if (typeof errorMsg === 'string') {
          if (errorMsg.includes('Precision')) {
            errorMsg += ' (请尝试减少下单数量的小数位数)';
          }
          if (errorMsg.includes('position side')) {
            errorMsg += ' (请检查持仓模式设置是否与币安账户一致)';
          }
        }
        addLog(`下单失败: ${errorMsg}`, 'ERROR');
      }
    } catch (error) {
      addLog('网络异常: 下单请求失败', 'ERROR');
    } finally {
      setIsTrading(false);
    }
  };

  const handleClosePosition = async (id: string, currentPositions?: Position[]) => {
    const targetPositions = currentPositions || positions;
    const pos = targetPositions.find(p => p.id === id);
    if (!pos) return;

    addLog(`正在市价平仓: ${pos.symbol} ${pos.side}...`, 'TRADE');

    // Use the EXACT positionSide returned by the API for this position
    const positionSide = pos.positionSide;

    // Fix: Only send reduceOnly in ONE_WAY mode (when positionSide is BOTH)
    const orderParams: any = {
      symbol: pos.symbol,
      side: pos.side === 'BUY' ? 'SELL' : 'BUY',
      type: 'MARKET',
      quantity: formatQty(pos.symbol, pos.amount),
      positionSide: positionSide,
    };

    if (positionSide === 'BOTH') {
      orderParams.reduceOnly = 'true';
    }

    try {
      const response = await fetch('/api/binance-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: 'POST',
          endpoint: '/fapi/v1/order',
          params: orderParams,
          apiKey: apiConfig.apiKey,
          apiSecret: apiConfig.apiSecret
        })
      });

      const data = await response.json();

      if (response.ok) {
        const avgPrice = parseFloat(data.avgPrice || '0');
        addLog(`持仓已平: ${pos.symbol} 平仓价: ${avgPrice || '市价'}`, 'SUCCESS');
        
        // Add to history
        const historyItem: PositionHistory = {
          id: Math.random().toString(36).substr(2, 9),
          symbol: pos.symbol,
          side: pos.side,
          positionSide: pos.positionSide,
          entryPrice: pos.entryPrice,
          exitPrice: avgPrice || pos.markPrice,
          amount: pos.amount,
          tradePnl: pos.pnl,
          commission: 0, // Not immediately available
          fundingFee: 0, // Not immediately available
          pnl: pos.pnl,
          pnlPercent: pos.pnlPercent,
          openTime: pos.timestamp,
          closeTime: Date.now(),
          timestamp: Date.now()
        };
        setPositionHistory(prev => [historyItem, ...prev]);
        
        // --- 撤单流程第一步：撤销普通挂单 ---
        addLog(`[系统] 正在执行撤单流程第一步：撤销 ${pos.symbol} 的普通挂单...`, 'INFO');
        try {
          const cancelResponse = await fetch('/api/binance-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              method: 'DELETE',
              endpoint: '/fapi/v1/allOpenOrders',
              params: { symbol: pos.symbol },
              apiKey: apiConfig.apiKey,
              apiSecret: apiConfig.apiSecret
            })
          });
          const cancelData = await cancelResponse.json();
          if (cancelResponse.ok) {
            addLog(`[系统] 第一步完成：${pos.symbol} 普通挂单已全部撤销`, 'SUCCESS');
          } else {
            addLog(`[系统] 第一步警告：普通挂单撤销异常 - ${cancelData.msg || '未知错误'}`, 'INFO');
          }
        } catch (e) {
          addLog(`[系统] 第一步失败：撤销普通挂单请求异常`, 'ERROR');
        }

        // --- 撤单流程第二步：独立处理算法接口挂单 ---
        addLog(`[系统] 正在执行撤单流程第二步：撤销算法单...`, 'INFO');
        try {
          const algoEndpoint = '/fapi/v1/openAlgoOrders';
          const response = await fetch('/api/binance-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              method: 'GET',
              endpoint: algoEndpoint,
              params: { symbol: pos.symbol },
              baseUrl: "https://fapi.binance.com",
              apiKey: apiConfig.apiKey,
              apiSecret: apiConfig.apiSecret
            })
          });

          if (response.ok) {
            const algoData = await response.json();
            const allOrders = Array.isArray(algoData) ? algoData : (algoData.orders || algoData.algoOrders || []);
            
            if (allOrders.length > 0) {
              addLog(`[系统] 发现 ${allOrders.length} 个活跃算法单，正在逐一撤销...`, 'INFO');
              
              for (const order of allOrders) {
                // 打印订单详情以便调试（仅第一个）
                if (order === allOrders[0]) {
                  addLog(`[调试] 订单详情: ID=${order.algoId}, 状态=${order.orderStatus || order.status}, 类型=${order.algoType}`, 'INFO');
                }

                const delResponse = await fetch('/api/binance-proxy', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    method: 'DELETE',
                    endpoint: '/fapi/v1/algoOrder',
                    params: { algoId: order.algoId },
                    baseUrl: "https://fapi.binance.com",
                    apiKey: apiConfig.apiKey,
                    apiSecret: apiConfig.apiSecret
                  })
                });

                const delResult = await delResponse.json();
                if (delResponse.ok) {
                  addLog(`[系统] 算法单 ${order.algoId} 撤销成功`, 'SUCCESS');
                } else {
                  addLog(`[系统] 算法单 ${order.algoId} 撤销失败: ${JSON.stringify(delResult)}`, 'ERROR');
                }
              }
            } else {
              addLog(`[系统] 未发现活跃算法单，无需撤销。`, 'INFO');
            }
          } else {
            addLog(`[系统] 获取算法单列表失败 (状态码: ${response.status})`, 'ERROR');
          }
        } catch (e: any) {
          addLog(`[系统] 撤销算法单异常: ${e.message}`, 'ERROR');
        }
      } else {
        addLog(`平仓失败: ${data.msg || data.error || '未知错误'}`, 'ERROR');
      }
    } catch (error) {
      addLog('网络异常: 平仓请求失败', 'ERROR');
    }
  };

  const handleActiveRiskSubmit = async () => {
    if (!isConnected) {
      addLog('主动风控失败: API 未连接', 'ERROR');
      return;
    }

    if (positions.length === 0) {
      addLog('主动风控: 当前无活跃持仓，无需提交', 'INFO');
      return;
    }

    setIsRiskProcessing(true);
    addLog(`[主动风控] 开始处理 ${positions.length} 个持仓的云端挂单...`, 'INFO');

    try {
      for (const pos of positions) {
        const direction = pos.side === 'BUY' ? '多单 (LONG)' : '空单 (SHORT)';
        addLog(`[主动风控] 检测到 ${pos.symbol} 为${direction}，正在检查挂单...`, 'INFO');
        
        // 1. Get open orders for this symbol
        const ordersResponse = await fetch('/api/binance-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: '/fapi/v1/openOrders',
            params: { symbol: pos.symbol },
            apiKey: apiConfig.apiKey,
            apiSecret: apiConfig.apiSecret
          })
        });
        
        if (!ordersResponse.ok) {
          const err = await ordersResponse.json();
          addLog(`[主动风控] 获取 ${pos.symbol} 挂单失败: ${err.msg || '未知错误'}`, 'ERROR');
          continue;
        }

        const openOrders = await ordersResponse.json();
        
        // 2. Check for existing TP/SL
        const closingSide = pos.side === 'BUY' ? 'SELL' : 'BUY';
        
        const hasTP = openOrders.some((o: any) => 
          (o.type === 'TAKE_PROFIT_MARKET' || o.type === 'TAKE_PROFIT' || o.type === 'LIMIT') && 
          o.positionSide === pos.positionSide &&
          o.side === closingSide
        );
        const hasSL = openOrders.some((o: any) => 
          (o.type === 'STOP_MARKET' || o.type === 'STOP') && 
          o.positionSide === pos.positionSide &&
          o.side === closingSide
        );

        if (hasTP && hasSL) {
          addLog(`[主动风控] ${pos.symbol} 已存在止盈和止损挂单，跳过`, 'INFO');
          continue;
        }

        const side = pos.side === 'BUY' ? 'SELL' : 'BUY';

        const tpPrice = pos.side === 'BUY' 
          ? pos.entryPrice * (1 + activeRisk.tp / 100)
          : pos.entryPrice * (1 - activeRisk.tp / 100);
        
        const slPrice = pos.side === 'BUY'
          ? pos.entryPrice * (1 - activeRisk.sl / 100)
          : pos.entryPrice * (1 + activeRisk.sl / 100);

        // 4. Submit missing TP/SL
        if (!hasTP || !hasSL) {
          const missingTypes = [];
          if (!hasTP) missingTypes.push('止盈');
          if (!hasSL) missingTypes.push('止损');
          
          addLog(`[主动风控] ${pos.symbol} 缺失 ${missingTypes.join('和')}，正在处理...`, 'TRADE');
          
          // TP Logic: Use Standard LIMIT Order (Maker) to save fees
          if (!hasTP && activeRisk.tp > 0) {
            const placeLimitTP = async () => {
              const orderParams: any = {
                symbol: pos.symbol,
                side: side,
                positionSide: pos.positionSide,
                type: 'LIMIT',
                price: formatPrice(pos.symbol, tpPrice),
                quantity: formatQty(pos.symbol, Math.abs(pos.amount)),
                timeInForce: 'GTC',
              };
              if (pos.positionSide === 'BOTH') orderParams.reduceOnly = 'true';

              const response = await fetch('/api/binance-proxy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  method: 'POST',
                  endpoint: '/fapi/v1/order',
                  params: orderParams,
                  apiKey: apiConfig.apiKey,
                  apiSecret: apiConfig.apiSecret
                })
              });
              return await response.json();
            };

            const limitRes = await placeLimitTP();
            if (limitRes.orderId) {
              addLog(`[主动风控] ${pos.symbol} 止盈限价单挂单成功 (Maker模式)`, 'SUCCESS');
            } else {
              addLog(`[主动风控] ${pos.symbol} 止盈限价单挂单失败: ${limitRes.msg || '未知错误'}`, 'ERROR');
            }
          }

          // SL Logic: Use Algo Order (CONDITIONAL) for safety
          if (!hasSL && activeRisk.sl > 0) {
            const submitAlgoSL = async () => {
              const currentPrice = pos.markPrice;
              const isLong = pos.side === 'BUY';
              
              // Validate price logic
              if ((isLong && slPrice >= currentPrice) || (!isLong && slPrice <= currentPrice)) {
                return { ok: false, msg: `止损价不符合逻辑 (现价:${currentPrice} 止损:${formatPrice(pos.symbol, slPrice)})` };
              }

              const p: any = {
                symbol: pos.symbol,
                side: side,
                positionSide: pos.positionSide,
                quantity: formatQty(pos.symbol, Math.abs(pos.amount)),
                workingType: 'MARK_PRICE',
                stopPrice: formatPrice(pos.symbol, slPrice),
                triggerPrice: formatPrice(pos.symbol, slPrice),
                algoType: 'CONDITIONAL',
                type: 'STOP_MARKET'
              };
              
              const bUrl = "https://fapi.binance.com";
              const ep = "/fapi/v1/algoOrder";
              
              const response = await fetch('/api/binance-proxy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  method: 'POST',
                  endpoint: ep,
                  baseUrl: bUrl,
                  params: p,
                  apiKey: apiConfig.apiKey,
                  apiSecret: apiConfig.apiSecret
                })
              });
              
              const data = await response.json();
              return { ok: response.ok, data };
            };

            const slResult: any = await submitAlgoSL();
            if (slResult.ok) {
              addLog(`[主动风控] ${pos.symbol} 算法止损挂单成功 (CONDITIONAL)`, 'SUCCESS');
            } else {
              const errMsg = slResult.data?.msg || slResult.msg || JSON.stringify(slResult.data);
              addLog(`[主动风控] ${pos.symbol} 算法止损失败: ${errMsg}，尝试标准止损兜底...`, 'INFO');
              
              // Fallback to STOP (Stop Limit)
              const placeStopSL = async () => {
                const isLong = pos.side === 'BUY';
                const limitPrice = isLong ? slPrice * 0.99 : slPrice * 1.01; 
                
                const orderParams: any = {
                  symbol: pos.symbol,
                  side: side,
                  positionSide: pos.positionSide,
                  type: 'STOP',
                  stopPrice: formatPrice(pos.symbol, slPrice),
                  price: formatPrice(pos.symbol, limitPrice),
                  quantity: formatQty(pos.symbol, Math.abs(pos.amount)),
                  workingType: 'MARK_PRICE',
                  timeInForce: 'GTC'
                };
                if (pos.positionSide === 'BOTH') orderParams.reduceOnly = 'true';

                const response = await fetch('/api/binance-proxy', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    method: 'POST',
                    endpoint: '/fapi/v1/order',
                    params: orderParams,
                    apiKey: apiConfig.apiKey,
                    apiSecret: apiConfig.apiSecret
                  })
                });
                
                const contentType = response.headers.get("content-type");
                if (contentType && contentType.includes("application/json")) {
                  return await response.json();
                } else {
                  const text = await response.text();
                  return { msg: "非JSON响应", details: text.substring(0, 100) };
                }
              };

              const stopRes = await placeStopSL();
              if (stopRes.orderId) {
                addLog(`[主动风控] ${pos.symbol} 止损挂单成功 (标准止损模式)`, 'SUCCESS');
              } else {
                addLog(`[主动风控] ${pos.symbol} 止损最终失败: ${stopRes.msg || '未知错误'}`, 'ERROR');
              }
            }
          }
        }
      }
      addLog('[主动风控] 所有持仓处理完毕', 'SUCCESS');
    } catch (error) {
      addLog(`[主动风控] 执行过程中出现异常: ${error instanceof Error ? error.message : '未知错误'}`, 'ERROR');
    } finally {
      setIsRiskProcessing(false);
    }
  };

  const handleCancelAllOrders = async () => {
    if (!isConnected) {
      addLog('撤销失败: API 未连接', 'ERROR');
      return;
    }

    setIsCancellingAll(true);
    addLog('[一键撤销] 开始执行撤销流程...', 'INFO');

    try {
      // 第一步：查找并撤销普通委托
      addLog('[一键撤销] 第一步：正在获取普通委托单...', 'INFO');
      const response = await fetch('/api/binance-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: 'GET',
          endpoint: '/fapi/v1/openOrders',
          apiKey: apiConfig.apiKey,
          apiSecret: apiConfig.apiSecret
        })
      });

      if (!response.ok) {
        const err = await response.json();
        addLog(`[一键撤销] 获取普通委托单失败: ${err.msg || '未知错误'}`, 'ERROR');
      } else {
        const normalOrders = await response.json();
        if (normalOrders.length > 0) {
          addLog(`[一键撤销] 发现 ${normalOrders.length} 个普通委托单，正在撤销...`, 'INFO');
          for (const order of normalOrders) {
            await fetch('/api/binance-proxy', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                method: 'DELETE',
                endpoint: '/fapi/v1/order',
                params: { symbol: order.symbol, orderId: order.orderId },
                apiKey: apiConfig.apiKey,
                apiSecret: apiConfig.apiSecret
              })
            });
          }
          addLog(`[一键撤销] 第一步完成：${normalOrders.length} 个普通委托单已撤销`, 'SUCCESS');
        } else {
          addLog('[一键撤销] 第一步：当前无普通委托单', 'INFO');
        }
      }

      // 第二步：查找并撤销算法委托单
      addLog('[一键撤销] 第二步：正在获取算法委托单...', 'INFO');
      const algoResponse = await fetch('/api/binance-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: 'GET',
          endpoint: '/fapi/v1/openAlgoOrders',
          apiKey: apiConfig.apiKey,
          apiSecret: apiConfig.apiSecret
        })
      });

      if (!algoResponse.ok) {
        const err = await algoResponse.json();
        addLog(`[一键撤销] 获取算法委托单失败: ${err.msg || '未知错误'}`, 'ERROR');
      } else {
        const algoData = await algoResponse.json();
        // 兼容不同的返回格式
        const algoOrders = Array.isArray(algoData) ? algoData : (algoData.orders || algoData.algoOrders || []);
        
        if (algoOrders.length > 0) {
          addLog(`[一键撤销] 发现 ${algoOrders.length} 个算法委托单，正在撤销...`, 'INFO');
          for (const order of algoOrders) {
            await fetch('/api/binance-proxy', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                method: 'DELETE',
                endpoint: '/fapi/v1/algoOrder',
                params: { algoId: order.algoId },
                apiKey: apiConfig.apiKey,
                apiSecret: apiConfig.apiSecret
              })
            });
          }
          addLog(`[一键撤销] 第二步完成：${algoOrders.length} 个算法委托单已撤销`, 'SUCCESS');
        } else {
          addLog('[一键撤销] 第二步：当前无算法委托单', 'INFO');
        }
      }

      addLog('[一键撤销] 流程全部完成', 'SUCCESS');
    } catch (error) {
      addLog(`[一键撤销] 流程异常中断: ${error instanceof Error ? error.message : '未知错误'}`, 'ERROR');
    } finally {
      setIsCancellingAll(false);
    }
  };

  const exportToExcel = () => {
    const ws = XLSX.utils.json_to_sheet(positionHistory.map(h => ({
      '合约名称': h.symbol,
      '总盈亏': h.pnl.toFixed(4),
      '成交盈亏': h.tradePnl.toFixed(4),
      '手续费': h.commission.toFixed(4),
      '资金费': h.fundingFee.toFixed(4),
      '开仓均价': h.entryPrice.toFixed(4),
      '平仓均价': h.exitPrice.toFixed(4),
      '开仓时间': new Date(h.openTime).toLocaleString(),
      '最后平仓时间': new Date(h.closeTime).toLocaleString(),
      '数量': h.amount
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "仓位历史记录");
    XLSX.writeFile(wb, `PositionHistory_${new Date().getTime()}.xlsx`);
  };

  const fetchHistoryFromBinance = async () => {
    if (!isConnected) {
      addLog('获取历史失败: API 未连接', 'ERROR');
      return;
    }

    setIsFetchingHistory(true);
    addLog('正在获取账户所有永续合约的历史成交记录...', 'INFO');

    try {
      const startTime = new Date(dateRange.start).getTime();
      const endTime = new Date(dateRange.end).getTime() + (24 * 60 * 60 * 1000) - 1; // End of day

      const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
      let allIncome: any[] = [];
      let currentStart = startTime;

      // 1. 获取收入记录以识别活跃合约并获取资金费/手续费
      while (currentStart < endTime) {
        let currentEnd = Math.min(currentStart + SEVEN_DAYS_MS, endTime);
        
        const response = await fetch('/api/binance-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: '/fapi/v1/income',
            params: {
              startTime: currentStart,
              endTime: currentEnd,
              limit: 1000
            },
            apiKey: apiConfig.apiKey,
            apiSecret: apiConfig.apiSecret
          })
        });

        const income = await response.json();

        if (response.ok && Array.isArray(income)) {
          allIncome = [...allIncome, ...income];
        } else if (!response.ok) {
          addLog(`获取收入历史失败: ${income.msg || '未知错误'}`, 'ERROR');
          setIsFetchingHistory(false);
          return;
        }

        currentStart = currentEnd + 1;
      }

      // 2. 提取有成交活动（已实现盈亏或手续费）的唯一合约
      const activeSymbols = Array.from(new Set(allIncome
        .filter(i => i.incomeType === 'REALIZED_PNL' || i.incomeType === 'COMMISSION')
        .map(i => i.symbol)
      ));

      if (activeSymbols.length === 0) {
        addLog('在选定时间内未发现任何成交记录', 'INFO');
        setPositionHistory([]);
        setIsFetchingHistory(false);
        return;
      }

      addLog(`发现 ${activeSymbols.length} 个活跃合约，正在获取详细成交数据...`, 'INFO');

      // 3. 获取每个活跃合约的成交记录
      let allTrades: any[] = [];
      for (const symbol of activeSymbols) {
        let currentStartTrade = startTime;
        while (currentStartTrade < endTime) {
          let currentEndTrade = Math.min(currentStartTrade + SEVEN_DAYS_MS, endTime);
          
          const response = await fetch('/api/binance-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              endpoint: '/fapi/v1/userTrades',
              params: {
                symbol,
                startTime: currentStartTrade,
                endTime: currentEndTrade,
                limit: 1000
              },
              apiKey: apiConfig.apiKey,
              apiSecret: apiConfig.apiSecret
            })
          });

          const trades = await response.json();

          if (response.ok && Array.isArray(trades)) {
            allTrades = [...allTrades, ...trades];
          }
          currentStartTrade = currentEndTrade + 1;
        }
      }

      if (allTrades.length > 0) {
        // 去重并按时间升序排列
        const uniqueTrades = Array.from(new Map(allTrades.map(t => [t.id, t])).values())
          .sort((a, b) => a.time - b.time);
        
        // 4. 按合约分组并严格按时间序列汇总为“仓位历史”
        const groupedTrades: { [key: string]: any[] } = {};
        uniqueTrades.forEach(t => {
          if (!groupedTrades[t.symbol]) groupedTrades[t.symbol] = [];
          groupedTrades[t.symbol].push(t);
        });

        const aggregatedHistory: PositionHistory[] = [];
        const EPSILON = 0.00000001;

        Object.keys(groupedTrades).forEach(symbol => {
          const trades = groupedTrades[symbol];
          
          let currentPos: any = null;
          let runningQty = 0;

          trades.forEach((t, index) => {
            const qty = parseFloat(t.qty);
            const price = parseFloat(t.price);
            const realizedPnl = parseFloat(t.realizedPnl);
            const commission = parseFloat(t.commission || '0');
            const side = t.side; // BUY or SELL

            // 逻辑：由于用户只做多单，BUY 是开仓/加仓，SELL 是平仓/减仓
            if (side === 'BUY') {
              if (runningQty < EPSILON) {
                // 开启新仓位：当当前没有持仓时遇到 BUY
                currentPos = {
                  id: t.id.toString(),
                  symbol: t.symbol,
                  side: 'BUY',
                  positionSide: t.positionSide,
                  totalOpenCost: price * qty,
                  totalOpenQty: qty,
                  totalCloseRevenue: 0,
                  totalCloseQty: 0,
                  tradePnl: realizedPnl,
                  tradeCommission: commission,
                  openTime: t.time,
                  closeTime: t.time,
                };
                runningQty = qty;
              } else {
                // 加仓：当前已有持仓时遇到 BUY
                currentPos.totalOpenCost += price * qty;
                currentPos.totalOpenQty += qty;
                currentPos.tradePnl += realizedPnl;
                currentPos.tradeCommission += commission;
                runningQty += qty;
              }
            } else if (side === 'SELL') {
              if (runningQty < EPSILON) {
                // 孤儿平仓单
                aggregatedHistory.push({
                  id: `ORPHAN_${t.id}`,
                  symbol: t.symbol,
                  side: 'BUY',
                  positionSide: t.positionSide,
                  entryPrice: 0,
                  exitPrice: price,
                  amount: qty,
                  tradePnl: realizedPnl,
                  commission: commission,
                  fundingFee: 0,
                  pnl: realizedPnl - commission,
                  pnlPercent: 0,
                  openTime: t.time,
                  closeTime: t.time,
                  timestamp: t.time
                });
              } else {
                // 平仓动作
                currentPos.totalCloseRevenue += price * qty;
                currentPos.totalCloseQty += qty;
                currentPos.tradePnl += realizedPnl;
                currentPos.tradeCommission += commission;
                currentPos.closeTime = t.time;
                runningQty -= qty;

                // 检查是否完全平仓（归零）
                if (runningQty < EPSILON) {
                  // 资金费仍需从流水中获取，但放宽时间窗口以防漏计
                  const posIncome = allIncome.filter(i => 
                    i.symbol === currentPos.symbol && 
                    i.time >= currentPos.openTime - 5000 && // 提前5秒
                    i.time <= currentPos.closeTime + 5000   // 延后5秒
                  );
                  
                  const fundingFee = posIncome
                    .filter(i => i.incomeType === 'FUNDING_FEE')
                    .reduce((sum, i) => sum + parseFloat(i.income), 0);

                  aggregatedHistory.push({
                    id: currentPos.id,
                    symbol: currentPos.symbol,
                    side: 'BUY',
                    positionSide: currentPos.positionSide,
                    entryPrice: currentPos.totalOpenQty > 0 ? currentPos.totalOpenCost / currentPos.totalOpenQty : 0,
                    exitPrice: currentPos.totalCloseQty > 0 ? currentPos.totalCloseRevenue / currentPos.totalCloseQty : 0,
                    amount: Math.max(currentPos.totalOpenQty, currentPos.totalCloseQty),
                    tradePnl: currentPos.tradePnl,
                    commission: currentPos.tradeCommission,
                    fundingFee: fundingFee,
                    pnl: currentPos.tradePnl - currentPos.tradeCommission + fundingFee,
                    pnlPercent: 0,
                    openTime: currentPos.openTime,
                    closeTime: currentPos.closeTime,
                    timestamp: currentPos.closeTime
                  });
                  currentPos = null;
                  runningQty = 0;
                }
              }
            }
          });

          // 处理期末未完全平仓的剩余部分
          if (currentPos && runningQty > EPSILON) {
            const posIncome = allIncome.filter(i => 
              i.symbol === currentPos.symbol && 
              i.time >= currentPos.openTime - 5000 && 
              i.time <= currentPos.closeTime + 5000
            );
            
            const fundingFee = posIncome
              .filter(i => i.incomeType === 'FUNDING_FEE')
              .reduce((sum, i) => sum + parseFloat(i.income), 0);

            aggregatedHistory.push({
              id: currentPos.id,
              symbol: currentPos.symbol,
              side: 'BUY',
              positionSide: currentPos.positionSide,
              entryPrice: currentPos.totalOpenQty > 0 ? currentPos.totalOpenCost / currentPos.totalOpenQty : 0,
              exitPrice: currentPos.totalCloseQty > 0 ? currentPos.totalCloseRevenue / currentPos.totalCloseQty : 0,
              amount: Math.max(currentPos.totalOpenQty, currentPos.totalCloseQty),
              tradePnl: currentPos.tradePnl,
              commission: currentPos.tradeCommission,
              fundingFee: fundingFee,
              pnl: currentPos.tradePnl - currentPos.tradeCommission + fundingFee,
              pnlPercent: 0,
              openTime: currentPos.openTime,
              closeTime: currentPos.closeTime,
              timestamp: currentPos.closeTime
            });
          }
        });

        setPositionHistory(aggregatedHistory.sort((a, b) => b.timestamp - a.timestamp));
        addLog(`成功获取并精准汇总了 ${aggregatedHistory.length} 条独立仓位记录`, 'SUCCESS');
      } else {
        addLog('在选定时间内未发现任何成交记录', 'INFO');
        setPositionHistory([]);
      }
    } catch (error) {
      console.error(error);
      addLog('获取历史记录时发生异常', 'ERROR');
    } finally {
      setIsFetchingHistory(false);
    }
  };

  const formatDateChinese = (dateStr: string) => {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-');
    return `${year}年${month}月${day}日`;
  };

  if (view === 'REPORT') {
    return (
      <div className="min-h-screen p-4 md:p-8 max-w-7xl mx-auto space-y-6 pb-20">
        <header className="flex items-center justify-between border-b border-[#232326] pb-6">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setView('DASHBOARD')}
              className="p-2 hover:bg-[#141416] rounded-full transition-colors border border-[#232326]"
            >
              <ChevronLeft size={20} />
            </button>
            <div>
              <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                <FileText className="text-emerald-500" />
                报表统计
              </h1>
              <p className="text-zinc-500 text-sm">交易表现分析与历史记录</p>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-6">
          {/* Trend Chart */}
          <section className="financial-card p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-6">
                <h2 className="font-semibold flex items-center gap-2">
                  <TrendingUp size={18} className="text-emerald-500" />
                  连续赢/亏走势图
                </h2>
                
                {/* Summary Stats */}
                <div className="hidden md:flex items-center gap-6 pl-6 border-l border-[#232326]">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-zinc-500 uppercase tracking-wider">总盈亏汇总</span>
                    <span className={`text-sm font-mono font-bold ${historyTotals.totalPnl >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                      {historyTotals.totalPnl >= 0 ? '+' : ''}{historyTotals.totalPnl.toFixed(2)} USDT
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-zinc-500 uppercase tracking-wider">手续费汇总</span>
                    <span className="text-sm font-mono font-bold text-zinc-300">
                      -{Math.abs(historyTotals.totalCommission).toFixed(2)} USDT
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-zinc-500 uppercase tracking-wider">资金费汇总</span>
                    <span className={`text-sm font-mono font-bold ${historyTotals.totalFunding >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                      {historyTotals.totalFunding >= 0 ? '+' : ''}{historyTotals.totalFunding.toFixed(4)} USDT
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex gap-4 text-xs">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 bg-emerald-500 rounded-sm" />
                  <span className="text-zinc-400">连续盈利</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 bg-red-500 rounded-sm" />
                  <span className="text-zinc-400">连续亏损</span>
                </div>
              </div>
            </div>
            
            <div className="h-[350px] w-full">
              {chartData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-zinc-600 italic">
                  暂无历史数据，请先进行交易
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#232326" vertical={false} />
                    <XAxis 
                      dataKey="name" 
                      stroke="#52525b" 
                      fontSize={10} 
                      tickLine={false} 
                      axisLine={false}
                    />
                    <YAxis 
                      stroke="#52525b" 
                      fontSize={10} 
                      tickLine={false} 
                      axisLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#141416', border: '1px solid #232326', borderRadius: '8px' }}
                      cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }}
                      formatter={(value: any, name: any, props: any) => [value, props.payload.isWin ? '连续盈利次数' : '连续亏损次数']}
                    />
                    <Bar 
                      dataKey="count" 
                      radius={[4, 4, 0, 0]} 
                      barSize={Math.min(60, 800 / chartData.length)}
                      isAnimationActive={false}
                    >
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                      <LabelList dataKey="count" position="top" fill="#fff" fontSize={12} offset={10} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>

          {/* Position History Table */}
          <section className="financial-card overflow-hidden">
            <div className="p-5 border-b border-[#232326] flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Clock size={18} className="text-blue-500" />
                  <h2 className="font-semibold">仓位历史记录</h2>
                </div>
                <button 
                  onClick={fetchHistoryFromBinance}
                  disabled={isFetchingHistory || !isConnected}
                  className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded transition-colors disabled:opacity-50"
                >
                  {isFetchingHistory ? <RefreshCw size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  刷新
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 bg-[#1C1C1E] px-3 py-1.5 rounded border border-[#232326]">
                  <span className="text-[10px] text-zinc-500 uppercase">开始</span>
                  <input 
                    type="date" 
                    className="bg-transparent text-xs text-white outline-none"
                    value={dateRange.start}
                    onChange={e => setDateRange({...dateRange, start: e.target.value})}
                  />
                  <span className="text-[10px] text-zinc-400 font-mono">({formatDateChinese(dateRange.start)})</span>
                </div>
                <div className="flex items-center gap-2 bg-[#1C1C1E] px-3 py-1.5 rounded border border-[#232326]">
                  <span className="text-[10px] text-zinc-500 uppercase">终止</span>
                  <input 
                    type="date" 
                    className="bg-transparent text-xs text-white outline-none"
                    value={dateRange.end}
                    onChange={e => setDateRange({...dateRange, end: e.target.value})}
                  />
                  <span className="text-[10px] text-zinc-400 font-mono">({formatDateChinese(dateRange.end)})</span>
                </div>
                <button 
                  onClick={exportToExcel}
                  disabled={positionHistory.length === 0}
                  className="flex items-center gap-2 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-bold rounded transition-colors disabled:opacity-50"
                >
                  <Download size={14} />
                  下载表格 (.XLSX)
                </button>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-zinc-500 border-b border-[#232326]">
                    <th className="px-5 py-3 font-medium">合约名称</th>
                    <th className="px-5 py-3 font-medium">总盈亏</th>
                    <th className="px-5 py-3 font-medium">成交盈亏</th>
                    <th className="px-5 py-3 font-medium">手续费</th>
                    <th className="px-5 py-3 font-medium">资金费</th>
                    <th className="px-5 py-3 font-medium">开仓均价</th>
                    <th className="px-5 py-3 font-medium">平仓均价</th>
                    <th className="px-5 py-3 font-medium">开仓时间</th>
                    <th className="px-5 py-3 font-medium">最后平仓时间</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#232326]">
                  {positionHistory.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-5 py-12 text-center text-zinc-600 italic text-sm">
                        暂无历史记录。
                      </td>
                    </tr>
                  ) : (
                    positionHistory.slice(0, 20).map((h) => (
                      <tr key={h.id} className="hover:bg-[#1C1C1E]/50 transition-colors">
                        <td className="px-5 py-4">
                          <div className="font-bold text-sm">{h.symbol}</div>
                          <div className={`text-[10px] font-bold px-1.5 py-0.5 rounded inline-block mt-1 ${
                            h.side === 'BUY' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'
                          }`}>
                            {h.side === 'BUY' ? '多' : '空'} ({h.positionSide})
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <div className={`font-bold text-sm ${h.pnl >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                            {h.pnl >= 0 ? '+' : ''}{h.pnl.toFixed(2)}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <div className={`text-xs ${h.tradePnl >= 0 ? 'text-emerald-500/70' : 'text-red-500/70'}`}>
                            {h.tradePnl.toFixed(2)}
                          </div>
                        </td>
                        <td className="px-5 py-4 text-xs text-red-400/70 font-mono">
                          {h.commission.toFixed(2)}
                        </td>
                        <td className="px-5 py-4 text-xs text-amber-400/70 font-mono">
                          {h.fundingFee.toFixed(2)}
                        </td>
                        <td className="px-5 py-4 font-mono text-sm text-zinc-400">
                          {h.entryPrice.toFixed(2)}
                        </td>
                        <td className="px-5 py-4 font-mono text-sm text-white">
                          {h.exitPrice.toFixed(2)}
                        </td>
                        <td className="px-5 py-4 text-xs text-zinc-500 font-mono">
                          {new Date(h.openTime).toLocaleString()}
                        </td>
                        <td className="px-5 py-4 text-xs text-zinc-500 font-mono">
                          {new Date(h.closeTime).toLocaleString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-7xl mx-auto space-y-6 pb-20">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-[#232326] pb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Zap className="text-blue-500 fill-blue-500/20" />
            币安永续合约一键交易
          </h1>
          <p className="text-zinc-500 text-sm">Binance Perpetual Futures - 高性能交易终端</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-[#141416] border border-[#232326] rounded-md">
            <Server size={14} className="text-zinc-500" />
            <span className="text-xs font-mono text-zinc-400">服务器 IP: {serverIp}</span>
          </div>
          <div className={`flex items-center gap-2 px-3 py-1.5 border rounded-md transition-colors ${
            isConnected 
            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' 
            : 'bg-red-500/10 border-red-500/20 text-red-500'
          }`}>
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
            <span className="text-xs font-medium uppercase">{isConnected ? '已连接' : '未连接'}</span>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: API & Config & Account */}
        <div className="lg:col-span-4 space-y-6">
          {/* Account Status */}
          <section className="financial-card p-5 space-y-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Wallet size={18} className="text-blue-500" />
                <h2 className="font-semibold">账户状态</h2>
              </div>
              {isConnected && (
                <span className="text-[10px] bg-blue-500/10 text-blue-500 px-1.5 py-0.5 rounded font-mono">
                  AUTO REFRESH
                </span>
              )}
            </div>
            
            {!isConnected ? (
              <div className="py-8 text-center space-y-2 border border-dashed border-[#232326] rounded-lg">
                <AlertCircle size={24} className="mx-auto text-zinc-600" />
                <p className="text-xs text-zinc-500">请先验证 API 连接以查看余额</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="financial-label">总余额 ({balance.asset})</label>
                  <div className="text-xl font-mono font-bold">{balance.balance.toFixed(2)}</div>
                </div>
                <div className="space-y-1">
                  <label className="financial-label">可用保证金</label>
                  <div className="text-xl font-mono font-bold text-blue-500">{balance.available.toFixed(2)}</div>
                </div>
                <div className="col-span-2 pt-2 border-t border-[#232326]">
                  <label className="financial-label">未实现盈亏</label>
                  <div className={`text-lg font-mono font-bold ${balance.unrealizedPnl >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                    {balance.unrealizedPnl >= 0 ? '+' : ''}{balance.unrealizedPnl.toFixed(2)} USDT
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* API Configuration */}
          <section className="financial-card">
            <div 
              className="flex justify-between items-center cursor-pointer p-5 pb-2"
              onClick={() => setIsApiVisible(!isApiVisible)}
            >
              <div className="flex items-center gap-2">
                <Key size={18} className="text-blue-500" />
                <h2 className="font-semibold">币安 API 配置</h2>
              </div>
              <span className="text-zinc-500 text-[10px] uppercase font-mono">
                {isApiVisible ? 'HIDE' : 'SHOW'}
              </span>
            </div>
            
            {isApiVisible && (
              <div className="p-5 pt-0 space-y-4 animate-in fade-in duration-300">
                <div>
                  <label className="financial-label">API 接口地址 (Base URL)</label>
                  <input 
                    type="text" 
                    className="financial-input w-full" 
                    value={apiConfig.baseUrl}
                    onChange={e => setApiConfig({...apiConfig, baseUrl: e.target.value})}
                  />
                </div>
                <div>
                  <label className="financial-label">API Key</label>
                  <input 
                    type="password" 
                    className="financial-input w-full" 
                    placeholder="输入币安 API Key"
                    value={apiConfig.apiKey}
                    onChange={e => setApiConfig({...apiConfig, apiKey: e.target.value})}
                  />
                </div>
                <div>
                  <label className="financial-label">API Secret</label>
                  <input 
                    type="password" 
                    className="financial-input w-full" 
                    placeholder="输入币安 API Secret"
                    value={apiConfig.apiSecret}
                    onChange={e => setApiConfig({...apiConfig, apiSecret: e.target.value})}
                  />
                </div>
                <button 
                  onClick={handleVerifyConnection}
                  disabled={isVerifying}
                  className={`w-full flex items-center justify-center gap-2 py-2 rounded font-medium transition-all ${
                    isConnected 
                    ? 'bg-emerald-500/20 text-emerald-500 border border-emerald-500/30' 
                    : 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/20'
                  }`}
                >
                  {isVerifying ? (
                    <RefreshCw size={16} className="animate-spin" />
                  ) : isConnected ? (
                    <>
                      <CheckCircle2 size={16} />
                      已通过验证
                    </>
                  ) : (
                    <>
                      <Settings size={16} />
                      验证并连接
                    </>
                  )}
                </button>
              </div>
            )}
          </section>

          {/* Active Risk Control */}
          <section className="financial-card border-l-2 border-l-amber-500/50">
            <div 
              className="flex justify-between items-center cursor-pointer p-5 pb-2"
              onClick={() => setIsRiskVisible(!isRiskVisible)}
            >
              <div className="flex items-center gap-2">
                <ShieldAlert size={18} className="text-amber-500" />
                <h2 className="font-semibold">主动风控 (云端挂单)</h2>
              </div>
              <span className="text-zinc-500 text-[10px] uppercase font-mono">
                {isRiskVisible ? 'HIDE' : 'SHOW'}
              </span>
            </div>
            
            {isRiskVisible && (
              <div className="p-5 pt-0 space-y-4 animate-in fade-in duration-300">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="financial-label">云端止盈 (%)</label>
                    <input 
                      type="number" 
                      className="financial-input w-full" 
                      value={activeRisk.tp}
                      onChange={e => setActiveRisk({...activeRisk, tp: Number(e.target.value)})}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="financial-label">云端止损 (%)</label>
                    <input 
                      type="number" 
                      className="financial-input w-full" 
                      value={activeRisk.sl}
                      onChange={e => setActiveRisk({...activeRisk, sl: Number(e.target.value)})}
                    />
                  </div>
                  <div className="col-span-2 text-[10px] text-zinc-500 leading-relaxed bg-amber-500/5 p-2 rounded border border-amber-500/10 mb-2">
                    点击提交后，系统将自动为现有持仓在币安云端提交“止盈止损”挂单。即使关闭浏览器，挂单依然有效。
                  </div>
                  <button 
                    onClick={handleActiveRiskSubmit}
                    disabled={isRiskProcessing || !isConnected}
                    className={`col-span-2 py-2 rounded font-bold text-xs flex items-center justify-center gap-2 transition-all ${
                      isRiskProcessing 
                      ? 'bg-amber-500/20 text-amber-500 cursor-not-allowed' 
                      : 'bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/20'
                    } ${!isConnected ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {isRiskProcessing ? (
                      <>
                        <RefreshCw size={14} className="animate-spin" />
                        正在同步云端挂单...
                      </>
                    ) : (
                      <>
                        <ShieldAlert size={14} />
                        提交云端止盈止损
                      </>
                    )}
                  </button>
                  <button 
                    onClick={handleCancelAllOrders}
                    disabled={isCancellingAll || !isConnected}
                    className={`col-span-2 py-2 rounded font-bold text-xs flex items-center justify-center gap-2 transition-all mt-2 ${
                      isCancellingAll 
                      ? 'bg-red-500/20 text-red-500 cursor-not-allowed' 
                      : 'bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/20'
                    } ${!isConnected ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {isCancellingAll ? (
                      <>
                        <RefreshCw size={14} className="animate-spin" />
                        正在撤销所有委托...
                      </>
                    ) : (
                      <>
                        <XCircle size={14} />
                        一键撤销风控
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Report Statistics Module */}
          <section className="financial-card p-5 hover:border-emerald-500/30 transition-all cursor-pointer group" onClick={() => setView('REPORT')}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-emerald-500/10 rounded-xl group-hover:bg-emerald-500/20 transition-colors">
                  <FileText size={24} className="text-emerald-500" />
                </div>
                <div>
                  <h2 className="font-bold text-lg tracking-tight">报表统计</h2>
                  <p className="text-zinc-500 text-xs">交易表现分析与历史记录</p>
                </div>
              </div>
              <ChevronRight size={20} className="text-zinc-600 group-hover:text-emerald-500 transition-colors" />
            </div>
          </section>
        </div>

        {/* Right Column: Trading Area & Logs */}
        <div className="lg:col-span-8 space-y-6">
          {/* Order Module */}
          <section className="financial-card p-5">
            <div className="flex items-center gap-2 mb-6">
              <Activity size={18} className="text-blue-500" />
              <h2 className="font-semibold">合约执行终端</h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-4">
                <div>
                  <label className="financial-label">合约交易对 (如 BTCUSDT)</label>
                  <input 
                    type="text" 
                    className="financial-input w-full" 
                    value={orderForm.symbol}
                    onChange={e => setOrderForm({...orderForm, symbol: e.target.value})}
                  />
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setOrderForm({...orderForm, side: 'BUY'})}
                    className={`flex-1 py-2 rounded font-bold transition-all ${orderForm.side === 'BUY' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'bg-[#1C1C1E] text-zinc-500'}`}
                  >
                    开多 (LONG)
                  </button>
                  <button 
                    onClick={() => setOrderForm({...orderForm, side: 'SELL'})}
                    className={`flex-1 py-2 rounded font-bold transition-all ${orderForm.side === 'SELL' ? 'bg-red-500 text-white shadow-lg shadow-red-500/20' : 'bg-[#1C1C1E] text-zinc-500'}`}
                  >
                    开空 (SHORT)
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="financial-label">订单类型</label>
                  <select 
                    className="financial-input w-full"
                    value={orderForm.type}
                    onChange={e => setOrderForm({...orderForm, type: e.target.value as any})}
                  >
                    <option value="MARKET">市价 (MARKET)</option>
                    <option value="LIMIT">限价 (LIMIT)</option>
                  </select>
                </div>
                <div>
                  <label className="financial-label">下单数量 (张/币)</label>
                  <input 
                    type="number" 
                    className="financial-input w-full" 
                    value={orderForm.amount}
                    onChange={e => setOrderForm({...orderForm, amount: Number(e.target.value)})}
                  />
                </div>
              </div>

              <div className="flex flex-col justify-end">
                <button 
                  onClick={handlePlaceOrder}
                  disabled={isTrading}
                  className={`w-full h-full min-h-[100px] rounded-lg font-bold text-lg flex flex-col items-center justify-center gap-2 transition-all active:scale-95 ${
                    orderForm.side === 'BUY' 
                    ? 'bg-emerald-500 hover:bg-emerald-600 text-white' 
                    : 'bg-red-500 hover:bg-red-600 text-white'
                  } ${!isConnected ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {isTrading ? (
                    <RefreshCw className="animate-spin" />
                  ) : (
                    <>
                      <Zap size={24} />
                      一键 {orderForm.side === 'BUY' ? '开多' : '开空'}
                    </>
                  )}
                </button>
              </div>
            </div>
          </section>

          {/* Positions Module */}
          <section className="financial-card overflow-hidden">
            <div className="p-5 border-b border-[#232326] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp size={18} className="text-blue-500" />
                <h2 className="font-semibold">永续合约持仓</h2>
              </div>
              <span className="text-xs font-mono text-zinc-500">{positions.length} 个活跃持仓</span>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-zinc-500 border-b border-[#232326]">
                    <th className="px-5 py-3 font-medium">合约 / 方向</th>
                    <th className="px-5 py-3 font-medium">开仓 / 标记</th>
                    <th className="px-5 py-3 font-medium">持仓量</th>
                    <th className="px-5 py-3 font-medium">未实现盈亏 (ROE%)</th>
                    <th className="px-5 py-3 font-medium text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#232326]">
                  <AnimatePresence initial={false}>
                    {positions.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-5 py-12 text-center text-zinc-600 italic text-sm">
                          暂无合约持仓。
                        </td>
                      </tr>
                    ) : (
                      positions.map((pos) => (
                        <motion.tr 
                          key={pos.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, x: -20 }}
                          className="hover:bg-[#1C1C1E]/50 transition-colors"
                        >
                          <td className="px-5 py-4">
                            <div className="font-bold text-sm">{pos.symbol}</div>
                            <div className={`text-[10px] font-bold px-1.5 py-0.5 rounded inline-block mt-1 ${
                              pos.side === 'BUY' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'
                            }`}>
                              {pos.side === 'BUY' ? '多单 (LONG)' : '空单 (SHORT)'}
                            </div>
                          </td>
                          <td className="px-5 py-4 font-mono text-sm">
                            <div className="text-zinc-400">{pos.entryPrice.toFixed(2)}</div>
                            <div className="text-white">{pos.markPrice.toFixed(2)}</div>
                          </td>
                          <td className="px-5 py-4 font-mono text-sm">
                            {pos.amount}
                          </td>
                          <td className="px-5 py-4">
                            <div className={`font-bold text-sm flex items-center gap-1 ${pos.pnl >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                              {pos.pnl >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                              {pos.pnl >= 0 ? '+' : ''}{pos.pnl.toFixed(2)}
                            </div>
                            <div className={`text-xs ${pos.pnlPercent >= 0 ? 'text-emerald-500/70' : 'text-red-500/70'}`}>
                              ({pos.pnlPercent >= 0 ? '+' : ''}{pos.pnlPercent.toFixed(2)}%)
                            </div>
                          </td>
                          <td className="px-5 py-4 text-right">
                            <button 
                              onClick={() => handleClosePosition(pos.id)}
                              className="px-3 py-1.5 bg-yellow-400 hover:bg-yellow-500 text-black text-xs font-bold rounded flex items-center gap-2 ml-auto transition-colors"
                            >
                              <XCircle size={14} />
                              市价平仓
                            </button>
                          </td>
                        </motion.tr>
                      ))
                    )}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          </section>

          {/* Open Orders Module */}
          <section className="financial-card overflow-hidden">
            <div className="p-5 border-b border-[#232326] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock size={18} className="text-blue-500" />
                <h2 className="font-semibold">永续合约当前委托</h2>
              </div>
              <span className="text-xs font-mono text-zinc-500">{openOrders.length} 个活跃委托</span>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-zinc-500 border-b border-[#232326]">
                    <th className="px-5 py-3 font-medium">合约 / 方向</th>
                    <th className="px-5 py-3 font-medium">类型</th>
                    <th className="px-5 py-3 font-medium">价格 / 触发价</th>
                    <th className="px-5 py-3 font-medium">条件委托</th>
                    <th className="px-5 py-3 font-medium text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#232326]">
                  <AnimatePresence initial={false}>
                    {openOrders.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-5 py-12 text-center text-zinc-600 italic text-sm">
                          暂无活跃委托。
                        </td>
                      </tr>
                    ) : (
                      openOrders.map((order) => (
                        <motion.tr 
                          key={order.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, x: -20 }}
                          className="hover:bg-[#1C1C1E]/50 transition-colors"
                        >
                          <td className="px-5 py-4">
                            <div className="font-bold text-sm">{order.symbol}</div>
                            <div className={`text-[10px] font-bold px-1.5 py-0.5 rounded inline-block mt-1 ${
                              order.side === 'BUY' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'
                            }`}>
                              {order.side === 'BUY' ? '买入' : '卖出'} ({order.positionSide})
                            </div>
                          </td>
                          <td className="px-5 py-4 font-mono text-sm text-zinc-400">
                            {order.type}
                          </td>
                          <td className="px-5 py-4 font-mono text-sm">
                            <div className="text-white">{order.price > 0 ? order.price.toFixed(2) : '--'}</div>
                            {order.stopPrice > 0 && (
                              <div className="text-amber-500 text-xs">触发: {order.stopPrice.toFixed(2)}</div>
                            )}
                          </td>
                          <td className="px-5 py-4">
                            {order.isAlgo ? (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20">
                                算法止损/止盈
                              </span>
                            ) : (
                              <span className="text-[10px] text-zinc-600">普通委托</span>
                            )}
                          </td>
                          <td className="px-5 py-4 text-right">
                            <button 
                              onClick={() => handleCancelOrder(order)}
                              className="px-3 py-1.5 bg-yellow-400 hover:bg-yellow-500 text-black text-xs font-bold rounded flex items-center gap-2 ml-auto transition-colors"
                            >
                              <XCircle size={14} />
                              撤销
                            </button>
                          </td>
                        </motion.tr>
                      ))
                    )}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          </section>

          {/* Logs Module */}
          <section className="financial-card flex flex-col h-[300px]">
            <div className="p-4 border-b border-[#232326] flex items-center justify-between bg-[#1C1C1E]/30">
              <div className="flex items-center gap-2">
                <Terminal size={18} className="text-blue-500" />
                <h2 className="font-semibold">系统日志</h2>
              </div>
              <button 
                onClick={() => setLogs([])}
                className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                清除日志
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 font-mono text-xs space-y-2 custom-scrollbar bg-black/20">
              {logs.length === 0 ? (
                <div className="text-zinc-700 italic">等待系统操作...</div>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="flex gap-3 leading-relaxed border-l-2 border-transparent hover:border-zinc-800 pl-2 transition-colors">
                    <span className="text-zinc-600 shrink-0">
                      [{new Date(log.timestamp).toLocaleTimeString()}]
                    </span>
                    <span className={`font-bold shrink-0 w-16 ${
                      log.type === 'SUCCESS' ? 'text-emerald-500' : 
                      log.type === 'ERROR' ? 'text-red-500' : 
                      log.type === 'TRADE' ? 'text-blue-500' : 'text-zinc-400'
                    }`}>
                      {log.type}
                    </span>
                    <span className="text-zinc-300 break-all">{log.message}</span>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Footer Status Bar */}
      <footer className="fixed bottom-0 left-0 right-0 bg-[#0A0A0B] border-t border-[#232326] px-4 py-2 flex items-center justify-between text-[10px] text-zinc-500 font-mono z-50">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-red-500'}`} />
            币安 WS {isConnected ? '已连接' : '未连接'}
          </div>
          <div>延迟: 12ms</div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-zinc-600">API:</span>
            <span className={isConnected ? 'text-emerald-500' : 'text-zinc-500'}>
              {isConnected ? 'VALID' : 'PENDING'}
            </span>
          </div>
          <div>UTC: {new Date().toISOString()}</div>
          <div className="text-blue-500">v1.1.0-STABLE</div>
        </div>
      </footer>
    </div>
  );
}
