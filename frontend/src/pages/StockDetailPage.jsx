// src/pages/StockDetailPage.jsx
import { useEffect, useRef, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { FaChartBar, FaInfoCircle } from "react-icons/fa"; // 화살표 아이콘 제거 (텍스트로 대체)
import axios from "../lib/axios";
import { formatNumber, formatPrice, formatAmount, getRateClass } from "../utils/formatters";
import "../styles/StockDetailPage.css";

function StockDetailPage() {
    const { market, stockId } = useParams();
    const location = useLocation();

    // URL 파라미터 및 State 기반 코드 설정
    const realCode = market === 'overseas'
        ? (location.state?.symb || stockId)
        : (location.state?.code || stockId);

    const stockName = location.state?.name || stockId;
    const excd = location.state?.excd || (market === 'overseas' ? 'NAS' : '');

    // 상태 관리
    const [staticInfo, setStaticInfo] = useState(null);
    const [realtimeData, setRealtimeData] = useState(null);
    const [askData, setAskData] = useState(null);

    const ws = useRef(null);

    // --- 데이터 로딩 및 웹소켓 (이전과 동일) ---
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
                        rate: response.data.change_rate,
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

                if (data.type === 'tick') {
                    setRealtimeData(prev => ({ ...prev, ...data }));
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

    // --- 렌더링 변수 ---
    const currentPrice = realtimeData?.price || staticInfo?.price || 0;
    const currentRate = realtimeData?.rate || staticInfo?.change_rate || 0;
    const currentDiff = realtimeData?.diff || staticInfo?.diff || 0;
    const rateClass = getRateClass(currentRate);

    // 호가 데이터
    const asks = [5, 4, 3, 2, 1].map(i => ({ price: askData?.[`ask_price_${i}`], volume: askData?.[`ask_volume_${i}`] || 0 }));
    const bids = [1, 2, 3, 4, 5].map(i => ({ price: askData?.[`bid_price_${i}`], volume: askData?.[`bid_volume_${i}`] || 0 }));
    const maxVolume = Math.max(...asks.map(a => Number(a.volume)), ...bids.map(b => Number(b.volume)), 1);

    return (
        <div className="detail-wrapper">
            {/* [이미지 디자인 적용된 헤더]
               1행: 종목명 + 종목코드
               2행: 현재가 | 지난 정규장보다 +변동폭 (등락률)
            */}
            <div className="stock-header-new">
                {/* 1행: 이름과 코드 */}
                <div className="title-row">
                    <h1 className="stock-name-header">{stockName}</h1>
                    <span className="market-tag">{realCode}</span>
                </div>

                {/* 2행: 가격과 등락률 */}
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

            {/* 메인 그리드 (이전과 동일) */}
            <div className="detail-grid">
                {/* 왼쪽: 차트 및 정보 */}
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
                            <div className="chart-msg">
                                📊 Chart Area
                            </div>
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
                                        <span className="label">시가총액</span>
                                        <span className="value">{formatAmount(staticInfo.market_cap)}</span>
                                    </div>
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
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* 오른쪽: 호가창 */}
                <div className="right-column">
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
                </div>
            </div>
        </div>
    );
}

export default StockDetailPage;