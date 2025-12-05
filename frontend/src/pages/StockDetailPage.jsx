import { useEffect, useRef, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import axios from "../lib/axios";
import { useAI } from "../hooks/useAI";
import AIModal from "../components/modals/AIModal";
import { formatHMS, getRateClass } from "../utils/formatters";

import StockHeader from "../components/stock/StockHeader";
import StockChart from "../components/stock/StockChart";
import StockDashboard from "../components/stock/StockDashboard";
import OrderBook from "../components/stock/OrderBook";
import OrderForm from "../components/stock/OrderForm";

import "../styles/StockDetailPage.css";

function StockDetailPage() {
    const { market, stockId } = useParams();
    const location = useLocation();

    // AI Hook
    const { aiLoading, aiResult, isModalOpen, handleAiPredict, closeModal } = useAI();

    // 기본 정보 파싱
    const realCode = market === 'overseas' ? (location.state?.symb || stockId) : (location.state?.code || stockId);
    const stockName = location.state?.name || stockId;
    const excd = location.state?.excd || (market === 'overseas' ? 'NAS' : '');

    // State 관리
    const [staticInfo, setStaticInfo] = useState(null);
    const [realtimeData, setRealtimeData] = useState(null);
    const [askData, setAskData] = useState(null);
    const [tradeHistory, setTradeHistory] = useState([]);
    
    const [chartData, setChartData] = useState([]);
    const [chartPeriod, setChartPeriod] = useState('D');
    const [chartType, setChartType] = useState('candle');

    const [orderType, setOrderType] = useState('buy');
    const [orderPrice, setOrderPrice] = useState(0);
    const [orderQuantity, setOrderQuantity] = useState(1);

    const [account, setAccount] = useState(null);
    const [holdingQty, setHoldingQty] = useState(0);
    const [avgPrice, setAvgPrice] = useState(0);

    const ws = useRef(null);

    useEffect(() => { window.scrollTo(0, 0); }, []);

    // 초기 데이터 로딩
    useEffect(() => {
        const fetchStockDetail = async () => {
            try {
                const params = { market, code: realCode, ...(market === 'overseas' && { exchange: excd }) };
                const response = await axios.get('/stocks/detail', { params });
                
                if (response.data) {
                    setStaticInfo(response.data);
                    if (response.data.history && Array.isArray(response.data.history)) {
                        setTradeHistory(response.data.history.map(item => ({
                            id: Math.random(),
                            time: item.time, price: item.price, diff: item.diff, rate: item.rate, vol: item.volume
                        })));
                    }
                    setRealtimeData({
                        price: response.data.price, diff: response.data.diff, rate: response.data.rate,
                        volume: response.data.volume, amount: response.data.amount, strength: null
                    });
                    const initialPrice = typeof response.data.price === 'string' 
                        ? Number(response.data.price.replace(/,/g, '')) 
                        : response.data.price;
                    setOrderPrice(initialPrice); 
                }

                const chartRes = await axios.get('/stocks/chart', {
                    params: { market, code: realCode, period: chartPeriod }
                });
                
                if (Array.isArray(chartRes.data)) {
                    const isIntraday = chartPeriod.includes('m');
                    const formattedData = chartRes.data.map(item => ({
                        time: (!isIntraday && typeof item.time === 'string' && item.time.length === 8)
                             ? `${item.time.slice(0,4)}-${item.time.slice(4,6)}-${item.time.slice(6,8)}`
                             : item.time,
                        open: item.open, high: item.high, low: item.low, close: item.close,
                        value: item.volume, 
                        color: item.close >= item.open ? '#ef5350' : '#26a69a'
                    }));
                    setChartData(formattedData);
                }
            } catch (error) { console.error("Detail Fetch Error:", error); }
        };
        fetchStockDetail();
        fetchAccountInfo();
    }, [market, realCode, excd, chartPeriod]);

    // 계좌 및 보유 정보 조회
    const fetchAccountInfo = async () => {
        try {
            const accRes = await axios.get('/invest/virtual/account');
            setAccount(accRes.data);
            const portRes = await axios.get('/invest/virtual/portfolio');
            const currentStock = portRes.data.find(item => item.stock_code === realCode);
            if (currentStock) {
                setHoldingQty(currentStock.quantity);
                setAvgPrice(currentStock.average_price);
            } else {
                setHoldingQty(0);
                setAvgPrice(0);
            }
        } catch (error) {
            setAccount(null); setHoldingQty(0); setAvgPrice(0);
        }
    };

    // 웹소켓 연결
    useEffect(() => {
        if (ws.current) ws.current.close();
        const socket = new WebSocket('ws://localhost:8000/stocks/ws/realtime');
        ws.current = socket;

        socket.onopen = () => {
            socket.send(JSON.stringify({
                items: [
                    { code: realCode, market, type: "tick", excd },
                    { code: realCode, market, type: "ask", excd }
                ]
            }));
        };

        socket.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.type !== 'realtime' || msg.data.code !== realCode) return;
                
                const data = msg.data;
                if (data.type === 'tick') {
                    setRealtimeData(prev => ({ ...prev, ...data }));
                    setTradeHistory(prev => {
                        const newTrade = {
                            id: Date.now() + Math.random(),
                            time: formatHMS(data.time),
                            price: data.price, diff: data.diff, rate: data.rate, volume: data.volume, vol: data.vol 
                        };
                        return [newTrade, ...prev].slice(0, 20); 
                    });
                } else if (data.type === 'ask') {
                    setAskData(data);
                }
            } catch (e) { console.error("WS Error", e); }
        };
        return () => { if (ws.current) ws.current.close(); };
    }, [market, realCode, excd]);

    // 주문 핸들러
    const handleOrder = async () => {
        if (!account) return alert("로그인이 필요하거나 모의투자 계좌가 없습니다.");
        if (orderQuantity <= 0) return alert("주문 수량은 1주 이상이어야 합니다.");

        try {
            const endpoint = orderType === 'buy' ? '/invest/virtual/buy' : '/invest/virtual/sell';
            await axios.post(endpoint, {
                stock_code: realCode, market_type: market, quantity: Number(orderQuantity), exchange: excd
            });
            alert(`${orderType === 'buy' ? '매수' : '매도'} 주문이 체결되었습니다.`);
            fetchAccountInfo(); 
        } catch (error) {
            alert(error.response?.data?.detail || "주문 처리에 실패했습니다.");
        }
    };

    // 렌더링
    const rawCurrentPrice = realtimeData?.price || staticInfo?.price || 0;
    const currentPrice = typeof rawCurrentPrice === 'string' ? Number(rawCurrentPrice.replace(/,/g, '')) : Number(rawCurrentPrice);
    const currentRate = realtimeData?.rate || staticInfo?.rate || 0;
    const currentDiff = realtimeData?.diff || staticInfo?.diff || 0;
    const rateClass = getRateClass(currentRate);

    // 호가 데이터 가공
    const asks = Array.from({ length: 10 }, (_, i) => ({
        price: askData?.[`ask_price_${i + 1}`],
        volume: askData?.[`ask_remain_${i + 1}`] || 0
    })).reverse();
    const bids = Array.from({ length: 10 }, (_, i) => ({
        price: askData?.[`bid_price_${i + 1}`],
        volume: askData?.[`bid_remain_${i + 1}`] || 0
    }));

    return (
        <div className="detail-wrapper">
            {/* 상단 헤더 */}
            <StockHeader 
                market={market} 
                stockName={stockName} 
                realCode={realCode}
                currentPrice={currentPrice}
                currentDiff={currentDiff}
                currentRate={currentRate}
                rateClass={rateClass}
                onAiClick={() => handleAiPredict({ market, code: realCode, symb: realCode })}
            />

            <div className="detail-grid-3col">
                <div className="col-chart-section">
                    {/* 차트 영역 */}
                    <StockChart 
                        chartData={chartData}
                        realtimeData={realtimeData} // 실시간 데이터 전달
                        chartPeriod={chartPeriod}
                        setChartPeriod={setChartPeriod}
                        chartType={chartType}
                        setChartType={setChartType}
                    />
                    
                    {/* 대시보드 (실시간 체결 + 재무정보) */}
                    <StockDashboard 
                        tradeHistory={tradeHistory}
                        realtimeData={realtimeData}
                        staticInfo={staticInfo}
                    />
                </div>
                
                {/* 호가창 */}
                <div className="col-orderbook">
                    <OrderBook 
                        asks={asks} 
                        bids={bids} 
                        realtimeData={realtimeData}
                        rateClass={rateClass}
                        currentPrice={currentPrice}
                    />
                </div>
                
                {/* 주문폼 및 내 잔고 */}
                <OrderForm 
                    orderType={orderType}
                    setOrderType={setOrderType}
                    orderPrice={orderPrice}
                    setOrderPrice={setOrderPrice}
                    orderQuantity={orderQuantity}
                    setOrderQuantity={setOrderQuantity}
                    account={account}
                    holdingQty={holdingQty}
                    avgPrice={avgPrice}
                    currentPrice={currentPrice}
                    handleOrder={handleOrder}
                />
            </div>
            
            {/* AI 모달 */}
            <AIModal isOpen={isModalOpen} closeModal={closeModal} aiLoading={aiLoading} aiResult={aiResult} />
        </div>
    );
}

export default StockDetailPage;