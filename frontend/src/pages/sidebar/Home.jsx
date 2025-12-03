import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaCaretUp, FaCaretDown, FaMinus } from "react-icons/fa";
import axios from '../../lib/axios';
import { useAuth } from '../../context/AuthContext';
import '../../styles/Home.css';

function Home() {
    const { user } = useAuth();
    const navigate = useNavigate();

    // 필터 상태
    const [marketType, setMarketType] = useState('all'); 
    const [rankType, setRankType] = useState('volume');  
    
    // 데이터 상태
    const [results, setResults] = useState([]);
    const [isLoading, setIsLoading] = useState(false);

    const ws = useRef(null);

    // 숫자 포맷팅 (콤마)
    const formatNumber = (num) => {
        if (num === null || num === undefined) return '-';
        return Number(num).toLocaleString();
    };

    // 금액 포맷팅 (조/억 단위)
    const formatAmount = (num) => {
        if (!num) return '-';
        const val = Number(num);
        if (val >= 1000000000000) return `${(val / 1000000000000).toFixed(2)}조`;
        if (val >= 100000000) return `${(val / 100000000).toFixed(0)}억`;
        return val.toLocaleString();
    };

    // 등락률 렌더링 헬퍼
    const renderRate = (rate) => {
        const val = Number(rate);
        if (val > 0) {
            return (
                <span className="rate-cell text-up">
                    <FaCaretUp /> {val}%
                </span>
            );
        } else if (val < 0) {
            return (
                <span className="rate-cell text-down">
                    <FaCaretDown /> {Math.abs(val)}%
                </span>
            );
        } else {
            return (
                <span className="rate-cell text-flat">
                    <FaMinus style={{ fontSize: '10px' }} /> 0.00%
                </span>
            );
        }
    };

    // 데이터 조회
    const fetchRankings = async () => {
        setIsLoading(true);
        // 기존 웹소켓 연결이 있다면 끊기 (탭 변경 시 구독 목록이 바뀌므로)
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
            
            // 데이터 로드 성공 후 웹소켓 연결 시작
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
        // 백엔드 웹소켓 엔드포인트 (realtime.py 참고)
        ws.current = new WebSocket('ws://localhost:8000/stocks/ws/realtime');

        ws.current.onopen = () => {
            console.log("WS Connected");
            
            // 백엔드 ws_realtime 함수가 초기 메시지(items)를 받아 구독 처리함
            const initMsg = {
                items: targetList.map(item => ({
                    code: item.code, 
                    market: item.market
                }))
            };
            ws.current.send(JSON.stringify(initMsg));
        };

        ws.current.onmessage = (event) => {
            const message = JSON.parse(event.data);
            
            // 실시간 데이터 수신 시 리스트 업데이트
            if (message.type === 'realtime') {
                const realTimeData = message.data; // KIS 실시간 데이터 포맷 확인 필요
                
                setResults(prevResults => {
                    return prevResults.map(item => {
                        // 국내/해외 코드 일치 여부 확인 (실제 데이터 키값 확인 필요)
                        const isMatch = (item.market === 'domestic' && item.code === realTimeData.mksc_shrn_iscd) ||
                                      (item.market === 'overseas' && item.symb === realTimeData.rsym);
                        
                        if (isMatch) {
                            // 가격과 등락률 업데이트
                            return {
                                ...item,
                                price: realTimeData.stck_prpr || realTimeData.last, // API 응답 키에 맞춰 수정
                                rate: realTimeData.prdy_ctrt || realTimeData.rate
                            };
                        }
                        return item;
                    });
                });
            }
        };

        ws.current.onclose = () => {
            console.log("WS Disconnected");
        };
    };

    useEffect(() => {
        return () => {
            if (ws.current) ws.current.close();
        };
    }, []);

    // 필터 변경 시 자동 조회
    useEffect(() => {
        fetchRankings();
    }, [marketType, rankType]);

    return (
        <div className="home-container">
            {/* 1. 비로그인 사용자 대상 배너 */}
            {!user && (
                <div className="guest-banner">
                    <div className="banner-content">
                        <h2><span>Zero to Mars</span>와 함께<br/>더 넓은 우주로 나아가세요 🚀</h2>
                        <p>실시간 시세부터 나만의 포트폴리오 관리까지,<br/>성공적인 투자의 첫 걸음을 지금 시작하세요.</p>
                    </div>
                    <button className="banner-btn" onClick={() => navigate('/login')}>
                        지금 시작하기
                    </button>
                </div>
            )}

            {/* 2. 필터 섹션 */}
            <div className="filter-section">
                {/* 시장 분류 탭 (위로 이동) */}
                <div className="market-tabs">
                    <button 
                        className={`market-btn ${marketType === 'all' ? 'active' : ''}`}
                        onClick={() => setMarketType('all')}
                    >
                        전체
                    </button>
                    <button 
                        className={`market-btn ${marketType === 'domestic' ? 'active' : ''}`}
                        onClick={() => setMarketType('domestic')}
                    >
                        국내
                    </button>
                    <button 
                        className={`market-btn ${marketType === 'overseas' ? 'active' : ''}`}
                        onClick={() => setMarketType('overseas')}
                    >
                        해외
                    </button>
                </div>

                {/* 랭킹 기준 탭 (아래로 이동) */}
                <div className="rank-tabs">
                    {[
                        { id: 'volume', label: '거래량 상위' },
                        { id: 'amount', label: '거래대금 상위' },
                        { id: 'market-cap', label: '시가총액 상위' },
                        { id: 'rising', label: '🔥 급상승' },
                        { id: 'falling', label: '💧 급하락' }
                    ].map(tab => (
                        <button 
                            key={tab.id}
                            className={`rank-btn ${rankType === tab.id ? 'active' : ''}`}
                            onClick={() => setRankType(tab.id)}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* 3. 데이터 테이블 */}
            <div className="table-container">
                <table className="ranking-table">
                    <thead>
                        <tr>
                            <th width="60">순위</th>
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
                                <tr key={`${item.market}-${item.code}`}>
                                    <td className="col-rank">{idx + 1}</td>
                                    <td className="col-name">
                                        <div className="stock-info">
                                            <div className="stock-meta">
                                                <span className={`market-badge ${item.market}`}>
                                                    {item.market === 'domestic' ? 'KOR' : 'USA'}
                                                </span>
                                                {/* 해외일 경우 symb, 국내일 경우 code 표시 */}
                                                <span className="stock-code">
                                                    {item.market === 'overseas' ? item.symb : item.code}
                                                </span>
                                            </div>
                                            <span className="stock-name">{item.name}</span>
                                        </div>
                                    </td>
                                    <td>
                                        <div className="price-val">{formatNumber(item.price)}</div>
                                    </td>
                                    <td>
                                        {renderRate(item.rate)}
                                    </td>
                                    <td className="price-val">{formatNumber(item.volume)}</td>
                                    <td className="price-val">{formatAmount(item.amount)}</td>
                                </tr>
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