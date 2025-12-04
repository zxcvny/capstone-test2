// src/pages/sidebar/Home.jsx
import { useEffect, useState, useRef, useLayoutEffect } from 'react'; // useLayoutEffect 추가
import { useNavigate } from 'react-router-dom';
import { FaCaretUp, FaCaretDown, FaMinus, FaChartLine } from "react-icons/fa";
import { motion } from "framer-motion";
import axios from '../../lib/axios';
import { useAuth } from '../../context/AuthContext';
import '../../styles/Home.css';

function Home() {
    const { user } = useAuth();
    const navigate = useNavigate();

    // 1. 필터 상태 초기화 (세션 스토리지에서 불러오기)
    // 기존: const [marketType, setMarketType] = useState('all');
    const [marketType, setMarketType] = useState(() => {
        return sessionStorage.getItem('home_marketType') || 'all';
    });

    // 기존: const [rankType, setRankType] = useState('volume');
    const [rankType, setRankType] = useState(() => {
        return sessionStorage.getItem('home_rankType') || 'volume';
    });
    
    // 데이터 상태
    const [results, setResults] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    // 스크롤 복원 여부를 체크하는 flag
    const [isScrollRestored, setIsScrollRestored] = useState(false);

    const ws = useRef(null);

    // 2. 필터 변경 시 세션 스토리지에 저장
    useEffect(() => {
        sessionStorage.setItem('home_marketType', marketType);
    }, [marketType]);

    useEffect(() => {
        sessionStorage.setItem('home_rankType', rankType);
    }, [rankType]);

    // --- (이하 포맷팅 함수들은 기존 코드 유지) ---
    // 숫자 포맷팅
    const formatNumber = (num) => {
        if (num === null || num === undefined) return '-';
        return Number(num).toLocaleString();
    };

    // 금액 포맷팅
    const formatAmount = (num) => {
        if (num === null || num === undefined) return '-';
        const val = Number(num);

        if (val >= 1_000_000_000_000) {
            return `${(val / 1_000_000_000_000).toFixed(2)}조원`;
        }
        if (val >= 100_000_000) {
            return `${(val / 100_000_000).toFixed(0)}억원`;
        }
        return `${Math.floor(val).toLocaleString()}원`;
    };

    // 가격 포맷팅
    const formatPrice = (num) => {
        if (num === null || num === undefined) return '-';
        const value = Math.floor(Number(num));
        return `${value.toLocaleString()}원`;
    };

    // 등락률 렌더링
    const renderRate = (rate) => {
        const val = Number(rate);
        if (val > 0) {
            return <span className="rate-cell text-up"><FaCaretUp /> {val}%</span>;
        } else if (val < 0) {
            return <span className="rate-cell text-down"><FaCaretDown /> {Math.abs(val)}%</span>;
        } else {
            return <span className="rate-cell text-flat"><FaMinus style={{ fontSize: '10px' }} /> 0.00%</span>;
        }
    };

    // --- 3. 스크롤 위치 저장 및 복원 로직 추가 ---
    // 페이지를 떠날 때(Unmount) 스크롤 위치 저장
    useEffect(() => {
        const scrollContainer = document.querySelector('.content-area'); // Layout.css에 정의된 스크롤 영역

        return () => {
            if (scrollContainer) {
                sessionStorage.setItem('home_scrollTop', scrollContainer.scrollTop);
            }
            // 웹소켓 정리
            if (ws.current) {
                ws.current.close();
                ws.current = null;
            }
        };
    }, []);

    // 데이터가 로드된 후 스크롤 위치 복원
    useLayoutEffect(() => {
        // 데이터가 있고, 아직 복원하지 않았다면 실행
        if (results.length > 0 && !isScrollRestored) {
            const savedScroll = sessionStorage.getItem('home_scrollTop');
            const scrollContainer = document.querySelector('.content-area');
            
            if (savedScroll && scrollContainer) {
                scrollContainer.scrollTop = parseInt(savedScroll, 10);
            }
            setIsScrollRestored(true); // 한 번 복원하면 다시 튀지 않도록 설정
        }
    }, [results, isScrollRestored]);


    // 데이터 조회 (초기 로딩)
    const fetchRankings = async () => {
        // 랭킹 타입이 바뀔 때는 스크롤을 최상단으로 올리고 복원 로직 초기화 필요
        // 단, 컴포넌트가 처음 마운트 될 때(저장된 상태로 로드될 때)는 제외해야 함.
        // 여기서는 단순화를 위해 로딩바를 보여주어 깜빡임 방지
        setIsLoading(true);
        
        if (ws.current) {
            ws.current.close();
            ws.current = null;
        }

        try {
            let url = '';
            if (['volume', 'amount', 'market-cap'].includes(rankType)) {
                url = `/stocks/ranking/${marketType}/${rankType}`;
            } else if (rankType === 'rising') {
                url = `/stocks/ranking/${marketType}/fluctuation/rising`;
            } else if (rankType === 'falling') {
                url = `/stocks/ranking/${marketType}/fluctuation/falling`;
            }
            
            const res = await axios.get(url);
            const list = res.data?.output || [];
            
            setResults(Array.isArray(list) ? list : []);
            
            if (list.length > 0) {
                connectWebSocket(list);
            }
        } catch (error) {
            console.error("데이터 로드 실패:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const connectWebSocket = (targetList) => {
        if (ws.current) return;

        ws.current = new WebSocket('ws://localhost:8000/stocks/ws/realtime');

        ws.current.onopen = () => {
            console.log("WS Connected");
            const initMsg = {
                items: targetList.map(item => ({
                    code: item.code, 
                    market: item.market,
                    excd: undefined 
                }))
            };
            ws.current.send(JSON.stringify(initMsg));
        };

        ws.current.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                if (message.type !== 'realtime') return;

                const data = message.data;

                setResults(prevResults => {
                    let needSort = false;

                    const updated = prevResults.map(item => {
                        if (item.code !== data.code) return item;

                        const newPrice  = data.price  !== undefined ? Number(data.price)  : item.price;
                        const newRate   = data.rate   !== undefined ? Number(data.rate)   : item.rate;
                        const newVolume = data.volume !== undefined ? Number(data.volume) : item.volume;
                        const newAmount = data.amount !== undefined ? Number(data.amount) : item.amount;

                        if (
                            (rankType === 'volume' && newVolume !== item.volume) ||
                            (rankType === 'amount' && newAmount !== item.amount) ||
                            ((rankType === 'rising' || rankType === 'falling') && newRate !== item.rate)
                        ) {
                            needSort = true;
                        }

                        return {
                            ...item,
                            price: newPrice,
                            rate: newRate,
                            volume: newVolume,
                            amount: newAmount,
                            value:
                                rankType === 'volume' ? newVolume :
                                rankType === 'amount' ? newAmount :
                                (rankType === 'rising' || rankType === 'falling') ? newRate :
                                item.value
                        };
                    });

                    if (!needSort) return updated;

                    return [...updated].sort((a, b) => {
                        const A = Number(a.value || 0);
                        const B = Number(b.value || 0);
                        return rankType === 'falling' ? A - B : B - A;
                    });
                });

            } catch (e) {
                console.error("WS Message Error:", e);
            }
        };

        ws.current.onclose = () => {
            console.log("WS Disconnected");
            ws.current = null;
        };
    };

    // 4. 필터가 변경될 때 스크롤 복원 상태 초기화 (다른 탭을 누르면 맨 위로 가거나 해야 하므로)
    useEffect(() => {
        // 만약 사용자가 직접 탭을 눌러서 변경한 경우엔 스크롤을 맨 위로 보내고 싶다면:
        // setIsScrollRestored(true); // 이미 로드된 것으로 간주
        // document.querySelector('.content-area').scrollTop = 0;
        
        // 하지만 여기서는 "복원" 로직과 "새로고침" 로직이 섞여 있으므로
        // 컴포넌트 마운트 시 저장된 값과 현재 state가 다르면 fetchRankings가 실행됨.
        fetchRankings();
    }, [marketType, rankType]);

    // WebSocket 정리 (스크롤 저장 useEffect에 통합되었으므로 여기서는 제거해도 되지만 안전을 위해 남겨둠)
    useEffect(() => {
        return () => {
            if (ws.current) {
                ws.current.close();
                ws.current = null;
            }
        };
    }, []);

    const handleRowClick = (item) => {
        const routeId = item.market === 'overseas' ? item.symb : item.code;
        navigate(`/stock/${item.market}/${routeId}`, {
            // state 객체를 통해 URL에 노출되지 않는 추가 정보를 전달
            state: { 
                code: item.code, // 실제 API 호출에 필요한 고유 코드
                symb: item.symb,
                name: item.name
            }
        });
    };

    return (
        <div className="home-container">
            {/* 비로그인 배너 */}
            {!user && (
                <div className="guest-banner">
                    <div className="banner-content">
                        <h2><span>Zero to Mars</span>와 함께<br/>더 넓은 우주로 나아가세요 </h2>
                        <p>실시간 시세부터 나만의 포트폴리오 관리까지,<br/>성공적인 투자의 첫 걸음을 지금 시작하세요.</p>
                    </div>
                    <button className="banner-btn" onClick={() => navigate('/login')}>
                        지금 시작하기
                    </button>
                </div>
            )}

            <div className="home-intro">
                <h3 className="intro-title">
                    <FaChartLine style={{ marginRight: '8px' }} />
                    실시간 증시 랭킹
                </h3>
            </div>

            {/* 필터 섹션 */}
            <div className="filter-section">
                <div className="market-tabs">
                    {['all', 'domestic', 'overseas'].map(type => (
                        <button 
                            key={type}
                            className={`market-btn ${marketType === type ? 'active' : ''}`}
                            onClick={() => {
                                setMarketType(type);
                                sessionStorage.setItem('home_marketType', type); // 즉시 저장
                            }}
                        >
                            {type === 'all' ? '전체' : type === 'domestic' ? '국내' : '해외'}
                        </button>
                    ))}
                </div>

                <div className="rank-tabs">
                    {[
                        { id: 'volume', label: '거래량' },
                        { id: 'amount', label: '거래대금' },
                        { id: 'rising', label: '급상승' },
                        { id: 'falling', label: '급하락' },
                        { id: 'market-cap', label: '시가총액' },
                    ].map(tab => (
                        <button 
                            key={tab.id}
                            className={`rank-btn ${rankType === tab.id ? 'active' : ''}`}
                            onClick={() => {
                                setRankType(tab.id);
                                sessionStorage.setItem('home_rankType', tab.id); // 즉시 저장
                            }}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* 데이터 테이블 */}
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
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading ? (
                            <tr>
                                <td colSpan="6">
                                    <div className="loading-state">
                                        <span className="loading-icon">📡</span>
                                        데이터를 수신 중입니다...
                                    </div>
                                </td>
                            </tr>
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
                                                <span className={`market-badge ${item.market}`}>
                                                    {item.market === 'domestic' ? 'KOR' : 'USA'}
                                                </span>
                                                <span className="stock-code">
                                                    {item.market === 'overseas' ? item.symb : item.code}
                                                </span>
                                            </div>
                                            <span className="stock-name">{item.name}</span>
                                        </div>
                                    </td>
                                    <td><div className="price-val">{formatPrice(item.price)}</div></td>
                                    <td>{renderRate(item.rate)}</td>
                                    <td className="price-val">{formatNumber(item.volume)}</td>
                                    <td className="price-val">{formatAmount(item.amount)}</td>
                                </motion.tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan="6">
                                    <div className="empty-state">표시할 데이터가 없습니다.</div>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export default Home;