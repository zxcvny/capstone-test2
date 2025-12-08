import { FaTimes } from "react-icons/fa";
import { formatNumber } from "../../utils/formatters";

function AIModal({ isOpen, closeModal, aiLoading, aiResult }) {
    if (!isOpen) return null;

    // 예상 수익률 색상 결정 (한국장 기준: 상승=빨강, 하락=파랑)
    const getReturnColorClass = (rate) => {
        if (rate > 0) return "ai-text-red";
        if (rate < 0) return "ai-text-blue";
        return "";
    };

    return (
        <div className="ai-modal-overlay" onClick={closeModal}>
            <div className="ai-modal-content" onClick={(e) => e.stopPropagation()}>
                <button className="ai-close-btn" onClick={closeModal}><FaTimes /></button>
                
                <h3>🤖 AI 투자 분석</h3>
                
                {aiLoading ? (
                    <div className="ai-loading">
                        <div className="spinner"></div>
                        <p>차트 데이터를 분석 중입니다...</p>
                    </div>
                ) : aiResult && !aiResult.error ? (
                    <div className="ai-result-box">
                        {/* 1. 상단 정보 */}
                        <div className="ai-header">
                            <span className="ai-code">{aiResult.code}</span>
                            <span className="ai-market">{aiResult.market}</span>
                        </div>

                        {/* 2. 핵심 신호 및 확률 */}
                        <div className={`ai-signal signal-${aiResult.signal}`}>
                            {aiResult.signal}
                        </div>
                        <div className="ai-probability">
                            AI 확신도: <strong>{aiResult.probability}</strong>
                        </div>

                        {/* 3. 상세 분석 데이터 (추가된 부분) */}
                        <div className="ai-detail-grid">
                            <div className="detail-row">
                                <div className="detail-item">
                                    <span className="label">현재가</span>
                                    <span className="value">{formatNumber(aiResult.current_price)}원</span>
                                </div>
                                <div className="detail-item">
                                    <span className="label">내일 예상가</span>
                                    <span className="value highlight">{formatNumber(aiResult.predicted_price)}원</span>
                                </div>
                            </div>
                            
                            <div className="detail-row return-row">
                                <span className="label">예상 수익률</span>
                                <span className={`value ${getReturnColorClass(aiResult.expected_return)}`}>
                                    {aiResult.expected_return > 0 ? '▲' : aiResult.expected_return < 0 ? '▼' : '-'} 
                                    {Math.abs(aiResult.expected_return)}%
                                </span>
                            </div>
                        </div>

                        {/* 4. 매매 전략 (목표가/손절가) */}
                        <div className="ai-prices">
                            <div className="price-item target">
                                <span>목표가</span>
                                <strong>{formatNumber(aiResult.target_price)}원</strong>
                            </div>
                            <div className="price-item stoploss">
                                <span>손절가</span>
                                <strong>{formatNumber(aiResult.stop_loss)}원</strong>
                            </div>
                        </div>

                        {/* 5. AI 코멘트 */}
                        <p className="ai-desc">{aiResult.desc}</p>
                    </div>
                ) : (
                    <div className="ai-error">
                        <p>⚠️ {aiResult?.error || "분석에 실패했습니다."}</p>
                    </div>
                )}
            </div>
            
            {/* 스타일 추가 (이 파일 안에 스타일을 포함하거나 CSS 파일에 추가하세요) */}
            <style jsx="true">{`
                .ai-detail-grid {
                    background-color: #f8f9fa;
                    border-radius: 8px;
                    padding: 15px;
                    margin: 15px 0;
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                }
                .detail-row {
                    display: flex;
                    justify-content: space-between;
                    gap: 15px;
                }
                .detail-item {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    flex: 1;
                }
                .detail-item .label {
                    font-size: 12px;
                    color: #666;
                    margin-bottom: 4px;
                }
                .detail-item .value {
                    font-weight: bold;
                    font-size: 16px;
                }
                .detail-item .value.highlight {
                    color: #6c5ce7;
                }
                .return-row {
                    justify-content: center;
                    align-items: center;
                    background: #fff;
                    padding: 8px;
                    border-radius: 4px;
                    gap: 10px;
                }
                .return-row .value {
                    font-weight: 800;
                    font-size: 18px;
                }
                .ai-text-red { color: #e74c3c; }
                .ai-text-blue { color: #3498db; }
            `}</style>
        </div>
    )
}

export default AIModal