import { formatNumber, formatPrice } from "../../utils/formatters";

function OrderBook({ asks, bids, realtimeData, rateClass, currentPrice }) {
    const maxVolume = Math.max(...asks.map(a => Number(a.volume)), ...bids.map(b => Number(b.volume)), 1);

    return (
        <div className="orderbook-card">
            <div className="card-header-sm center">
                <span className="card-title">호가</span>
                {realtimeData?.strength && (
                    <span className={`strength-badge ${Number(realtimeData.strength) >= 100 ? 'up' : 'down'}`}>
                         체결강도 {Number(realtimeData.strength).toFixed(2)}%
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
    );
}

export default OrderBook;