import { useEffect, useRef, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { FaChartArea, FaBolt, FaRobot, FaQuestionCircle, FaPlus, FaMinus } from "react-icons/fa"; 
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

    const ws = useRef(null);

    useEffect(() => { window.scrollTo(0, 0); }, []);

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
                    setOrderPrice(response.data.price); 
                }
            } catch (error) { console.error("Detail Fetch Error:", error); }
        };
        fetchStockDetail();
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

    const currentPrice = realtimeData?.price || staticInfo?.price || 0;
    const currentRate = realtimeData?.rate || staticInfo?.rate || 0;
    const currentDiff = realtimeData?.diff || staticInfo?.diff || 0;
    const rateClass = getRateClass(currentRate);

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
                        {Number(currentDiff) > 0 ? '+' : '-'}{formatNumber(Math.abs(currentDiff)) + "원"}
                    </span>
                    <span className={`price-rate ${rateClass}`}>
                        ({Number(currentRate).toFixed(2)}%)
                    </span>
                </div>
            </div>

            {/* Main 3-Column Layout */}
            <div className="detail-grid-3col">
                
                {/* [1열] 차트 -> 실시간 체결 -> 상세 정보 순서로 변경 */}
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

                    {/* 2. 실시간 체결 (차트 밑으로 이동됨) */}
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

                                    {/* 시간 */}
                                    <span className="t-time">{trade.time}</span>

                                    {/* 체결가 */}
                                    <span className={`t-price ${getRateClass(trade.rate)}`}>
                                        {formatNumber(trade.price)}
                                    </span>

                                    {/* 등락률 */}
                                    <span className={`t-rate ${getRateClass(trade.rate)}`}>
                                        {Number(trade.rate) > 0 ? '+' : ''}{Number(trade.rate).toFixed(2)}%
                                    </span>

                                    {/* 체결량 (각 틱에서 발생한 거래량) */}
                                    <span className="t-volume">
                                        {formatNumber(trade.vol)}
                                    </span>

                                    {/* 누적 거래량 */}
                                    <span className="t-total-volume">
                                        {formatNumber(realtimeData?.volume)}
                                    </span>

                                </div>
                            ))}
                        </div>
                    </div>

                    {/* 3. 상세 통계 정보 (맨 아래로 이동) */}
                    <div className="dashboard-stats-card">
                        {/* 기본 정보 행 */}
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

                        {/* 투자 지표 행 (한 줄 배치 강제) */}
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
                                        {/* 매도 잔량은 왼쪽 열에 표시 */}
                                        <div className="ob-vol-text">{item.price && formatNumber(item.volume)}</div>
                                        {item.price && <div className="bar ask-bar" style={{width: `${(item.volume/maxVolume)*100}%`}} />}
                                    </div>
                                    <div className="ob-center price">{formatPrice(item.price)}</div>
                                    <div className="ob-right"></div>
                                </div>
                            ))}
                            
                            {/* 현재가 표시 라인 */}
                            <div className="ob-current-line">
                                <span className={rateClass}>{formatNumber(currentPrice)}</span>
                            </div>

                            {bids.map((item, i) => (
                                <div key={`bid-${i}`} className="ob-item bid">
                                    <div className="ob-left"></div>
                                    <div className="ob-center price">{formatPrice(item.price)}</div>
                                    <div className="ob-right">
                                        {/* 매수 잔량은 오른쪽 열에 표시 */}
                                        <div className="ob-vol-text">{item.price && formatNumber(item.volume)}</div>
                                        {item.price && <div className="bar bid-bar" style={{width: `${(item.volume/maxVolume)*100}%`}} />}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* [3열] 주문창 */}
                <div className="col-orderform">
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
                                    <span className="total-price">{formatAmount(orderPrice * orderQuantity)}</span>
                                </div>
                            </div>
                            <button className={`btn-submit-order ${orderType}`}>{orderType === 'buy' ? '현금 매수' : '현금 매도'}</button>
                        </div>
                        <div className="user-balance-info">
                            <p>주문가능금액: <strong>0원</strong></p>
                            <p>주문가능수량: <strong>0주</strong></p>
                        </div>
                    </div>
                </div>

            </div>
            <AIModal isOpen={isModalOpen} closeModal={closeModal} aiLoading={aiLoading} aiResult={aiResult} />
        </div>
    );
}

export default StockDetailPage;