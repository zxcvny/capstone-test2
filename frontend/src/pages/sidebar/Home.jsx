// src/pages/sidebar/Home.jsx
import { useEffect, useState, useRef, useLayoutEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaChartLine, FaRobot, FaHeart, FaRegHeart } from "react-icons/fa";
import { motion } from "framer-motion";
import axios from '../../lib/axios';
import { formatNumber, formatAmount, formatPrice, renderRate } from "../../utils/formatters"
import { useAuth } from '../../context/AuthContext';
import { useFavorites } from '../../hooks/useFavorites';
import { useAI } from '../../hooks/useAI';

import AIModal from "../../components/modals/AIModal";
import GroupSelectModal from "../../components/modals/GroupSelectModal";

import "../../styles/Home.css"

function Home() {
    const { user } = useAuth();
    const navigate = useNavigate();

    const { favorites, targetStock, myGroups, isGroupModalOpen, fetchFavorites, toggleFavorite, setIsGroupModalOpen, addToGroup } = useFavorites();
    const { aiLoading, aiResult, isModalOpen, handleAiPredict, closeModal } = useAI();

    // 필터
    const [marketType, setMarketType] = useState(() => sessionStorage.getItem('home_marketType') || 'all');
    const [rankType, setRankType] = useState(() => sessionStorage.getItem('home_rankType') || 'volume');

    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);

    const [isScrollRestored, setIsScrollRestored] = useState(false);

    const ws = useRef(null);

    useEffect(() => { sessionStorage.setItem('home_marketType', marketType); }, [marketType]);
    useEffect(() => { sessionStorage.setItem('home_rankType', rankType); }, [rankType]);
    
    useEffect(() => {
        const scrollContainer = document.querySelector('.content-area');
        return () => {
            if (scrollContainer) sessionStorage.setItem('home_scrollTop', scrollContainer.scrollTop);
            if (ws.current) { ws.current.close(); ws.current = null; }
        };
    }, []);

    // 데이터 로드 후 스크롤 복원
    useLayoutEffect(() => {
        if (results.length > 0 && !isScrollRestored) {
            const savedScroll = sessionStorage.getItem('home_scrollTop');
            const scrollContainer = document.querySelector('.content-area');
            if (savedScroll && scrollContainer) scrollContainer.scrollTop = parseInt(savedScroll, 10);
            setIsScrollRestored(true);
        }
    }, [results, isScrollRestored]);

    // 관심 종목 가져오기
    useEffect(() => {
        fetchFavorites();
    }, []);

     // 데이터 조회
    const fetchRankings = async () => {
        setLoading(true);
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
        finally { setLoading(false); }
    };

    // 웹소켓 연결
    const connectWebSocket = (targetList) => {
        if (ws.current) {
            ws.current.close();
            ws.current = null;
        }
        ws.current = new WebSocket('ws://localhost:8000/stocks/ws/realtime');
        ws.current.onopen = () => {
            const initMsg = { items: targetList.map(item => ({ code: item.code, market: item.market, excd: item.excd || (item.market === 'overseas' ? 'NAS' : '')})) };
            ws.current.send(JSON.stringify(initMsg));
        };
        ws.current.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                if (message.type !== 'realtime') return;
                const data = message.data;
                if (data.type && data.type !== 'tick') return;
                
                setResults(prev => {
                    let needSort = false;
                    const updated = prev.map(item => {
                        const itemKey = item.market === 'overseas' ? item.symb : item.code;
                        if (itemKey !== data.code) return item;
                        
                        const newPrice = data.price !== undefined ? Number(data.price) : item.price;
                        const newRate = data.rate !== undefined ? Number(data.rate) : item.rate;
                        const newVolume = data.volume !== undefined ? Number(data.volume) : item.volume;
                        const newAmount = data.amount !== undefined ? Number(data.amount) : item.amount;

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

                    if (!needSort) return updated;
                    return [...updated].sort((a, b) => rankType === 'falling' ? Number(a.value) - Number(b.value) : Number(b.value) - Number(a.value));
                });
            } catch (e) { console.error("WS Message Error:", e); }
        };
    };

    useEffect(() => { fetchRankings(); }, [marketType, rankType]);

    const handleRowClick = (item) => {
        // [추가] 이동 전 스크롤 위치 수동 저장 (안전장치)
        const scrollContainer = document.querySelector('.content-area');
        if (scrollContainer) {
            sessionStorage.setItem('home_scrollTop', scrollContainer.scrollTop);
        }

        const routeId = item.market === 'overseas' ? item.symb : item.code;
        navigate(`/stock/${item.market}/${routeId}`, { state: { code: item.code, symb: item.symb, name: item.name, price: item.price, rate: item.rate } });
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
                        {loading ? (
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
                                                <span className={`home-market-badge ${item.market}`}>{item.market === 'domestic' ? '국내' : '해외'}</span>
                                                <span className="home-stock-code">{item.market === 'overseas' ? item.symb : item.code}</span>
                                            </div>
                                            <span className="home-stock-name">{item.name}</span>
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
                                            {favorites.has(item.market === 'overseas' ? item.symb : item.code) ? (
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
            <AIModal isOpen={isModalOpen} closeModal={closeModal} aiLoading={aiLoading} aiResult={aiResult} />
            <GroupSelectModal isOpen={isGroupModalOpen} setIsGroupModalOpen={() => setIsGroupModalOpen(false)} targetStock={targetStock} myGroups={myGroups} addToGroup={(groupId) => addToGroup(groupId, targetStock)} />
        </div>
    )
}

export default Home