import { useEffect, useRef, useState } from "react";
import { useNavigate } from 'react-router-dom';

import AccountCreateModal from '../../components/modals/AccountCreateModal';
import axios from "../../lib/axios";
import { formatNumber, formatAmount } from "../../utils/formatters";
import logoMini from "../../assets/logo-mini.PNG";
import '../../styles/MyInvestList.css';

function MyInvestList() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);

    const [account, setAccount] = useState(null); // 계좌 정보
    const [hasAccount, setHasAccount] = useState(false); // 계좌 유무
    const [portfolio, setPortfolio] = useState([]); // 포트폴리오

    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false); // 계좌 생성 모달 상태
    const [realtimePortfolio, setRealtimePortfolio] = useState([]); // 포트폴리오 실시간 관리

    const ws = useRef(null);

    // 초기 로딩
    useEffect(() => {
        fetchMyAccount(); // 계좌 정보 먼저 확인
        return () => {
            if (ws.current) ws.current.close();
        }
    }, []);

    // 포트폴리오 변경 시 웹소켓 연결
    useEffect(() => {
        if (portfolio.length > 0) {
            connectWebSocket();
        } else {
            setRealtimePortfolio([]);
        }
    }, [portfolio]);

    // 계좌 및 포트폴리오 조회
    const fetchMyAccount = async () => {
        try {
            setLoading(true);
            const response = await axios.get('/invest/virtual/account');
            setAccount(response.data);
            setHasAccount(true);
            await fetchPortfolio(); // 계좌가 있으면 포트폴리오 조회
        } catch (error) {
            // 계좌가 없는 경우
            if (error.response && error.response.status === 404) {
                setHasAccount(false);
            } else {
                console.log("계좌 조회 오류:", error);
            }
        } finally {
            setLoading(false);
        }
    };

    const fetchPortfolio = async () => {
        try {
            const response = await axios.get('/invest/virtual/portfolio');
            setPortfolio(response.data);
            setRealtimePortfolio(response.data);
        } catch (error) {
            console.log("포트폴리오 조회 실패:", error);
        }
    };

    // 실시간 웹소켓 로직
    const connectWebSocket = () => {
        if (ws.current) ws.current.close();
        ws.current = new WebSocket('ws://localhost:8000/stocks/ws/realtime');
        
        ws.current.onopen = () => {
            const items = portfolio.map(item => ({
                code: item.stock_code,
                market: item.market_type,
                type: "tick",
                excd: item.market_type === 'overseas' ? 'NAS' : '' // 해외주식 거래소 코드 처리 필요시
            }));
            if(items.length > 0) {
                ws.current.send(JSON.stringify({ items }));
            }
        };

        ws.current.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.type === 'realtime' && msg.data.type === 'tick') {
                    updatePortfolioPrice(msg.data);
                }
            } catch (error) {
                console.log("WS Parse Error:", error);
            }
        };
    };

    const updatePortfolioPrice = (data) => {
        setRealtimePortfolio(prevList => {
            return prevList.map(item => {
                if (item.stock_code === data.code) {
                    const currentPrice = typeof data.price === 'string' 
                        ? parseFloat(data.price.replace(/,/g, '')) 
                        : data.price;
                        
                    const valuation = currentPrice * item.quantity;
                    const invested = item.average_price * item.quantity;
                    const profit = valuation - invested;
                    const rate = invested > 0 ? (profit / invested) * 100 : 0;

                    return {
                        ...item,
                        current_price: currentPrice,
                        profit_loss: profit,
                        profit_rate: rate
                    };
                }
                return item;
            });
        });
    };

    // 3. 계좌 개설 처리 (모달에서 호출)
    const handleProcessCreateAccount = async () => {
        try {
            const res = await axios.post('/invest/virtual/account');
            setIsCreateModalOpen(false); // 모달 닫기
            alert("🚀 계좌가 성공적으로 개설되었습니다!\n1,000만원이 지급되었습니다.");
            
            // 상태 갱신
            setAccount(res.data);
            setHasAccount(true);
            setPortfolio([]);
            setRealtimePortfolio([]);
        } catch (error) {
            console.error(error);
            alert(error.response?.data?.detail || "계좌 생성에 실패했습니다.");
        }
    };

    const handleRowClick = (item) => {
        const market = item.market_type || "domestic"; 
        const routeId = market === 'overseas' ? item.stock_code : item.stock_code; 
        navigate(`/stock/${market}/${routeId}`, { 
            state: { 
                code: item.stock_code, 
                name: item.stock_name 
            } 
        });
    };

    // 로딩 상태
    if (loading) {
        return (
            <div className="loading-container">
                <div className="loading-spinner"></div>
                <p className="loading-text">투자 정보를 불러오는 중입니다...</p>
            </div>
        );
    }

    // 계좌가 없을 때
    if (!hasAccount) {
        return (
            <div className="invest-empty-container">
                <div className="invest-empty-card">
                    <div className="rocket-icon-wrapper">
                        <img src={logoMini} alt="Zero to Mars Rocket" />
                    </div>
                    <h2 className="empty-title">모의투자 계좌 개설</h2>
                    <p className="empty-desc">
                        아직 투자 내역이 없습니다.<br/>
                        지금 바로 계좌를 개설하고<br/>
                        <strong>1,000만원</strong>의 시드머니를 받아보세요!
                    </p>
                    <button 
                        className="btn-start-invest" 
                        onClick={() => setIsCreateModalOpen(true)}
                    >
                        계좌 개설하고 시작하기
                    </button>
                </div>
                
                {/* 약관 동의 및 계좌 개설 모달 */}
                <AccountCreateModal 
                    isOpen={isCreateModalOpen} 
                    onClose={() => setIsCreateModalOpen(false)} 
                    handleCreateAccount={handleProcessCreateAccount} 
                />
            </div>
        );
    }

    const totalStockEval = realtimePortfolio.reduce((sum, item) => sum + ((item.current_price || item.average_price) * item.quantity), 0);
    const totalInvest = realtimePortfolio.reduce((sum, item) => sum + (item.average_price * item.quantity), 0);
    const totalProfit = totalStockEval - totalInvest;
    const totalRate = totalInvest > 0 ? (totalProfit / totalInvest) * 100 : 0;

    return (
        <div className="home-container">
             <div className="home-intro" style={{ marginTop: '20px' }}>
                <h3 className="intro-title">📉 내 투자 현황</h3>
            </div>

            <div className="dashboard-stats-card" style={{ marginBottom: '20px' }}>
                <div className="stats-row basic" style={{ gridTemplateColumns: 'repeat(4, 1fr)'}}>
                    <div className="stat-box">
                        <span className="label">총 평가 손익</span>
                        <span className={`value ${totalProfit >= 0 ? 'text-up' : 'text-down'}`}>
                            {totalProfit > 0 ? '+' : ''}{formatNumber(totalProfit)}원
                        </span>
                    </div>
                    <div className="stat-box">
                        <span className="label">총 수익률</span>
                        <span className={`value ${totalRate >= 0 ? 'text-up' : 'text-down'}`}>
                            {totalRate.toFixed(2)}%
                        </span>
                    </div>
                    <div className="stat-box">
                        <span className="label">총 평가 금액</span>
                        <span className="value">{formatNumber(totalStockEval)}원</span>
                    </div>
                     <div className="stat-box">
                        <span className="label">주문 가능 금액</span>
                        <span className="value">{formatNumber(account?.balance)}원</span>
                    </div>
                </div>
            </div>

            <div className="table-container">
                <table className="ranking-table">
                    <thead>
                        <tr>
                            <th>종목명</th>
                            <th>보유수량</th>
                            <th>평단가</th>
                            <th>현재가</th>
                            <th>평가손익</th>
                            <th>수익률</th>
                            <th>평가금액</th>
                        </tr>
                    </thead>
                    <tbody>
                        {realtimePortfolio.length > 0 ? (
                            realtimePortfolio.map((item) => (
                                <tr key={item.stock_code} onClick={() => handleRowClick(item)} style={{ cursor: 'pointer' }}>
                                    <td className="col-name" style={{ textAlign: 'left' }}>
                                        <div className="stock-info">
                                            <span className={`home-market-badge ${item.market_type === 'overseas' ? 'overseas' : 'domestic'}`}>
                                                {item.market_type === 'overseas' ? '해외' : '국내'}
                                            </span>
                                            <span className="home-stock-name">{item.stock_name}</span>
                                        </div>
                                    </td>
                                    <td>{formatNumber(item.quantity)}주</td>
                                    <td>{formatNumber(Math.floor(item.average_price))}원</td>
                                    <td className="price-val">{formatNumber(item.current_price || item.average_price)}원</td>
                                    <td className={item.profit_loss >= 0 ? 'text-up' : 'text-down'}>
                                        {formatNumber(item.profit_loss)}원
                                    </td>
                                    <td className={item.profit_rate >= 0 ? 'text-up' : 'text-down'}>
                                        {item.profit_rate ? item.profit_rate.toFixed(2) : '0.00'}%
                                    </td>
                                    <td>{formatAmount(item.current_price * item.quantity)}</td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan="7">
                                    <div className="empty-state">
                                        보유 중인 주식이 없습니다.<br/>
                                        관심 종목을 매수해보세요!
                                    </div>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export default MyInvestList;