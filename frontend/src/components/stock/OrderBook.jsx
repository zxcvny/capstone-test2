import { formatNumber, formatPrice } from "../../utils/formatters";

// 안전한 숫자 변환 및 0 처리
const safeNumber = (value) => {
    if (!value) return 0;
    const num = typeof value === 'string' ? Number(value.replace(/,/g, '')) : value;
    return isNaN(num) ? 0 : num;
};

function OrderBook({ asks = [], bids = [], realtimeData, rateClass, currentPrice }) {
    // 최대 잔량 계산 (그래프 비율용)
    const maxVolume = Math.max(
        ...asks.map(a => safeNumber(a.volume)), 
        ...bids.map(b => safeNumber(b.volume)), 
        10 // 최소값 보정
    );

    // 잔량 총합 계산
    const totalAskVol = asks.reduce((acc, cur) => acc + safeNumber(cur.volume), 0);
    const totalBidVol = bids.reduce((acc, cur) => acc + safeNumber(cur.volume), 0);

    // 체결강도
    const strength = safeNumber(realtimeData?.strength);

    return (
        <div className="orderbook-card">
            {/* 상단 헤더: 체결강도 */}
            <div className="ob-header">
                <span className="ob-title">호가</span>
                {realtimeData?.strength && (
                    <div className="strength-display">
                        <span className="label">체결강도</span>
                        <span className={`value ${strength >= 100 ? 'up' : 'down'}`}>
                            {strength.toFixed(2)}%
                        </span>
                        <div className="strength-bar-bg">
                            <div 
                                className={`strength-bar-fill ${strength >= 100 ? 'up' : 'down'}`}
                                style={{ width: `${Math.min(strength, 100)}%` }}
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* 호가 리스트 영역 */}
            <div className="ob-list-container">
                {/* 1. 매도 호가 영역 (Asks) - 역순 정렬되어 들어옴 */}
                <div className="ob-section asks">
                    {asks.map((item, i) => {
                        const vol = safeNumber(item.volume);
                        const price = item.price;
                        return (
                            <div key={`ask-${i}`} className="ob-row ask">
                                {/* 좌측: 매도 잔량 */}
                                <div className="ob-col vol ask">
                                    {price && vol > 0 && (
                                        <>
                                            <div className="vol-bar ask" style={{ width: `${(vol / maxVolume) * 100}%` }} />
                                            <span className="vol-text">{formatNumber(vol)}</span>
                                        </>
                                    )}
                                </div>
                                {/* 중앙: 호가 */}
                                <div className="ob-col price">
                                    {price ? formatPrice(price) : '-'}
                                </div>
                                {/* 우측: 공백 (매수 잔량 칸) */}
                                <div className="ob-col vol bid empty"></div>
                            </div>
                        );
                    })}
                </div>

                {/* 2. 현재가 표시 라인 (중앙) */}
                <div className="ob-current-row">
                    <div className={`current-price-badge ${rateClass}`}>
                        {formatPrice(currentPrice)}
                        <span className="current-rate">
                            {realtimeData?.rate > 0 ? '▲' : realtimeData?.rate < 0 ? '▼' : ''}
                            {Math.abs(realtimeData?.rate || 0).toFixed(2)}%
                        </span>
                    </div>
                </div>

                {/* 3. 매수 호가 영역 (Bids) */}
                <div className="ob-section bids">
                    {bids.map((item, i) => {
                        const vol = safeNumber(item.volume);
                        const price = item.price;
                        return (
                            <div key={`bid-${i}`} className="ob-row bid">
                                {/* 좌측: 공백 */}
                                <div className="ob-col vol ask empty"></div>
                                {/* 중앙: 호가 */}
                                <div className="ob-col price">
                                    {price ? formatPrice(price) : '-'}
                                </div>
                                {/* 우측: 매수 잔량 */}
                                <div className="ob-col vol bid">
                                    {price && vol > 0 && (
                                        <>
                                            <div className="vol-bar bid" style={{ width: `${(vol / maxVolume) * 100}%` }} />
                                            <span className="vol-text">{formatNumber(vol)}</span>
                                        </>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* 하단: 잔량 총합 */}
            <div className="ob-footer">
                <div className="total-vol-box ask">
                    <span className="label">매도총잔량</span>
                    <span className="value">{formatNumber(totalAskVol)}</span>
                </div>
                <div className="total-vol-box bid">
                    <span className="label">매수총잔량</span>
                    <span className="value">{formatNumber(totalBidVol)}</span>
                </div>
            </div>
        </div>
    );
}

export default OrderBook;