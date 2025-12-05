import { FaRobot } from "react-icons/fa";
import { formatNumber } from "../../utils/formatters";

function StockHeader({ 
    market, stockName, realCode, 
    currentPrice, currentDiff, currentRate, rateClass, 
    onAiClick 
}) {
    return (
        <div className="stock-header-new">
            <div className="header-top-row">
                <div className="title-section">
                    <span className={`market-badge ${market === 'domestic' ? 'domestic' : 'overseas'}`}>
                        {market === 'domestic' ? '국내' : '해외'}
                    </span>
                    <h1 className="stock-name">{stockName}</h1>
                    <span className="stock-code">{realCode}</span>
                    <button className="btn-ai-analyze" onClick={onAiClick}>
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
    );
}

export default StockHeader;