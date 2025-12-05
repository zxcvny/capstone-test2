import { useEffect, useRef, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { FaChartBar, FaInfoCircle, FaListUl } from "react-icons/fa"; // 아이콘 추가
import axios from "../lib/axios";
import { formatNumber, formatPrice, formatAmount, getRateClass } from "../utils/formatters";
import "../styles/StockDetailPage.css";

function StockDetailPage() {
    const { market, stockId } = useParams();
    const location = useLocation();

    const realCode = market === 'overseas'
        ? (location.state?.symb || stockId)
        : (location.state?.code || stockId);

    const stockName = location.state?.name || stockId;
    const excd = location.state?.excd || (market === 'overseas' ? 'NAS' : '');

    const [staticInfo, setStaticInfo] = useState(null);
    const [realtimeData, setRealtimeData] = useState(null);
    const [askData, setAskData] = useState(null);
    
    // [추가] 실시간 체결 내역 저장 State
    const [tradeHistory, setTradeHistory] = useState([]);

    const ws = useRef(null);

    useEffect(() => {
        window.scrollTo(0, 0);
    }, [])

    useEffect(() => {
        const fetchStockDetail = async () => {
            try {
                const params = {
                    market: market,
                    code: realCode,
                    ...(market === 'overseas' && { exchange: excd })
                };
                
                const response = await axios.get('/stocks/detail', { params });
                
                if (response.data) {
                    setStaticInfo(response.data);
                    setRealtimeData({
                        price: response.data.price,
                        diff: response.data.diff,
                        rate: response.data.rate,
                        volume: response.data.volume,
                        amount: response.data.amount,
                        open: null, high: null, low: null, date: null, strength: null
                    });
                }
            } catch (error) {
                console.error("Failed to fetch stock detail:", error);
            }
        };
        fetchStockDetail();
    }, [market, realCode, excd]);

    useEffect(() => {
        if (ws.current) ws.current.close();
        ws.current = new WebSocket('ws://localhost:8000/stocks/ws/realtime');

        ws.current.onopen = () => {
            console.log("⚡ Detail WS Connected");
            const initMsg = {
                items: [
                    { code: realCode, market: market, type: "tick", excd: excd },
                    { code: realCode, market: market, type: "ask", excd: excd }
                ]
            };
            ws.current.send(JSON.stringify(initMsg));
        };

        ws.current.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                if (message.type !== 'realtime') return;
                const data = message.data;

                if (data.code !== realCode) {
                     return;
                }

                if (data.type === 'tick') {
                    setRealtimeData(prev => ({ ...prev, ...data }));
                    
                    // [추가] 체결 내역 업데이트 로직
                    setTradeHistory(prev => {
                        // 백엔드에서 시간이 오지 않을 경우 클라이언트 시간 사용
                        const now = new Date();
                        const timeStr = data.time || now.toLocaleTimeString('ko-KR', { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' });
                        
                        const newTrade = {
                            id: Date.now() + Math.random(), // 고유 키
                            time: timeStr,
                            price: data.price,
                            diff: data.diff,
                            rate: data.rate,
                            // data.tvol(tick volume)이 있다면 사용, 없다면 누적거래량 표시 등 정책 결정 필요
                            // 여기서는 간단히 가격 변동 위주로 표시
                        };
                        // 최신 30개만 유지
                        return [newTrade, ...prev].slice(0, 30);
                    });

                } else if (data.type === 'ask') {
                    setAskData(data);
                }
            } catch (error) {
                console.error("WS Message Error:", error);
            }
        };

        return () => {
            if (ws.current) {
                ws.current.close();
                ws.current = null;
            }
        };
    }, [market, realCode, excd]);

    const currentPrice = realtimeData?.price || staticInfo?.price || 0;
    const currentRate = realtimeData?.rate || staticInfo?.rate || 0;
    const currentDiff = realtimeData?.diff || staticInfo?.diff || 0;
    const rateClass = getRateClass(currentRate);

    const asks = Array.from({ length: 10 }, (_, i) => {
        const level = 10 - i;
        return {
            price: askData?.[`ask_price_${level}`],
            volume: askData?.[`ask_remain_${level}`] || 0
        };
    });

    const bids = Array.from({ length: 10 }, (_, i) => {
        const level = i + 1;
        return {
            price: askData?.[`bid_price_${level}`],
            volume: askData?.[`bid_remain_${level}`] || 0
        };
    });
    const maxVolume = Math.max(...asks.map(a => Number(a.volume)), ...bids.map(b => Number(b.volume)), 1);

    return (
        <div className="detail-wrapper">
            <div className="stock-header-new">
                <div className="title-row">
                    <h1 className="stock-name-header">{stockName}</h1>
                    <span className="market-tag">{realCode}</span>
                </div>

                <div className="price-row">
                    <span className={`main-price ${rateClass}`}>
                        {formatNumber(currentPrice)}<span className="unit">원</span>
                    </span>
                    <span className="divider-bar">|</span>
                    <span className="compare-text">전일 대비</span>
                    <span className={`change-info ${rateClass}`}>
                        {Number(currentDiff) > 0 ? '+' : ''}{formatNumber(currentDiff)}원
                        &nbsp;
                        ({Number(currentRate).toFixed(2)}%)
                    </span>
                </div>
            </div>

            <div className="detail-grid">
                <div className="left-column">
                    <div className="chart-card">
                        <div className="chart-header">
                            <h3>Price Chart</h3>
                            <div className="chart-controls">
                                <button className="active">1일</button>
                                <button>1주</button>
                                <button>1달</button>
                                <button>1년</button>
                            </div>
                        </div>
                        <div className="chart-placeholder">
                            <div className="chart-mock-grid"></div>
                            <div className="chart-msg">📊 Chart Area</div>
                        </div>
                    </div>

                    <div className="info-cards-row">
                        <div className="info-card expanded">
                            <div className="card-title">
                                <FaChartBar /> <span>시세 상세</span>
                            </div>
                            <div className="detail-data-grid">
                                <div className="detail-item">
                                    <span className="label">시가</span>
                                    <span className={`value ${getRateClass(realtimeData?.open - staticInfo?.base_price)}`}>
                                        {formatPrice(realtimeData?.open)}
                                    </span>
                                </div>
                                <div className="detail-item">
                                    <span className="label">고가</span>
                                    <span className="value text-up">{formatPrice(realtimeData?.high)}</span>
                                </div>
                                <div className="detail-item">
                                    <span className="label">저가</span>
                                    <span className="value text-down">{formatPrice(realtimeData?.low)}</span>
                                </div>
                                <div className="detail-item">
                                    <span className="label">거래량</span>
                                    <span className="value">{formatNumber(realtimeData?.volume)}</span>
                                </div>
                            </div>
                        </div>

                        {staticInfo && (
                            <div className="info-card expanded">
                                <div className="card-title">
                                    <FaInfoCircle /> <span>기업 정보</span>
                                </div>
                                <div className="detail-data-grid">
                                    <div className="detail-item">
                                        <span className="label">PER</span>
                                        <span className="value">{staticInfo.per || '-'} 배</span>
                                    </div>
                                    <div className="detail-item">
                                        <span className="label">PBR</span>
                                        <span className="value">{staticInfo.pbr || '-'} 배</span>
                                    </div>
                                    <div className="detail-item">
                                        <span className="label">EPS</span>
                                        <span className="value">{formatNumber(staticInfo.eps)} 원</span>
                                    </div>
                                    <div className="detail-item">
                                        <span className="label">시가총액</span>
                                        <span className="value">{formatAmount(staticInfo.market_cap)}</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="right-column">
                    {/* 호가창 */}
                    <div className="order-book-card">
                        <div className="order-book-header">
                            <span className="ob-title">호가 (Order Book)</span>
                            {realtimeData?.strength && (
                                <span className={`ob-strength ${Number(realtimeData.strength) >= 100 ? 'text-up' : 'text-down'}`}>
                                    체결강도 {realtimeData.strength}%
                                </span>
                            )}
                        </div>
                        <div className="order-book-body">
                            {asks.map((item, idx) => (
                                <div key={`ask-${idx}`} className="ob-row ask-row">
                                    <div className="ob-price">{formatPrice(item.price)}</div>
                                    <div className="ob-volume">
                                        {item.price ? formatNumber(item.volume) : ''}
                                        {item.price && (
                                            <div className="vol-bar-bg ask-bar" style={{ width: `${(item.volume / maxVolume) * 100}%` }} />
                                        )}
                                    </div>
                                </div>
                            ))}
                            <div className={`ob-current-bar ${rateClass}`}>
                                <span className="curr-price">{formatPrice(currentPrice)}</span>
                                <span className="curr-rate">
                                    {Number(currentDiff) > 0 ? '▲' : '▼'} {Math.abs(Number(currentRate)).toFixed(2)}%
                                </span>
                            </div>
                            {bids.map((item, idx) => (
                                <div key={`bid-${idx}`} className="ob-row bid-row">
                                    <div className="ob-price">{formatPrice(item.price)}</div>
                                    <div className="ob-volume">
                                        {item.price ? formatNumber(item.volume) : ''}
                                        {item.price && (
                                            <div className="vol-bar-bg bid-bar" style={{ width: `${(item.volume / maxVolume) * 100}%` }} />
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="order-book-footer">
                            <button className="trade-btn buy">매수</button>
                            <button className="trade-btn sell">매도</button>
                        </div>
                    </div>

                    {/* [추가] 실시간 체결 리스트 카드 */}
                    <div className="trade-list-card">
                        <div className="card-title compact">
                            <FaListUl /> <span>실시간 체결</span>
                        </div>
                        <div className="trade-list-header-row">
                            <span>시간</span>
                            <span>체결가</span>
                            <span>전일대비</span>
                        </div>
                        <div className="trade-list-body custom-scrollbar">
                            {tradeHistory.length === 0 ? (
                                <div className="trade-empty">체결 내역 대기중...</div>
                            ) : (
                                tradeHistory.map((trade) => (
                                    <div key={trade.id} className="trade-row-item">
                                        <span className="t-time">{trade.time}</span>
                                        <span className={`t-price ${getRateClass(trade.rate)}`}>
                                            {formatPrice(trade.price)}
                                        </span>
                                        <span className={`t-diff ${getRateClass(trade.rate)}`}>
                                            {Number(trade.diff) > 0 ? '+' : ''}{formatNumber(trade.diff)}
                                        </span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}

export default StockDetailPage;