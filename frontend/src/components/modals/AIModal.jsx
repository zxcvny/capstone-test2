// src/components/modals/AIModal.jsx
import { FaTimes, FaRobot } from "react-icons/fa";
import { formatNumber } from "../../utils/formatters";
import '../../styles/AIModal.css'; // [NEW] 분리된 CSS 파일 임포트

function AIModal({ isOpen, closeModal, aiLoading, aiResult }) {
    if (!isOpen) return null;

    const getReturnColorClass = (rate) => {
        if (rate > 0) return "ai-text-up";
        if (rate < 0) return "ai-text-down";
        return "";
    };

    return (
        <div className="ai-modal-overlay" onClick={closeModal}>
            <div className="ai-modal-content" onClick={(e) => e.stopPropagation()}>
                <button className="ai-close-btn" onClick={closeModal}><FaTimes /></button>
                
                <h3><FaRobot style={{color:'var(--color-primary)'}}/> AI 투자 리포트</h3>
                
                {aiLoading ? (
                    <div className="ai-loading">
                        <div className="loading-spinner" style={{margin:'0 auto 15px', width:'30px', height:'30px'}}></div>
                        <p>우주선이 데이터를 분석 중입니다...</p>
                    </div>
                ) : aiResult && !aiResult.error ? (
                    <div className="ai-result-box">
                        {/* 1. 상단 정보 */}
                        <div className="ai-header">
                            <span className="ai-code">{aiResult.code}</span>
                            <span style={{color:'#666'}}>|</span>
                            <span>{aiResult.market}</span>
                        </div>

                        {/* 2. 핵심 신호 */}
                        <div className={`ai-signal signal-${aiResult.signal.split(' ')[0] || aiResult.signal}`}>
                            {aiResult.signal}
                        </div>
                        <div className="ai-probability">
                            AI 확신도 <strong style={{color:'#fff', marginLeft:'4px'}}>{aiResult.probability}</strong>
                        </div>

                        {/* 3. 상세 데이터 (HUD 스타일) */}
                        <div className="ai-detail-grid">
                            <div className="detail-row">
                                <div className="detail-item">
                                    <span className="label">현재가</span>
                                    <span className="value">{formatNumber(aiResult.current_price)}</span>
                                </div>
                                <div className="detail-item">
                                    <span className="label">내일 예상</span>
                                    <span className="value ai-text-highlight">{formatNumber(aiResult.predicted_price)}</span>
                                </div>
                            </div>
                            
                            <div className="return-row">
                                <div className="detail-row" style={{justifyContent: 'center', gap: '8px'}}>
                                    <span className="label" style={{marginBottom:0}}>예상 수익률</span>
                                    <span className={`value ${getReturnColorClass(aiResult.expected_return)}`} style={{fontSize:'18px'}}>
                                        {aiResult.expected_return > 0 ? '▲' : aiResult.expected_return < 0 ? '▼' : ''} 
                                        {Math.abs(aiResult.expected_return)}%
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* 4. 매매 전략 */}
                        <div className="ai-prices">
                            <div className="price-item target">
                                <span>목표가 (Target)</span>
                                <strong className="ai-text-up">{formatNumber(aiResult.target_price)}</strong>
                            </div>
                            <div className="price-item stoploss">
                                <span>손절가 (Stop)</span>
                                <strong className="ai-text-down">{formatNumber(aiResult.stop_loss)}</strong>
                            </div>
                        </div>

                        {/* 5. AI 코멘트 */}
                        <p className="ai-desc">
                            "{aiResult.desc}"
                        </p>
                    </div>
                ) : (
                    <div className="ai-error">
                        <p>⚠️ {aiResult?.error || "분석 데이터를 수신하지 못했습니다."}</p>
                    </div>
                )}
            </div>
        </div>
    )
}

export default AIModal;