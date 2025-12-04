import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaHeart, FaPlus, FaTrash, FaRobot, FaTimes, FaCaretUp, FaCaretDown, FaMinus, FaFolder, FaFolderOpen } from "react-icons/fa";
import axios from '../../lib/axios';
import { useAuth } from '../../context/AuthContext';
import LoginRequired from '../../components/LoginRequired';
import '../../styles/Home.css';
import { motion } from "framer-motion";

function MyFavorite() {
    const { user } = useAuth();
    const navigate = useNavigate();

    const [groups, setGroups] = useState([]);
    const [selectedGroupId, setSelectedGroupId] = useState(null);
    const [stocks, setStocks] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const ws = useRef(null);

    // AI 모달 관련 상태
    const [aiLoading, setAiLoading] = useState(false);
    const [aiResult, setAiResult] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    // [추가] 그룹 생성 모달 상태
    const [isCreateGroupModalOpen, setIsCreateGroupModalOpen] = useState(false);
    const [newGroupName, setNewGroupName] = useState("");

    // 1. 그룹 목록 가져오기
    useEffect(() => {
        if (!user) return;
        const fetchGroups = async () => {
            try {
                const res = await axios.get('/users/me/favorites/groups');
                setGroups(res.data);
                if (res.data.length > 0) {
                    // 이미 선택된 그룹이 없거나 유효하지 않으면 첫 번째 그룹 선택
                    if (!selectedGroupId || !res.data.find(g => g.group_id === selectedGroupId)) {
                        setSelectedGroupId(res.data[0].group_id);
                    }
                }
            } catch (error) { console.error(error); }
        };
        fetchGroups();
    }, [user, selectedGroupId]); // selectedGroupId 의존성 추가

    // 2. 선택된 그룹의 주식 가져오기
    useEffect(() => {
        if (!user || !selectedGroupId) return;
        
        const fetchStocks = async () => {
            setIsLoading(true);
            try {
                const res = await axios.get('/users/me/favorites/stocks', {
                    params: { group_id: selectedGroupId }
                });
                
                const initializedData = res.data.map(item => ({
                    ...item, price: null, rate: 0, volume: 0, amount: 0
                }));
                setStocks(initializedData);
                
                if (initializedData.length > 0) connectWebSocket(initializedData);
                else if (ws.current) ws.current.close();

            } catch (error) { console.error(error); } 
            finally { setIsLoading(false); }
        };
        fetchStocks();
        return () => { if (ws.current) { ws.current.close(); ws.current = null; } };
    }, [selectedGroupId, user]);

    // WebSocket 연결 (기존과 동일)
    const connectWebSocket = (targetList) => {
        if (ws.current) ws.current.close();
        ws.current = new WebSocket('ws://localhost:8000/stocks/ws/realtime');
        ws.current.onopen = () => {
            ws.current.send(JSON.stringify({ items: targetList.map(item => ({ code: item.code, market: item.market })) }));
        };
        ws.current.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.type !== 'realtime') return;
                const d = msg.data;
                setStocks(prev => prev.map(item => {
                    if (item.code !== d.code) return item;
                    return { ...item, price: d.price, rate: d.rate, volume: d.volume, amount: d.amount };
                }));
            } catch (e) {}
        };
    };

    // 그룹 생성 (모달 사용)
    const handleCreateGroup = async () => {
        if (!newGroupName.trim()) return alert("그룹 이름을 입력해주세요.");
        try {
            const res = await axios.post('/users/me/favorites/groups', { name: newGroupName });
            setGroups([...groups, res.data]);
            setSelectedGroupId(res.data.group_id);
            setIsCreateGroupModalOpen(false);
            setNewGroupName("");
        } catch (e) { alert("그룹 생성 실패"); }
    };

    // 그룹 삭제
    const handleDeleteGroup = async () => {
        if (!selectedGroupId) return;
        if (!window.confirm("현재 그룹을 삭제하시겠습니까? 포함된 종목도 함께 삭제됩니다.")) return;
        try {
            await axios.delete(`/users/me/favorites/groups/${selectedGroupId}`);
            const newGroups = groups.filter(g => g.group_id !== selectedGroupId);
            setGroups(newGroups);
            // 삭제 후 다른 그룹 선택 (없으면 null)
            setSelectedGroupId(newGroups.length > 0 ? newGroups[0].group_id : null);
        } catch (e) { alert("삭제 실패"); }
    };

    // 종목 삭제
    const handleRemoveStock = async (e, item) => {
        e.stopPropagation();
        if (!window.confirm(`'${item.name}' 삭제하시겠습니까?`)) return;
        try {
            await axios.delete('/users/me/favorites/stocks', {
                params: { code: item.code, group_id: selectedGroupId }
            });
            setStocks(prev => prev.filter(s => s.code !== item.code));
        } catch (e) { console.error(e); }
    };

    // AI 예측 및 포맷팅 (기존 코드 유지)
    const handleAiPredict = async (item) => {
        setAiLoading(true); setAiResult(null); setIsModalOpen(true);
        try {
            const mkt = item.market === 'domestic' ? 'KR' : 'NAS';
            const res = await axios.get(`/stocks/ai/predict`, { params: { market: mkt, code: item.code } });
            setAiResult(res.data);
        } catch (error) { setAiResult({ error: "분석 실패" }); } 
        finally { setAiLoading(false); }
    };
    const closeModal = () => { setIsModalOpen(false); setAiResult(null); };
    
    // 유틸리티
    const formatNumber = (num) => (num ? Number(num).toLocaleString() : '-');
    const formatAmount = (num) => {
        if (!num) return '-';
        const val = Number(num);
        if (val >= 1_000_000_000_000) return `${(val / 1_000_000_000_000).toFixed(2)}조원`;
        if (val >= 100_000_000) return `${(val / 100_000_000).toFixed(0)}억원`;
        return `${Math.floor(val).toLocaleString()}원`;
    };
    const formatPrice = (num) => (num ? `${Math.floor(Number(num)).toLocaleString()}원` : '-');
    const renderRate = (rate) => {
        const val = Number(rate);
        if (val > 0) return <span className="rate-cell text-up"><FaCaretUp /> {val}%</span>;
        if (val < 0) return <span className="rate-cell text-down"><FaCaretDown /> {Math.abs(val)}%</span>;
        return <span className="rate-cell text-flat"><FaMinus style={{ fontSize: '10px' }} /> 0.00%</span>;
    };
    const handleRowClick = (item) => navigate(`/stock/${item.market}/${item.code}`, { state: { code: item.code, name: item.name } });

    if (!user) return <LoginRequired />;

    return (
        <div className="home-container">
            <div className="home-intro" style={{ marginTop: '20px' }}>
                <h3 className="intro-title"><FaHeart style={{ color: '#ff4d4d', marginRight: '8px' }} />나의 관심 종목</h3>
            </div>

            {/* [수정] 그룹 관리 바 (새 디자인 적용) */}
            <div className="favorite-group-bar">
                <div className="group-list">
                    {groups.map(g => (
                        <button 
                            key={g.group_id} 
                            className={`group-pill ${selectedGroupId === g.group_id ? 'active' : ''}`}
                            onClick={() => setSelectedGroupId(g.group_id)}
                        >
                            {selectedGroupId === g.group_id ? <FaFolderOpen /> : <FaFolder />}
                            {g.name}
                        </button>
                    ))}
                    {/* 그룹 추가 버튼 */}
                    <button 
                        className="group-icon-btn add" 
                        onClick={() => setIsCreateGroupModalOpen(true)} 
                        title="새 그룹 추가"
                    >
                        <FaPlus />
                    </button>
                </div>

                {/* 그룹 삭제 버튼 (그룹이 2개 이상이거나, 현재 그룹이 기본 그룹이 아닐 때 등 조건부 렌더링 가능) */}
                {selectedGroupId && groups.length > 0 && (
                    <>
                        <div className="group-divider"></div>
                        <button 
                            className="group-icon-btn delete" 
                            onClick={handleDeleteGroup} 
                            title="현재 그룹 삭제"
                        >
                            <FaTrash />
                        </button>
                    </>
                )}
            </div>

            {/* 테이블 (기존 유지) */}
            <div className="table-container">
                <table className="ranking-table">
                    <thead>
                        <tr>
                            <th>No.</th><th>종목 정보</th><th>현재가</th><th>등락률</th><th>거래량</th><th>거래대금</th><th>삭제</th><th>AI</th>
                        </tr>
                    </thead>
                    <tbody>
                        {stocks.length > 0 ? stocks.map((item, idx) => (
                            <motion.tr layout transition={{ duration: 0.3 }} key={`${item.market}-${item.code}`} onClick={() => handleRowClick(item)}>
                                <td className="col-rank">{idx + 1}</td>
                                <td className="col-name">
                                    <div className="stock-info">
                                        <div className="stock-meta">
                                            <span className={`market-badge ${item.market === 'domestic' ? 'domestic' : 'overseas'}`}>
                                                {item.market === 'domestic' ? 'KOR' : 'USA'}
                                            </span>
                                            <span className="stock-code">{item.code}</span>
                                        </div>
                                        <span className="stock-name">{item.name}</span>
                                    </div>
                                </td>
                                <td><div className="price-val">{formatPrice(item.price)}</div></td>
                                <td>{renderRate(item.rate)}</td>
                                <td className="price-val">{formatNumber(item.volume)}</td>
                                <td className="price-val">{formatAmount(item.amount)}</td>
                                <td style={{ textAlign: 'center' }}>
                                    <button className="favorite-btn" onClick={(e) => handleRemoveStock(e, item)}><FaHeart className="heart-icon filled" /></button>
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                    <button className="ai-btn" onClick={(e) => { e.stopPropagation(); handleAiPredict(item); }}><FaRobot /></button>
                                </td>
                            </motion.tr>
                        )) : (
                            <tr>
                                <td colSpan="8">
                                    <div className="empty-state" style={{ padding: '60px 0', textAlign: 'center' }}>
                                        <p style={{ marginBottom: '16px', fontSize: '16px', color: 'var(--color-text-muted)' }}>이 그룹에 관심종목이 없습니다.</p>
                                        <button className="banner-btn" style={{ padding: '10px 20px', fontSize: '14px', borderRadius: '20px' }} onClick={() => navigate('/')}>
                                            <FaPlus style={{ marginRight: '6px' }} />관심종목 추가하러 가기
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* AI 모달 */}
            {isModalOpen && (
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
            )}

            {/* [추가] 그룹 생성 모달 */}
            {isCreateGroupModalOpen && (
                <div className="ai-modal-overlay" onClick={() => setIsCreateGroupModalOpen(false)}>
                    <div className="ai-modal-content group-select-modal" onClick={(e) => e.stopPropagation()}>
                        <button className="ai-close-btn" onClick={() => setIsCreateGroupModalOpen(false)}><FaTimes /></button>
                        <h3 className="modal-title">새 그룹 만들기</h3>
                        <p className="modal-desc">새로운 관심 그룹의 이름을 입력하세요.</p>
                        <input 
                            type="text" 
                            className="modal-input" 
                            placeholder="예: 반도체, 2차전지" 
                            value={newGroupName}
                            onChange={(e) => setNewGroupName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleCreateGroup()}
                            autoFocus
                        />
                        <div className="modal-btn-group">
                            <button className="modal-confirm-btn" onClick={handleCreateGroup}>생성하기</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default MyFavorite;