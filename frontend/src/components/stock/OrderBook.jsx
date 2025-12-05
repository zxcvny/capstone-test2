import { formatNumber, formatPrice } from "../../utils/formatters";

// 안전한 숫자 변환 헬퍼 함수
const safeNumber = (value) => {
    if (!value) return 0;
    if (typeof value === 'number') return value;
    return Number(String(value).replace(/,/g, '')) || 0;
};

function OrderBook({ asks = [], bids = [], realtimeData, rateClass, currentPrice }) {
    // [수정] 콤마가 포함된 문자열이 와도 NaN이 되지 않도록 처리
    const maxVolume = Math.max(
        ...asks.map(a => safeNumber(a.volume)), 
        ...bids.map(b => safeNumber(b.volume)), 
        1
    );

    return (
        <div className="orderbook-card">
            <div className="card-header-sm center">
                <span className="card-title">호가</span>
                {realtimeData?.strength && (
                    <span className={`strength-badge ${safeNumber(realtimeData.strength) >= 100 ? 'up' : 'down'}`}>
                         체결강도 {safeNumber(realtimeData.strength).toFixed(2)}%
                    </span>
                )}
            </div>
            <div className="ob-list">
                {asks.map((item, i) => {
                    const vol = safeNumber(item.volume);
                    return (
                        <div key={`ask-${i}`} className="ob-item ask">
                            <div className="ob-left">
                                <div className="ob-vol-text">{item.price && vol > 0 ? formatNumber(vol) : ''}</div>
                                {item.price && <div className="bar ask-bar" style={{width: `${(vol/maxVolume)*100}%`}} />}
                            </div>
                            <div className="ob-center price">{item.price ? formatPrice(item.price) : '-'}</div>
                            <div className="ob-right"></div>
                        </div>
                    );
                })}
                
                <div className="ob-current-line">
                    <span className={rateClass}>{formatNumber(currentPrice)}</span>
                </div>
                
                {bids.map((item, i) => {
                    const vol = safeNumber(item.volume);
                    return (
                        <div key={`bid-${i}`} className="ob-item bid">
                            <div className="ob-left"></div>
                            <div className="ob-center price">{item.price ? formatPrice(item.price) : '-'}</div>
                            <div className="ob-right">
                                <div className="ob-vol-text">{item.price && vol > 0 ? formatNumber(vol) : ''}</div>
                                {item.price && <div className="bar bid-bar" style={{width: `${(vol/maxVolume)*100}%`}} />}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default OrderBook;