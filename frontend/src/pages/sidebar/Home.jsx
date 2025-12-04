import { useEffect, useState, useRef, useLayoutEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaCaretUp, FaCaretDown, FaMinus, FaChartLine, FaRobot, FaTimes, FaHeart, FaRegHeart, FaFolderOpen, FaFolder } from "react-icons/fa";
import { motion } from "framer-motion";
import axios from '../../lib/axios';
import { useAuth } from '../../context/AuthContext';
import '../../styles/Home.css';

function Home() {
    const { user } = useAuth();
    const navigate = useNavigate();

    // 1. 필터 상태
    const [marketType, setMarketType] = useState(() => sessionStorage.getItem('home_marketType') || 'all');
    const [rankType, setRankType] = useState(() => sessionStorage.getItem('home_rankType') || 'volume');
    
    // 데이터 상태
    const [results, setResults] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isScrollRestored, setIsScrollRestored] = useState(false);

    const ws = useRef(null);

    // AI 예측 상태
    const [aiLoading, setAiLoading] = useState(false);
    const [aiResult, setAiResult] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    // 관심종목 상태
    const [favorites, setFavorites] = useState(new Set());

    // 그룹 선택 모달 상태
    const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
    const [myGroups, setMyGroups] = useState([]); 
    const [targetStock, setTargetStock] = useState(null);

    // 2. 필터 저장
    useEffect(() => { sessionStorage.setItem('home_marketType', marketType); }, [marketType]);
    useEffect(() => { sessionStorage.setItem('home_rankType', rankType); }, [rankType]);

    // 관심종목 목록 불러오기
    useEffect(() => {
        const fetchFavorites = async () => {
            if (!user) { setFavorites(new Set()); return; }
            try {
                const res = await axios.get('/users/me/stocks');
                const favSet = new Set(res.data.map(item => item.code)); 
                setFavorites(favSet);
            } catch (error) { console.error(error); }
        };
        fetchFavorites();
    }, [user]);

    // 관심종목 토글 핸들러
    const toggleFavorite = async (e, item) => {
        e.stopPropagation();
        
        if (!user) {
            if(window.confirm("로그인이 필요한 서비스입니다.\n로그인 페이지로 이동하시겠습니까?")) navigate('/login');
            return;
        }

        const isFavorite = favorites.has(item.code);

        if (isFavorite) {
            if (!window.confirm("관심종목에서 삭제하시겠습니까?")) return;
            try {
                await axios.delete('/users/me/favorites/stocks', { params: { code: item.code } });
                setFavorites(prev => { const n = new Set(prev); n.delete(item.code); return n; });
            } catch (e) { console.error(e); }
        } else {
            try {
                const groupRes = await axios.get('/users/me/favorites/groups');
                const groups = groupRes.data;

                if (groups.length <= 1) {
                    await addToGroup(groups[0]?.group_id, item);
                } else {
                    setMyGroups(groups);
                    setTargetStock(item);
                    setIsGroupModalOpen(true);
                }
            } catch (e) { console.error(e); alert("그룹 정보를 불러오지 못했습니다."); }
        }
    };

    const addToGroup = async (groupId, stockItem) => {
        try {
            await axios.post('/users/me/favorites/stocks', {
                group_id: groupId,
                market: stockItem.market === 'domestic' ? 'KR' : 'NAS',
                code: stockItem.code,
                name: stockItem.name
            });
            setFavorites(prev => { const n = new Set(prev); n.add(stockItem.code); return n; });
            setIsGroupModalOpen(false);
        } catch (e) {
            alert(e.response?.data?.detail || "추가 실패");
        }
    };

    // 포맷팅 함수들
    const formatNumber = (num) => (num === null || num === undefined) ? '-' : Number(num).toLocaleString();
    const formatAmount = (num) => {
        if (!num) return '-';
        const val = Number(num);
        if (val >= 1_000_000_000_000) return `${(val / 1_000_000_000_000).toFixed(2)}조원`;
        if (val >= 100_000_000) return `${(val / 100_000_000).toFixed(0)}억원`;
        return `${Math.floor(val).toLocaleString()}원`;
    };
    const formatPrice = (num) => (!num) ? '-' : `${Math.floor(Number(num)).toLocaleString()}원`;

    const renderRate = (rate) => {
        const val = Number(rate);
        if (val > 0) return <span className="rate-cell text-up"><FaCaretUp /> {val}%</span>;
        if (val < 0) return <span className="rate-cell text-down"><FaCaretDown /> {Math.abs(val)}%</span>;
        return <span className="rate-cell text-flat"><FaMinus style={{ fontSize: '10px' }} /> 0.00%</span>;
    };

    // AI 예측 요청
    const handleAiPredict = async (item) => {
        setAiLoading(true); setAiResult(null); setIsModalOpen(true);
        try {
            const mkt = item.market === 'domestic' ? 'KR' : 'NAS';
            const res = await axios.get(`/stocks/ai/predict`, { params: { market: mkt, code: item.code } });
            setAiResult(res.data);
        } catch (error) { setAiResult({ error: "분석에 실패했습니다." }); } 
        finally { setAiLoading(false); }
    };

    const closeModal = () => { setIsModalOpen(false); setAiResult(null); };

    // 스크롤 저장 및 복원
    useEffect(() => {
        const scrollContainer = document.querySelector('.content-area');
        return () => {
            if (scrollContainer) sessionStorage.setItem('home_scrollTop', scrollContainer.scrollTop);
            if (ws.current) { ws.current.close(); ws.current = null; }
        };
    }, []);

    useLayoutEffect(() => {
        if (results.length > 0 && !isScrollRestored) {
            const savedScroll = sessionStorage.getItem('home_scrollTop');
            const scrollContainer = document.querySelector('.content-area');
            if (savedScroll && scrollContainer) scrollContainer.scrollTop = parseInt(savedScroll, 10);
            setIsScrollRestored(true);
        }
    }, [results, isScrollRestored]);

    // 데이터 조회
    const fetchRankings = async () => {
        setIsLoading(true);
        if (ws.current) { ws.current.close(); ws.current = null; }
        try {
            let url = '';
            if (['volume', 'amount', 'market-cap'].includes(rankType)) url = `/stocks/ranking/${marketType}/${rankType}`;
            else if (rankType === 'rising') url = `/stocks/ranking/${marketType}/fluctuation/rising`;
            else if (rankType === 'falling') url = `/stocks/ranking/${marketType}/fluctuation/falling`;
            
            const res = await axios.get(url);
            const list = res.data?.output || [];
            setResults(Array.isArray(list) ? list : []);
            if (list.length > 0) connectWebSocket(list);
        } catch (error) { console.error("데이터 로드 실패:", error); } 
        finally { setIsLoading(false); }
    };

    // [복구 완료] 정렬 로직이 포함된 WebSocket 연결 함수
    const connectWebSocket = (targetList) => {
        if (ws.current) return;
        ws.current = new WebSocket('ws://localhost:8000/stocks/ws/realtime');
        ws.current.onopen = () => {
            const initMsg = { items: targetList.map(item => ({ code: item.code, market: item.market })) };
            ws.current.send(JSON.stringify(initMsg));
        };
        ws.current.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                if (message.type !== 'realtime') return;
                const data = message.data;
                
                setResults(prev => {
                    let needSort = false;
                    const updated = prev.map(item => {
                        if (item.code !== data.code) return item;
                        
                        const newPrice = data.price !== undefined ? Number(data.price) : item.price;
                        const newRate = data.rate !== undefined ? Number(data.rate) : item.rate;
                        const newVolume = data.volume !== undefined ? Number(data.volume) : item.volume;
                        const newAmount = data.amount !== undefined ? Number(data.amount) : item.amount;
                        
                        // 값이 변했는지 확인 (재정렬 필요 여부 판단)
                        if ((rankType === 'volume' && newVolume !== item.volume) ||
                            (rankType === 'amount' && newAmount !== item.amount) ||
                            (['rising', 'falling'].includes(rankType) && newRate !== item.rate)) {
                            needSort = true;
                        }
                        
                        return { 
                            ...item, price: newPrice, rate: newRate, volume: newVolume, amount: newAmount,
                            value: rankType === 'volume' ? newVolume : rankType === 'amount' ? newAmount : ['rising', 'falling'].includes(rankType) ? newRate : item.value
                        };
                    });

                    // [중요] 값이 변했으면 순위 재정렬
                    if (!needSort) return updated;
                    return [...updated].sort((a, b) => rankType === 'falling' ? Number(a.value) - Number(b.value) : Number(b.value) - Number(a.value));
                });
            } catch (e) { console.error("WS Message Error:", e); }
        };
    };

    useEffect(() => { fetchRankings(); }, [marketType, rankType]);

    const handleRowClick = (item) => {
        const routeId = item.market === 'overseas' ? item.symb : item.code;
        navigate(`/stock/${item.market}/${routeId}`, { state: { code: item.code, symb: item.symb, name: item.name } });
    };

    return (
        <div className="home-container">
            {!user && (
                <div className="guest-banner">
                    <div className="banner-content">
                        <h2><span>Zero to Mars</span>와 함께<br/>더 넓은 우주로 나아가세요 </h2>
                        <p>실시간 시세부터 나만의 포트폴리오 관리까지,<br/>성공적인 투자의 첫 걸음을 지금 시작하세요.</p>
                    </div>
                    <button className="banner-btn" onClick={() => navigate('/login')}>지금 시작하기</button>
                </div>
            )}

            <div className="home-intro">
                <h3 className="intro-title"><FaChartLine style={{ marginRight: '8px' }} />실시간 증시 랭킹</h3>
            </div>

            <div className="filter-section">
                <div className="market-tabs">
                    {['all', 'domestic', 'overseas'].map(type => (
                        <button key={type} className={`market-btn ${marketType === type ? 'active' : ''}`}
                            onClick={() => setMarketType(type)}>{type === 'all' ? '전체' : type === 'domestic' ? '국내' : '해외'}</button>
                    ))}
                </div>
                <div className="rank-tabs">
                    {[
                        { id: 'volume', label: '거래량' }, { id: 'amount', label: '거래대금' },
                        { id: 'rising', label: '급상승' }, { id: 'falling', label: '급하락' },
                        { id: 'market-cap', label: '시가총액' },
                    ].map(tab => (
                        <button key={tab.id} className={`rank-btn ${rankType === tab.id ? 'active' : ''}`}
                            onClick={() => setRankType(tab.id)}>{tab.label}</button>
                    ))}
                </div>
            </div>

            <div className="table-container">
                <table className="ranking-table">
                    <thead>
                        <tr>
                            <th>순위</th>
                            <th>종목 정보</th>
                            <th>현재가</th>
                            <th>등락률</th>
                            <th>거래량</th>
                            <th>거래대금</th>
                            <th>관심</th>
                            <th>AI</th>
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading ? (
                            <tr><td colSpan="8"><div className="loading-state"><span className="loading-icon">📡</span>데이터를 수신 중입니다...</div></td></tr>
                        ) : results.length > 0 ? (
                            results.map((item, idx) => (
                                <motion.tr 
                                    layout 
                                    transition={{ duration: 0.3, ease: "easeOut" }} 
                                    key={`${item.market}-${item.code}`}
                                    onClick={() => handleRowClick(item)}
                                >
                                    <td className="col-rank">{idx + 1}</td>
                                    <td className="col-name">
                                        <div className="stock-info">
                                            <div className="stock-meta">
                                                <span className={`market-badge ${item.market}`}>{item.market === 'domestic' ? 'KOR' : 'USA'}</span>
                                                <span className="stock-code">{item.market === 'overseas' ? item.symb : item.code}</span>
                                            </div>
                                            <span className="stock-name">{item.name}</span>
                                        </div>
                                    </td>
                                    <td><div className="price-val">{formatPrice(item.price)}</div></td>
                                    <td>{renderRate(item.rate)}</td>
                                    <td className="price-val">{formatNumber(item.volume)}</td>
                                    <td className="price-val">{formatAmount(item.amount)}</td>
                                    
                                    {/* 관심종목 하트 버튼 */}
                                    <td>
                                        <button 
                                            className="favorite-btn" 
                                            onClick={(e) => toggleFavorite(e, item)}
                                        >
                                            {favorites.has(item.code) ? (
                                                <FaHeart className="heart-icon filled" />
                                            ) : (
                                                <FaRegHeart className="heart-icon empty" />
                                            )}
                                        </button>
                                    </td>

                                    {/* AI 분석 버튼 */}
                                    <td>
                                        <button 
                                            className="ai-btn" 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleAiPredict(item);
                                            }}
                                        >
                                            <FaRobot />
                                        </button>
                                    </td>
                                </motion.tr>
                            ))
                        ) : (
                            <tr><td colSpan="8"><div className="empty-state">표시할 데이터가 없습니다.</div></td></tr>
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

            {/* 그룹 선택 모달 */}
            {isGroupModalOpen && (
                <div className="ai-modal-overlay" onClick={() => setIsGroupModalOpen(false)}>
                    <div className="ai-modal-content group-select-modal" onClick={(e) => e.stopPropagation()}>
                        <button className="ai-close-btn" onClick={() => setIsGroupModalOpen(false)}><FaTimes /></button>
                        
                        <h3 className="modal-title">그룹 선택</h3>
                        <p className="modal-desc">
                            <strong>{targetStock?.name}</strong> 종목을 추가할 그룹을 선택하세요.
                        </p>

                        <div className="group-select-list">
                            {myGroups.map(group => (
                                <div 
                                    key={group.group_id} 
                                    className="group-select-item"
                                    onClick={() => addToGroup(group.group_id, targetStock)}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <FaFolderOpen style={{ color: 'var(--color-primary)' }} />
                                        {group.name}
                                    </div>
                                    <span className="count">선택</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Home;