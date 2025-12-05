import { useEffect, useRef, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { FaChartArea, FaBolt, FaRobot, FaQuestionCircle, FaPlus, FaMinus, FaWallet } from "react-icons/fa"; 
import axios from "../lib/axios";
import { useAI } from "../hooks/useAI";
import AIModal from "../components/modals/AIModal";
import { formatNumber, formatPrice, formatAmount, formatHMS, getRateClass } from "../utils/formatters";
import "../styles/StockDetailPage.css";

// 툴팁 용어 사전
const TERM_DEFINITIONS = {
    "시가총액": "기업의 가치를 시장 가격으로 환산한 총액입니다. (현재가 × 상장주식수)",
    "거래량": "하루 동안 거래된 주식의 총 수량입니다.",
    "거래대금": "하루 동안 거래된 주식의 총 금액입니다.",
    "PER": "주가수익비율. 주가가 1주당 순이익의 몇 배인지 나타냅니다. 낮을수록 저평가 가능성이 있습니다.",
    "PBR": "주가순자산비율. 주가가 1주당 순자산의 몇 배인지 나타냅니다. 1배 미만이면 자산가치보다 싸게 거래되는 것입니다.",
    "EPS": "주당순이익. 기업이 1주당 얼마의 이익을 냈는지 보여줍니다.",
    "BPS": "주당순자산가치. 기업이 활동을 중단하고 자산을 주주에게 나눠줄 때 1주당 얼마씩 돌아가는지 나타냅니다.",
    "체결강도": "매수세와 매도세의 비율. 100%보다 높으면 매수세가 강함을 의미합니다."
};

// 툴팁 컴포넌트
const TermTooltip = ({ term }) => (
    <span className="term-tooltip-wrapper">
        {term}
        <span className="tooltip-icon"><FaQuestionCircle /></span>
        <div className="tooltip-content">{TERM_DEFINITIONS[term] || "설명이 없습니다."}</div>
    </span>
);

function StockDetailPage() {
    const { market, stockId } = useParams();
    const location = useLocation();

    // AI Hook 사용
    const { aiLoading, aiResult, isModalOpen, handleAiPredict, closeModal } = useAI();

    const realCode = market === 'overseas' ? (location.state?.symb || stockId) : (location.state?.code || stockId);
    const stockName = location.state?.name || stockId;
    const excd = location.state?.excd || (market === 'overseas' ? 'NAS' : '');

    const [staticInfo, setStaticInfo] = useState(null);
    const [realtimeData, setRealtimeData] = useState(null);
    const [askData, setAskData] = useState(null);
    const [tradeHistory, setTradeHistory] = useState([]);
    
    // 주문 관련 상태 (UI용)
    const [orderType, setOrderType] = useState('buy'); // 'buy' | 'sell'
    const [orderPrice, setOrderPrice] = useState(0);
    const [orderQuantity, setOrderQuantity] = useState(1);

    // [추가/수정] 계좌 및 보유 종목 정보 상태
    const [account, setAccount] = useState(null); // 계좌 잔고 정보
    const [holdingQty, setHoldingQty] = useState(0); // 현재 종목 보유 수량
    const [avgPrice, setAvgPrice] = useState(0); // [추가] 평단가

    const ws = useRef(null);

    useEffect(() => { window.scrollTo(0, 0); }, []);

    // [추가/수정] 계좌 및 포트폴리오 정보 불러오기
    const fetchAccountInfo = async () => {
        try {
            // 1. 계좌 정보 조회
            const accRes = await axios.get('/invest/virtual/account');
            setAccount(accRes.data);

            // 2. 포트폴리오 조회 (현재 종목 보유량 및 평단가 확인)
            const portRes = await axios.get('/invest/virtual/portfolio');
            const currentStock = portRes.data.find(item => item.stock_code === realCode);
            
            if (currentStock) {
                setHoldingQty(currentStock.quantity);
                setAvgPrice(currentStock.average_price); // [추가] 평단가 저장
            } else {
                setHoldingQty(0);
                setAvgPrice(0);
            }
        } catch (error) {
            console.log("계좌 정보 조회 실패 (비로그인 상태 등)");
            setAccount(null);
            setHoldingQty(0);
            setAvgPrice(0);
        }
    };

    // 초기 데이터 로드
    useEffect(() => {
        const fetchStockDetail = async () => {
            try {
                const params = { market, code: realCode, ...(market === 'overseas' && { exchange: excd }) };
                const response = await axios.get('/stocks/detail', { params });
                
                if (response.data) {
                    setStaticInfo(response.data);
                    if (response.data.history && Array.isArray(response.data.history)) {
                        const historyData = response.data.history.map(item => ({
                            id: Math.random(), // 고유 키 필요
                            time: item.time,
                            price: item.price,
                            diff: item.diff,
                            rate: item.rate
                        }));
                        setTradeHistory(historyData);
                    }
                    setRealtimeData({
                        price: response.data.price,
                        diff: response.data.diff,
                        rate: response.data.rate,
                        volume: response.data.volume,
                        amount: response.data.amount,
                        open: response.data.open,
                        high: response.data.high,
                        low: response.data.low,
                        strength: null
                    });
                    // [수정] 초기 주문가 설정 (숫자로 변환하여 안전하게 처리)
                    const initialPrice = typeof response.data.price === 'string' 
                        ? Number(response.data.price.replace(/,/g, '')) 
                        : response.data.price;
                    setOrderPrice(initialPrice); 
                }
            } catch (error) { console.error("Detail Fetch Error:", error); }
        };
        fetchStockDetail();
        fetchAccountInfo(); // [추가] 계좌 정보 호출
    }, [market, realCode, excd]);
    
    // WebSocket 연결
    useEffect(() => {
        if (ws.current) ws.current.close();
        ws.current = new WebSocket('ws://localhost:8000/stocks/ws/realtime');

        ws.current.onopen = () => {
            ws.current.send(JSON.stringify({
                items: [
                    { code: realCode, market, type: "tick", excd },
                    { code: realCode, market, type: "ask", excd }
                ]
            }));
        };

        ws.current.onmessage = (event) => {
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
                            price: data.price,
                            diff: data.diff,
                            rate: data.rate,
                            volume: data.volume,
                            vol: data.vol
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

    // [추가] 주문 요청 핸들러
    const handleOrder = async () => {
        if (!account) {
            alert("로그인이 필요하거나 모의투자 계좌가 없습니다.");
            return;
        }
        if (orderQuantity <= 0) {
            alert("주문 수량은 1주 이상이어야 합니다.");
            return;
        }

        try {
            const endpoint = orderType === 'buy' ? '/invest/virtual/buy' : '/invest/virtual/sell';
            await axios.post(endpoint, {
                stock_code: realCode,
                market_type: market,
                quantity: Number(orderQuantity),
                exchange: excd
            });

            alert(`${orderType === 'buy' ? '매수' : '매도'} 주문이 체결되었습니다.`);
            fetchAccountInfo(); // 주문 후 잔고 및 포트폴리오 갱신
        } catch (error) {
            console.error("주문 실패:", error);
            const msg = error.response?.data?.detail || "주문 처리에 실패했습니다.";
            alert(msg);
        }
    };

    // 실시간 현재가 (WS 데이터 우선, 없으면 정적 데이터)
    const rawCurrentPrice = realtimeData?.price || staticInfo?.price || 0;
    // 계산을 위해 숫자로 변환
    const currentPrice = typeof rawCurrentPrice === 'string' ? Number(rawCurrentPrice.replace(/,/g, '')) : Number(rawCurrentPrice);
    
    const currentRate = realtimeData?.rate || staticInfo?.rate || 0;
    const currentDiff = realtimeData?.diff || staticInfo?.diff || 0;
    const rateClass = getRateClass(currentRate);

    // [추가] 실시간 내 투자 현황 계산
    const myTotalInvest = Math.floor(holdingQty * avgPrice); // 총 투자원금
    const myTotalEval = Math.floor(holdingQty * currentPrice); // 총 평가금액
    const myProfitAmt = myTotalEval - myTotalInvest; // 평가손익
    const myProfitRate = myTotalInvest > 0 ? ((myTotalEval - myTotalInvest) / myTotalInvest) * 100 : 0; // 수익률

    // 호가 데이터 계산
    const asks = Array.from({ length: 10 }, (_, i) => ({
        price: askData?.[`ask_price_${i + 1}`],
        volume: askData?.[`ask_remain_${i + 1}`] || 0
    })).reverse();

    const bids = Array.from({ length: 10 }, (_, i) => ({
        price: askData?.[`bid_price_${i + 1}`],
        volume: askData?.[`bid_remain_${i + 1}`] || 0
    }));
    const maxVolume = Math.max(
        ...asks.map(a => Number(a.volume)), 
        ...bids.map(b => Number(b.volume)), 
        1
    );

    // [추가] 주문 가능 수량/금액 계산
    const availableBuyQty = account ? Math.floor(account.balance / (orderPrice || 1)) : 0; 
    const availableSellQty = holdingQty; 
    const orderTotalAmount = orderPrice * orderQuantity; 

    return (
        <div className="detail-wrapper">
            {/* Header Area */}
            <div className="stock-header-new">
                <div className="header-top-row">
                    <div className="title-section">
                        <span className={`market-badge ${market === 'domestic' ? 'domestic' : 'overseas'}`}>
                            {market === 'domestic' ? '국내' : '해외'}
                        </span>
                        <h1 className="stock-name">{stockName}</h1>
                        <span className="stock-code">{realCode}</span>
                        
                        {/* AI Button */}
                        <button 
                            className="btn-ai-analyze" 
                            onClick={() => handleAiPredict({ market, code: realCode, symb: realCode })}
                        >
                            <FaRobot /> AI 분석
                        </button>
                    </div>
                </div>

                <div className="header-price-row">
                    <span className={`current-price ${rateClass}`}>{formatNumber(currentPrice)}</span>
                    <span className="currency">원</span>
                    <span className={`price-diff ${rateClass}`}>
                        {Number(currentDiff) > 0 ? '+' : ''}{formatNumber(currentDiff)}원
                    </span>
                    <span className={`price-rate ${rateClass}`}>
                        ({Number(currentRate).toFixed(2)}%)
                    </span>
                </div>
            </div>

            {/* Main 3-Column Layout */}
            <div className="detail-grid-3col">
                
                {/* [1열] 차트 & 상세 정보 */}
                <div className="col-chart-section">
                    
                    {/* 1. 차트 */}
                    <div className="chart-card">
                        <div className="card-header-sm">
                            <span className="card-title"><FaChartArea /> 차트</span>
                            <div className="chart-tabs">
                                <button className="active">일봉</button>
                                <button>주봉</button>
                                <button>분봉</button>
                            </div>
                        </div>
                        <div className="chart-body-placeholder">
                            <p>📊 Interactive Chart Area</p>
                        </div>
                    </div>

                    {/* 2. 실시간 체결 */}
                    <div className="trade-list-panel">
                        <div className="panel-title"><FaBolt className="icon-bolt"/> 실시간 체결</div>
                        <div className="trade-table-header">
                            <span>시간</span>
                            <span>체결가</span>
                            <span>등락률</span>
                            <span>체결량</span>
                            <span>누적 거래량</span>
                        </div>
                        <div className="trade-list-scroll">
                            {tradeHistory.map(trade => (
                                <div key={trade.id} className="trade-row">
                                    <span className="t-time">{trade.time}</span>
                                    <span className={`t-price ${getRateClass(trade.rate)}`}>
                                        {formatNumber(trade.price)}
                                    </span>
                                    <span className={`t-rate ${getRateClass(trade.rate)}`}>
                                        {Number(trade.rate) > 0 ? '+' : ''}{Number(trade.rate).toFixed(2)}%
                                    </span>
                                    <span className="t-volume">
                                        {formatNumber(trade.vol)}
                                    </span>
                                    <span className="t-total-volume">
                                        {formatNumber(realtimeData?.volume)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* 3. 상세 통계 정보 */}
                    <div className="dashboard-stats-card">
                        <div className="stats-row basic">
                            <div className="stat-box">
                                <span className="label"><TermTooltip term="시가총액" /></span>
                                <span className="value">{formatAmount(staticInfo?.market_cap)}</span>
                            </div>
                            <div className="stat-box">
                                <span className="label"><TermTooltip term="거래량" /></span>
                                <span className="value">{formatNumber(realtimeData?.volume)}</span>
                            </div>
                             <div className="stat-box">
                                <span className="label"><TermTooltip term="거래대금" /></span>
                                <span className="value">{formatAmount(realtimeData?.amount)}</span>
                            </div>
                        </div>

                        <div className="stats-row investment-ratios">
                            <div className="stat-box ratio-item">
                                <span className="label"><TermTooltip term="PER" /></span>
                                <span className="value">{staticInfo?.per || '-'}배</span>
                            </div>
                             <div className="stat-box ratio-item">
                                <span className="label"><TermTooltip term="PBR" /></span>
                                <span className="value">{staticInfo?.pbr || '-'}배</span>
                            </div>
                            <div className="stat-box ratio-item">
                                <span className="label"><TermTooltip term="EPS" /></span>
                                <span className="value">{formatNumber(staticInfo?.eps)}원</span>
                            </div>
                             <div className="stat-box ratio-item">
                                <span className="label"><TermTooltip term="BPS" /></span>
                                <span className="value">{formatNumber(staticInfo?.bps)}원</span>
                            </div>
                        </div>
                    </div>

                </div>

                {/* [2열] 호가창 */}
                <div className="col-orderbook">
                    <div className="orderbook-card">
                        <div className="card-header-sm center">
                            <span className="card-title">호가</span>
                            {realtimeData?.strength && (
                                <span className={`strength-badge ${Number(realtimeData.strength) >= 100 ? 'up' : 'down'}`}>
                                    <TermTooltip term="체결강도" /> {Number(realtimeData.strength).toFixed(2)}%
                                </span>
                            )}
                        </div>
                        <div className="ob-list">
                            {asks.map((item, i) => (
                                <div key={`ask-${i}`} className="ob-item ask">
                                    <div className="ob-left">
                                        <div className="ob-vol-text">{item.price && formatNumber(item.volume)}</div>
                                        {item.price && <div className="bar ask-bar" style={{width: `${(item.volume/maxVolume)*100}%`}} />}
                                    </div>
                                    <div className="ob-center price">{formatPrice(item.price)}</div>
                                    <div className="ob-right"></div>
                                </div>
                            ))}
                            
                            <div className="ob-current-line">
                                <span className={rateClass}>{formatNumber(currentPrice)}</span>
                            </div>

                            {bids.map((item, i) => (
                                <div key={`bid-${i}`} className="ob-item bid">
                                    <div className="ob-left"></div>
                                    <div className="ob-center price">{formatPrice(item.price)}</div>
                                    <div className="ob-right">
                                        <div className="ob-vol-text">{item.price && formatNumber(item.volume)}</div>
                                        {item.price && <div className="bar bid-bar" style={{width: `${(item.volume/maxVolume)*100}%`}} />}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* [3열] 주문창 및 내 보유 현황 */}
                <div className="col-orderform">
                    
                    {/* [추가] 내 보유 현황 카드 */}
                    {holdingQty > 0 && (
                        <div className="my-position-card">
                            <div className="card-header-sm">
                                <span className="card-title"><FaWallet /> 내 보유 현황</span>
                            </div>
                            <div className="my-pos-body">
                                <div className="pos-row">
                                    <span>평단가</span>
                                    <span className="val">{formatNumber(Math.floor(avgPrice))}원</span>
                                </div>
                                <div className="pos-row">
                                    <span>보유수량</span>
                                    <span className="val">{formatNumber(holdingQty)}주</span>
                                </div>
                                <div className="pos-row">
                                    <span>투자원금</span>
                                    <span className="val">{formatNumber(myTotalInvest)}원</span>
                                </div>
                                <div className="pos-divider"></div>
                                <div className="pos-row highlight">
                                    <span>평가금액</span>
                                    <span className="val">{formatNumber(myTotalEval)}원</span>
                                </div>
                                <div className="pos-row">
                                    <span>평가손익</span>
                                    <span className={`val ${myProfitAmt >= 0 ? 'up' : 'down'}`}>
                                        {formatNumber(myProfitAmt)}원
                                    </span>
                                </div>
                                <div className="pos-row large">
                                    <span>수익률</span>
                                    <span className={`val ${myProfitRate >= 0 ? 'up' : 'down'}`}>
                                        {myProfitRate.toFixed(2)}%
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className={`order-form-card ${orderType}`}>
                        <div className="order-tabs">
                            <button className={`tab-btn buy ${orderType === 'buy' ? 'active' : ''}`} onClick={() => setOrderType('buy')}>매수</button>
                            <button className={`tab-btn sell ${orderType === 'sell' ? 'active' : ''}`} onClick={() => setOrderType('sell')}>매도</button>
                        </div>
                        
                        <div className="order-body">
                            <div className="input-row">
                                <label>주문단가</label>
                                <div className="number-input-box">
                                    <button onClick={() => setOrderPrice(p => Math.max(0, Number(p) - 100))}><FaMinus /></button>
                                    <input type="text" value={formatNumber(orderPrice)} onChange={(e) => setOrderPrice(e.target.value.replace(/,/g, ''))}/>
                                    <button onClick={() => setOrderPrice(p => Number(p) + 100)}><FaPlus /></button>
                                </div>
                            </div>
                            <div className="input-row">
                                <label>주문수량</label>
                                <div className="number-input-box">
                                    <button onClick={() => setOrderQuantity(q => Math.max(1, Number(q) - 1))}><FaMinus /></button>
                                    <input type="number" value={orderQuantity} onChange={(e) => setOrderQuantity(e.target.value)}/>
                                    <button onClick={() => setOrderQuantity(q => Number(q) + 1)}><FaPlus /></button>
                                </div>
                            </div>
                            <div className="order-summary">
                                <div className="summary-row">
                                    <span>총 주문금액</span>
                                    <span className="total-price">{formatAmount(orderTotalAmount)}</span>
                                </div>
                            </div>
                            <button className={`btn-submit-order ${orderType}`} onClick={handleOrder}>
                                {orderType === 'buy' ? '현금 매수' : '현금 매도'}
                            </button>
                        </div>
                        
                        <div className="user-balance-info">
                            {orderType === 'buy' ? (
                                <>
                                    <p>주문가능금액: <strong>{formatNumber(account?.balance || 0)}원</strong></p>
                                    <p>매수하기가능수량: <strong>{formatNumber(availableBuyQty)}주</strong></p>
                                </>
                            ) : (
                                <>
                                    <p>매도가능수량: <strong>{formatNumber(availableSellQty)}주</strong></p>
                                    <p>예상매도금액: <strong>{formatAmount(orderTotalAmount)}</strong></p>
                                </>
                            )}
                        </div>
                    </div>
                </div>

            </div>
            <AIModal isOpen={isModalOpen} closeModal={closeModal} aiLoading={aiLoading} aiResult={aiResult} />
        </div>
    );
}

export default StockDetailPage;