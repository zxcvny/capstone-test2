import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaHeart, FaPlus, FaTrash, FaRobot, FaTimes, FaCaretUp, FaCaretDown, FaMinus, FaFolder, FaFolderOpen } from "react-icons/fa";
import { motion } from "framer-motion";
import axios from '../../lib/axios';
import LoginRequired from '../../components/LoginRequired';

import AIModal from "../../components/modals/AIModal";

import { formatNumber, formatAmount, formatPrice, renderRate } from "../../utils/formatters"
import { useAuth } from '../../context/AuthContext';
import { useAI } from '../../hooks/useAI';

import '../../styles/Home.css';
import GroupCreateModal from '../../components/modals/GroupCreateModal';


function MyFavorite() {
    const { user } = useAuth();
    const navigate = useNavigate();

    const { aiLoading, aiResult, isModalOpen, handleAiPredict, closeModal } = useAI();

    const [groups, setGroups] = useState([]);
    const [selectedGroupId, setSelectedGroupId] = useState(null);
    const [stocks, setStocks] = useState([]);
    
    // [수정 1] 초기 로딩 상태를 false로 변경 (데이터가 없으면 로딩 없이 빈 화면 표시)
    const [isLoading, setIsLoading] = useState(false);
    const ws = useRef(null);

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
            // [수정 2] 무조건 로딩을 켜지 않고, 일단 데이터 목록부터 확인
            try {
                const res = await axios.get('/users/me/favorites/stocks', {
                    params: { group_id: selectedGroupId }
                });
                const dbList = res.data;

                // [수정 3] 목록이 없으면 로딩 없이 빈 배열 설정 후 종료
                if (!dbList || dbList.length === 0) {
                    setStocks([]);
                    setIsLoading(false); // 혹시 모르니 꺼둠
                    return;
                }

                // [수정 4] 데이터가 있을 때만 여기서부터 로딩 시작 (상세 정보 조회 시간 동안 표시)
                setIsLoading(true);

                const detailPromises = dbList.map(async (item) => {
                    try {
                        const detailRes = await axios.get('/stocks/detail', {
                            params: {
                                market: item.market,
                                code: item.code,
                                exchange: item.market === 'overseas' ? 'NAS' : ''
                            }
                        });
                        return { ...item, ...detailRes.data };
                    } catch (error) {
                        console.error(`Failed to fetch detail for ${item.code}`, error);
                        return item;
                    }
                })
                
                const initializedData = await Promise.all(detailPromises);
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
        if (ws.current) {
            ws.current.close();
            ws.current = null;
        }
        ws.current = new WebSocket('ws://localhost:8000/stocks/ws/realtime');
        ws.current.onopen = () => {
            ws.current.send(JSON.stringify({
                items: targetList.map(item => ({
                    code: item.code,
                    market: item.market,
                    type: "tick",
                    excd: item.market === 'overseas' ? 'NAS' : ''
                }))
            }));
        };
        ws.current.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.type !== 'realtime') return;
                const d = msg.data;
                if (d.type && d.type !== 'tick') return;
                setStocks(prev => prev.map(item => {
                    if (item.code !== d.code) return item;
                    return { 
                        ...item, 
                        price: d.price ? Number(d.price) : item.price, 
                        rate: d.rate ? Number(d.rate) : item.rate, 
                        volume: d.volume ? Number(d.volume) : item.volume, 
                        amount: d.amount ? Number(d.amount) : item.amount 
                    };
                }));
            } catch (e) { console.error("WS Error:", e) }
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

    const handleRowClick = (item) => {
        const routeId = item.market === 'overseas' ? item.symb : item.code;
        navigate(`/stock/${item.market}/${routeId}`, { state: { code: item.code, symb: item.symb, name: item.name, price: item.price, rate: item.rate } });
    };

    if (!user) return <LoginRequired />;

    return (
        <div className="home-container">
            <div className="home-intro" style={{ marginTop: '20px' }}>
                <h3 className="intro-title"><FaHeart style={{ color: '#ff4d4d', marginRight: '8px' }} />나의 관심 종목</h3>
            </div>

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
                    <button 
                        className="group-icon-btn add" 
                        onClick={() => setIsCreateGroupModalOpen(true)} 
                        title="새 그룹 추가"
                    >
                        <FaPlus />
                    </button>
                </div>

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

            <div className="table-container">
                <table className="ranking-table">
                    <thead>
                        <tr>
                            <th>No.</th><th>종목 정보</th><th>현재가</th><th>등락률</th><th>거래량</th><th>거래대금</th><th>삭제</th><th>AI</th>
                        </tr>
                    </thead>
                    <tbody>
                        {/* [수정 5] isLoading 상태일 때 로딩 UI 표시 */}
                        {isLoading ? (
                            <tr>
                                <td colSpan="8">
                                    <div className="loading-state">
                                        <span className="loading-icon">📡</span>데이터를 불러오는 중입니다...
                                    </div>
                                </td>
                            </tr>
                        ) : stocks.length > 0 ? (
                            stocks.map((item, idx) => (
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
                            ))
                        ) : (
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
            <AIModal isOpen={isModalOpen} closeModal={closeModal} aiLoading={aiLoading} aiResult={aiResult} />
            <GroupCreateModal isOpen={isCreateGroupModalOpen} setIsCreateGroupModalOpen={setIsCreateGroupModalOpen} newGroupName={newGroupName} setNewGroupName={setNewGroupName} handleCreateGroup={handleCreateGroup} />
            
        </div>
    );
}

export default MyFavorite;