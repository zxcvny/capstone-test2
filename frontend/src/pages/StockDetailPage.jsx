import { useEffect, useRef, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { FaChartArea, FaBolt, FaRobot, FaQuestionCircle, FaPlus, FaMinus } from "react-icons/fa"; 
import { createChart, ColorType, CandlestickSeries, LineSeries, HistogramSeries, CrosshairMode } from 'lightweight-charts';
import axios from "../lib/axios";
import { useAI } from "../hooks/useAI";
import AIModal from "../components/modals/AIModal";
import { formatNumber, formatPrice, formatAmount, formatHMS, getRateClass } from "../utils/formatters";
import "../styles/StockDetailPage.css";

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

    // AI Hook
    const { aiLoading, aiResult, isModalOpen, handleAiPredict, closeModal } = useAI();

    const realCode = market === 'overseas' ? (location.state?.symb || stockId) : (location.state?.code || stockId);
    const stockName = location.state?.name || stockId;
    const excd = location.state?.excd || (market === 'overseas' ? 'NAS' : '');

    const [staticInfo, setStaticInfo] = useState(null);
    const [realtimeData, setRealtimeData] = useState(null);
    const [askData, setAskData] = useState(null);
    const [tradeHistory, setTradeHistory] = useState([]);
    
    // 차트 상태
    const [chartData, setChartData] = useState([]);
    const [chartPeriod, setChartPeriod] = useState('D');
    const [chartType, setChartType] = useState('candle');

    // 주문 상태
    const [orderType, setOrderType] = useState('buy');
    const [orderPrice, setOrderPrice] = useState(0);
    const [orderQuantity, setOrderQuantity] = useState(1);

    const ws = useRef(null);
    
    // 차트 Refs
    const chartContainerRef = useRef(null);
    const chartInstance = useRef(null);
    const mainSeriesRef = useRef(null);
    const volumeSeriesRef = useRef(null);

    // [추가] 차트 데이터의 마지막 캔들을 Ref로 관리 (실시간 비교용)
    // state인 chartData는 렌더링용이고, 실시간 업데이트에는 ref가 빠르고 정확함
    const lastCandleRef = useRef(null);

    useEffect(() => { window.scrollTo(0, 0); }, []);

    // 1. 데이터 로딩
    useEffect(() => {
        const fetchStockDetail = async () => {
            try {
                const params = { market, code: realCode, ...(market === 'overseas' && { exchange: excd }) };
                const response = await axios.get('/stocks/detail', { params });
                
                if (response.data) {
                    setStaticInfo(response.data);
                    if (response.data.history && Array.isArray(response.data.history)) {
                        const historyData = response.data.history.map(item => ({
                            id: Math.random(),
                            time: item.time,
                            price: item.price,
                            diff: item.diff,
                            rate: item.rate,
                            vol: item.volume
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

                const chartRes = await axios.get('/stocks/chart', {
                    params: { market, code: realCode, period: chartPeriod }
                });
                
                if (Array.isArray(chartRes.data)) {
                    const isIntraday = chartPeriod.includes('m');
                    const formattedData = chartRes.data.map(item => {
                        let timeVal = item.time;
                        if (!isIntraday && typeof item.time === 'string' && item.time.length === 8) {
                            timeVal = `${item.time.slice(0,4)}-${item.time.slice(4,6)}-${item.time.slice(6,8)}`;
                        }
                        return {
                            time: timeVal,
                            open: item.open,
                            high: item.high,
                            low: item.low,
                            close: item.close,
                            value: item.volume, 
                            color: item.close >= item.open ? '#ef5350' : '#26a69a'
                        };
                    });
                    setChartData(formattedData);
                    // [중요] 마지막 캔들 정보를 Ref에 저장
                    if (formattedData.length > 0) {
                        lastCandleRef.current = formattedData[formattedData.length - 1];
                    }
                }
            } catch (error) { console.error("Detail Fetch Error:", error); }
        };
        fetchStockDetail();
    }, [market, realCode, excd, chartPeriod]);
    
    // 2. 차트 생성 및 설정
    useEffect(() => {
        if (!chartContainerRef.current) return;
        
        if (chartInstance.current) {
            chartInstance.current.remove();
            mainSeriesRef.current = null;
            volumeSeriesRef.current = null;
        }

        const isIntraday = chartPeriod.includes('m');

        const chart = createChart(chartContainerRef.current, {
            layout: { 
                background: { type: ColorType.Solid, color: '#1e222d' },
                textColor: '#d1d4dc',
            },
            width: chartContainerRef.current.clientWidth,
            height: 350,
            grid: { vertLines: { color: '#2B2B43' }, horzLines: { color: '#2B2B43' } },
            rightPriceScale: { borderVisible: false, borderColor: '#2B2B43' },
            timeScale: { 
                borderVisible: false,
                borderColor: '#2B2B43',
                timeVisible: isIntraday, 
                secondsVisible: false,
            },
            crosshair: { mode: CrosshairMode.Normal }, 
            localization: { 
                timeFormatter: (timestamp) => {
                    // 일봉일때는 문자열이므로 포매터 무시됨, 분봉(timestamp)일때만 작동
                    if (typeof timestamp === 'string') return timestamp;
                    const date = new Date(timestamp * 1000);
                    return date.toLocaleTimeString('ko-KR', { 
                        hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' 
                    });
                },
                dateFormat: 'yyyy-MM-dd' 
            }
        });

        chartInstance.current = chart;

        let mainSeries;
        if (chartType === 'candle') {
            mainSeries = chart.addSeries(CandlestickSeries, {
                upColor: '#ef5350', downColor: '#26a69a',
                borderVisible: false, wickUpColor: '#ef5350', wickDownColor: '#26a69a',
            });
            mainSeries.setData(chartData);
        } else {
            mainSeries = chart.addSeries(LineSeries, {
                color: '#2962FF',
                lineWidth: 2,
            });
            const lineData = chartData.map(d => ({ time: d.time, value: d.close }));
            mainSeries.setData(lineData);
        }
        mainSeriesRef.current = mainSeries;

        const volSeries = chart.addSeries(HistogramSeries, {
            color: '#26a69a',
            priceFormat: { type: 'volume' },
            priceScaleId: '', 
        });
        volumeSeriesRef.current = volSeries;

        chart.priceScale('').applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });

        if (chartData.length > 0) {
            const volData = chartData.map(d => ({
                time: d.time,
                value: d.value,
                color: d.color
            }));
            volSeries.setData(volData);
            chart.timeScale().fitContent();
        }

        const handleResize = () => {
            if (chartContainerRef.current) {
                chart.applyOptions({ width: chartContainerRef.current.clientWidth });
            }
        };
        window.addEventListener('resize', handleResize);
        return () => {
            window.removeEventListener('resize', handleResize);
            chart.remove();
            chartInstance.current = null;
        };
    }, [chartData, chartType]);

    // 3. 실시간 업데이트
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
                            price: data.price,
                            diff: data.diff,
                            rate: data.rate,
                            volume: data.volume,
                            vol: data.vol 
                        };
                        return [newTrade, ...prev].slice(0, 20); 
                    });

                    // [핵심 수정] 실시간 캔들 그리기 로직 강화
                    if (mainSeriesRef.current) {
                        const currentPrice = Number(data.price);
                        const currentVol = Number(data.volume);
                        
                        // Ref에서 마지막 캔들을 가져옴 (가장 최신 상태 유지)
                        let lastCandle = lastCandleRef.current;
                        
                        // 차트 데이터가 아예 없으면 초기화
                        if (!lastCandle && chartData.length > 0) {
                            lastCandle = chartData[chartData.length - 1];
                        }
                        
                        if (!lastCandle) return; // 데이터가 아직 없으면 대기

                        let targetTime = null;
                        const isIntraday = chartPeriod.includes('m');

                        // 1. 현재 데이터가 들어갈 시간 슬롯 계산
                        if (!isIntraday) {
                            // 일/주/월/년봉
                            if (chartPeriod === 'D') {
                                const today = new Date();
                                // YYYY-MM-DD 포맷
                                targetTime = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
                            } else {
                                // 주/월/년봉은 현재 마지막 캔들의 시간을 그대로 유지하며 값만 변경 (단순화)
                                targetTime = lastCandle.time;
                            }
                        } else {
                            // 분봉
                            const now = new Date();
                            const currentTimestamp = Math.floor(now.getTime() / 1000);
                            
                            // 분봉 간격 (초)
                            const intervalMin = parseInt(chartPeriod.replace('m', ''));
                            const intervalSec = intervalMin * 60;
                            
                            // 현재 시간을 분봉 간격으로 내림 처리 (Bucket)
                            // 예: 10:03:45 5분봉 -> 10:00:00의 타임스탬프
                            // Lightweight Charts는 시간 순서가 중요하므로 정확한 슬롯 계산 필요
                            
                            // 이미 마지막 캔들이 있고, 현재 시간이 그 캔들의 시간 + 간격 안에 있다면 -> 업데이트
                            // 아니라면 -> 새 캔들 시간
                            
                            const lastTime = lastCandle.time; // timestamp
                            if (currentTimestamp < lastTime + intervalSec) {
                                targetTime = lastTime; // 현재 봉 갱신
                            } else {
                                // 다음 봉 시작 시간 (마지막 봉 시간 + 간격)
                                targetTime = lastTime + intervalSec;
                                
                                // 만약 데이터 공백이 있어서(장중 휴식 등) 현재 시간이 훨씬 뒤라면?
                                // 현재 시간을 기준으로 버킷팅
                                // (간단히는 그냥 바로 다음 봉으로 붙여도 됨)
                            }
                        }

                        // 2. 캔들 객체 생성 (업데이트 or 신규)
                        let updatedCandle = null;

                        if (lastCandle.time === targetTime) {
                            // [CASE A] 기존 캔들 업데이트 (High/Low 갱신)
                            updatedCandle = {
                                ...lastCandle,
                                high: Math.max(lastCandle.high, currentPrice),
                                low: Math.min(lastCandle.low, currentPrice),
                                close: currentPrice,
                                value: currentVol, 
                                color: currentPrice >= lastCandle.open ? '#ef5350' : '#26a69a'
                            };
                        } else {
                            // [CASE B] 새 캔들 추가 (시가=종가=현재가로 시작)
                            updatedCandle = {
                                time: targetTime,
                                open: currentPrice, // 새 봉의 시가는 현재 체결가
                                high: currentPrice,
                                low: currentPrice,
                                close: currentPrice,
                                value: currentVol, // 새 봉의 거래량 (누적이면 조정 필요하나 일단 사용)
                                color: '#ef5350' // 초기 색상
                            };
                        }

                        // 3. 차트에 반영
                        if (chartType === 'candle') {
                            mainSeriesRef.current.update(updatedCandle);
                        } else {
                            mainSeriesRef.current.update({ time: targetTime, value: currentPrice });
                        }
                        
                        volumeSeriesRef.current.update({
                            time: targetTime,
                            value: currentVol,
                            color: updatedCandle.color
                        });

                        // 4. Ref 업데이트 (다음 틱 비교를 위해)
                        lastCandleRef.current = updatedCandle;
                    }
                } else if (data.type === 'ask') {
                    setAskData(data);
                }
            } catch (e) { console.error("WS Error", e); }
        };

        return () => { if (ws.current && ws.current.readyState <= 1) ws.current.close(); };
    }, [market, realCode, excd, chartData, chartPeriod, chartType]);

    const currentPrice = realtimeData?.price || staticInfo?.price || 0;
    const currentRate = realtimeData?.rate || staticInfo?.rate || 0;
    const currentDiff = realtimeData?.diff || staticInfo?.diff || 0;
    const rateClass = getRateClass(currentRate);

    const asks = Array.from({ length: 10 }, (_, i) => ({
        price: askData?.[`ask_price_${i + 1}`],
        volume: askData?.[`ask_remain_${i + 1}`] || 0
    })).reverse();

    const bids = Array.from({ length: 10 }, (_, i) => ({
        price: askData?.[`bid_price_${i + 1}`],
        volume: askData?.[`bid_remain_${i + 1}`] || 0
    }));
    const maxVolume = Math.max(...asks.map(a => Number(a.volume)), ...bids.map(b => Number(b.volume)), 1);

    return (
        <div className="detail-wrapper">
            <div className="stock-header-new">
                <div className="header-top-row">
                    <div className="title-section">
                        <span className={`market-badge ${market === 'domestic' ? 'domestic' : 'overseas'}`}>
                            {market === 'domestic' ? '국내' : '해외'}
                        </span>
                        <h1 className="stock-name">{stockName}</h1>
                        <span className="stock-code">{realCode}</span>
                        <button className="btn-ai-analyze" onClick={() => handleAiPredict({ market, code: realCode, symb: realCode })}>
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
                    <span className={`price-rate ${rateClass}`}>({Number(currentRate).toFixed(2)}%)</span>
                </div>
            </div>

            <div className="detail-grid-3col">
                <div className="col-chart-section">
                    <div className="chart-card">
                        <div className="card-header-sm">
                            <span className="card-title"><FaChartArea /> 차트</span>
                            <div className="chart-controls">
                                <div className="chart-type-toggle">
                                    <button onClick={() => setChartType('candle')} className={chartType === 'candle' ? 'active' : ''}>봉</button>
                                    <button onClick={() => setChartType('line')} className={chartType === 'line' ? 'active' : ''}>라인</button>
                                </div>

                                <select className="chart-select" value={chartPeriod.includes('m') ? chartPeriod : 'custom'} onChange={(e) => setChartPeriod(e.target.value)}>
                                    <option value="1m">1분봉</option>
                                    <option value="5m">5분봉</option>
                                    <option value="10m">10분봉</option>
                                    <option value="30m">30분봉</option>
                                    <option value="custom" disabled hidden>분봉 선택</option>
                                </select>
                                <div className="chart-tabs">
                                    <button className={chartPeriod === 'D' ? 'active' : ''} onClick={() => setChartPeriod('D')}>일</button>
                                    <button className={chartPeriod === 'W' ? 'active' : ''} onClick={() => setChartPeriod('W')}>주</button>
                                    <button className={chartPeriod === 'M' ? 'active' : ''} onClick={() => setChartPeriod('M')}>월</button>
                                    <button className={chartPeriod === 'Y' ? 'active' : ''} onClick={() => setChartPeriod('Y')}>년</button>
                                </div>
                            </div>
                        </div>
                        <div ref={chartContainerRef} className="chart-container" style={{ position: 'relative', width: '100%', height: '350px' }} />
                    </div>
                    
                    <div className="trade-list-panel">
                        <div className="panel-title"><FaBolt className="icon-bolt"/> 실시간 체결</div>
                        <div className="trade-table-header">
                            <span>시간</span><span>체결가</span><span>등락률</span><span>체결량</span><span>누적 거래량</span>
                        </div>
                        <div className="trade-list-scroll">
                            {tradeHistory.map(trade => (
                                <div key={trade.id} className="trade-row">
                                    <span className="t-time">{trade.time}</span>
                                    <span className={`t-price ${getRateClass(trade.rate)}`}>{formatNumber(trade.price)}</span>
                                    <span className={`t-rate ${getRateClass(trade.rate)}`}>{Number(trade.rate) > 0 ? '+' : ''}{Number(trade.rate).toFixed(2)}%</span>
                                    <span className="t-volume">{formatNumber(trade.vol)}</span>
                                    <span className="t-total-volume">{formatNumber(realtimeData?.volume)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    
                    <div className="dashboard-stats-card">
                       <div className="stats-row basic">
                            <div className="stat-box"><span className="label"><TermTooltip term="시가총액" /></span><span className="value">{formatAmount(staticInfo?.market_cap)}</span></div>
                            <div className="stat-box"><span className="label"><TermTooltip term="거래량" /></span><span className="value">{formatNumber(realtimeData?.volume)}</span></div>
                            <div className="stat-box"><span className="label"><TermTooltip term="거래대금" /></span><span className="value">{formatAmount(realtimeData?.amount)}</span></div>
                        </div>
                        <div className="stats-row investment-ratios">
                            <div className="stat-box ratio-item"><span className="label"><TermTooltip term="PER" /></span><span className="value">{staticInfo?.per || '-'}배</span></div>
                            <div className="stat-box ratio-item"><span className="label"><TermTooltip term="PBR" /></span><span className="value">{staticInfo?.pbr || '-'}배</span></div>
                            <div className="stat-box ratio-item"><span className="label"><TermTooltip term="EPS" /></span><span className="value">{formatNumber(staticInfo?.eps)}원</span></div>
                            <div className="stat-box ratio-item"><span className="label"><TermTooltip term="BPS" /></span><span className="value">{formatNumber(staticInfo?.bps)}원</span></div>
                        </div>
                    </div>
                </div>
                
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
                            <div className="ob-current-line"><span className={rateClass}>{formatNumber(currentPrice)}</span></div>
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