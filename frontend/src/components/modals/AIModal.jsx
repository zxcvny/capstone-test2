import { FaTimes } from "react-icons/fa";
import { formatNumber } from "../../utils/formatters";

function AIModal({ isOpen, closeModal, aiLoading, aiResult }) {
    if (!isOpen) return null;

    return (
        <div className="ai-modal-overlay" onClick={closeModal}>
            <div className="ai-modal-content" onClick={(e) => e.stopPropagation()}>
                <button className="ai-close-btn" onClick={closeModal}><FaTimes /></button>
                <h3>🤖 AI 투자 분석</h3>
                {aiLoading ? (
                    <div className="ai-loading"><div className="spinner"></div><p>차트 데이터를 분석 중입니다...</p></div>
                ) : aiResult && !aiResult.error ? (
                    <div className="ai-result-box">
                        <div className="ai-header"><span className="ai-code">{aiResult.code}</span><span className="ai-market">{aiResult.market}</span></div>
                        <div className={`ai-signal signal-${aiResult.signal}`}>{aiResult.signal}</div>
                        <div className="ai-probability">확률: <strong>{aiResult.probability}</strong></div>
                        <div className="ai-prices">
                            <div className="price-item target"><span>목표가</span><strong>{formatNumber(aiResult.target_price)}원</strong></div>
                            <div className="price-item stoploss"><span>손절가</span><strong>{formatNumber(aiResult.stop_loss)}원</strong></div>
                        </div>
                        <p className="ai-desc">{aiResult.desc}</p>
                    </div>
                ) : (
                    <div className="ai-error"><p>⚠️ {aiResult?.error || "분석에 실패했습니다."}</p></div>
                )}
            </div>
        </div>
    )
}

export default AIModal