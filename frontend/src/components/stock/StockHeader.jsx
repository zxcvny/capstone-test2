import { FaRobot, FaChevronRight, FaChartLine, FaHeart, FaRegHeart  } from "react-icons/fa"; // [추가] 별 아이콘 import
import { formatNumber } from "../../utils/formatters";
import { useFavorites } from "../../hooks/useFavorites"; // [추가] 훅 import
import GroupSelectModal from "../modals/GroupSelectModal"; // [추가] 모달 import

function StockHeader({ 
    market, stockName, realCode, 
    currentPrice, currentDiff, currentRate, rateClass, 
    aiLoading, aiResult, onAiClick 
}) {
    // [추가] 관심종목 훅 사용
    const { 
        favorites, 
        toggleFavorite, 
        isGroupModalOpen, 
        setIsGroupModalOpen, 
        myGroups, 
        targetStock, 
        addToGroup 
    } = useFavorites();

    // [추가] 현재 종목이 관심종목인지 확인
    const isFavorite = favorites.has(realCode);

    // [추가] 즐겨찾기 버튼 클릭 핸들러
    const handleFavoriteClick = (e) => {
        toggleFavorite(e, {
            market,
            code: realCode,
            symb: realCode, // 해외주식의 경우를 위해 symb에도 할당
            name: stockName
        });
    };

    // 신호에 따른 스타일 정의
    const getAiSignalStyle = (signal) => {
        if (!signal) return {};
        if (signal.includes("매수")) return { 
            bg: 'linear-gradient(135deg, #fff3e0 0%, #ffebee 100%)', 
            color: '#d84315', 
            border: '#ffcc80',
            iconColor: '#ff5722'
        };
        if (signal.includes("매도")) return { 
            bg: 'linear-gradient(135deg, #e3f2fd 0%, #f3e5f5 100%)', 
            color: '#1565c0', 
            border: '#90caf9',
            iconColor: '#2196f3'
        };
        return { 
            bg: '#f5f5f5', 
            color: '#616161', 
            border: '#e0e0e0',
            iconColor: '#757575'
        }; 
    };

    const style = aiResult ? getAiSignalStyle(aiResult.signal) : {};

    return (
        // [수정] 전체 헤더를 Flex 컨테이너로 변경하여 좌우 배치 및 수직 중앙 정렬
        <div className="stock-header-new" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '10px' }}>
            
            {/* [그룹화] 왼쪽 영역: 종목 이름과 가격 정보를 세로로 묶음 */}
            <div className="header-left-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                
                {/* 1. 종목 이름 영역 */}
                <div className="title-section" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className={`market-badge ${market === 'domestic' ? 'domestic' : 'overseas'}`}>
                        {market === 'domestic' ? '국내' : '해외'}
                    </span>
                    <h1 className="stock-name" style={{ margin: 0 }}>{stockName}</h1>
                    
                    {/* [추가] 관심종목 별 아이콘 버튼 */}
                    <button 
                        onClick={handleFavoriteClick}
                        style={{ 
                            background: 'none', 
                            border: 'none', 
                            cursor: 'pointer', 
                            padding: '4px', 
                            display: 'flex', 
                            alignItems: 'center',
                            outline: 'none'
                        }}
                        title={isFavorite ? "관심종목 해제" : "관심종목 추가"}
                    >
                        {isFavorite ? (
                            <FaHeart size={22} color="#ff4d4d" /> 
                        ) : (
                            <FaRegHeart size={22} color="#ccc" /> 
                        )}
                    </button>

                    <span className="stock-code">{realCode}</span>
                </div>

                {/* 2. 가격 정보 영역 */}
                <div className="header-price-row" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className={`current-price ${rateClass}`} style={{ fontSize: '24px', fontWeight: 'bold' }}>
                        {formatNumber(currentPrice)}
                    </span>
                    <span className="currency" style={{ fontSize: '14px', color: '#666' }}>원</span>
                    <span className={`price-diff ${rateClass}`} style={{ fontSize: '15px' }}>
                        {Number(currentDiff) > 0 ? '▲' : '▼'} {formatNumber(Math.abs(currentDiff))}
                    </span>
                    <span className={`price-rate ${rateClass}`} style={{ fontSize: '15px' }}>
                        ({Number(currentRate).toFixed(2)}%)
                    </span>
                </div>
            </div>

            {/* [그룹화] 오른쪽 영역: AI 분석 카드 */}
            <div className="ai-status-wrapper">
                {(aiResult || aiLoading) ? (
                    <div 
                        onClick={!aiLoading ? onAiClick : undefined}
                        className="ai-result-card"
                        style={{
                            cursor: aiLoading ? 'wait' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            padding: '10px 20px', 
                            borderRadius: '16px',
                            background: aiLoading ? '#fafafa' : style.bg,
                            border: `1px solid ${aiLoading ? '#eee' : style.border}`,
                            boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                            transition: 'all 0.2s ease',
                            minWidth: '240px',
                            justifyContent: 'space-between'
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.1)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.05)'; }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center',
                                width: '40px', 
                                height: '40px', 
                                borderRadius: '50%', 
                                backgroundColor: 'rgba(255,255,255,0.9)',
                                color: aiLoading ? '#999' : style.iconColor 
                            }}>
                                <FaRobot size={22} className={aiLoading ? "spin" : ""} />
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                {aiLoading ? (
                                    <span style={{ fontSize: '14px', fontWeight: '600', color: '#757575' }}>
                                        분석중...
                                    </span>
                                ) : (
                                    <>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span style={{ fontSize: '16px', fontWeight: '700', color: style.color }}>
                                                {aiResult.signal}
                                            </span>
                                            <span style={{ fontSize: '13px', fontWeight: '600', color: style.color, opacity: 0.8 }}>
                                                {aiResult.probability}
                                            </span>
                                        </div>
                                        <span style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>
                                            AI 상세 리포트 확인
                                        </span>
                                    </>
                                )}
                            </div>
                        </div>
                        
                        {!aiLoading && <FaChevronRight size={14} color="#aaa" />}
                    </div>
                ) : (
                    <button 
                        className="btn-ai-analyze" 
                        onClick={onAiClick}
                        style={{ padding: '10px 20px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                        <FaChartLine /> AI 분석 실행
                    </button>
                )}
            </div>

            {/* [추가] 관심종목 그룹 선택 모달 */}
            <GroupSelectModal 
                isOpen={isGroupModalOpen}
                setIsGroupModalOpen={() => setIsGroupModalOpen(false)} // 닫기 함수 전달
                myGroups={myGroups}
                targetStock={targetStock}
                addToGroup={addToGroup}
            />
        </div>
    );
}

export default StockHeader;