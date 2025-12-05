import { FaBolt, FaQuestionCircle } from "react-icons/fa";
import { formatNumber, formatAmount, getRateClass } from "../../utils/formatters";

const TERM_DEFINITIONS = {
    "시가총액": "기업의 가치를 시장 가격으로 환산한 총액입니다. (현재가 × 상장주식수)",
    "거래량": "하루 동안 거래된 주식의 총 수량입니다.",
    "거래대금": "하루 동안 거래된 주식의 총 금액입니다.",
    "PER": "주가수익비율. 주가가 1주당 순이익의 몇 배인지 나타냅니다.",
    "PBR": "주가순자산비율. 주가가 1주당 순자산의 몇 배인지 나타냅니다.",
    "EPS": "주당순이익. 기업이 1주당 얼마의 이익을 냈는지 보여줍니다.",
    "BPS": "주당순자산가치. 기업 자산을 주주에게 나눠줄 때 1주당 금액입니다.",
};

const TermTooltip = ({ term }) => (
    <span className="term-tooltip-wrapper">
        {term}
        <span className="tooltip-icon"><FaQuestionCircle /></span>
        <div className="tooltip-content">{TERM_DEFINITIONS[term] || "설명이 없습니다."}</div>
    </span>
);

function StockDashboard({ tradeHistory, realtimeData, staticInfo }) {
    return (
        <>
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
        </>
    );
}

export default StockDashboard;