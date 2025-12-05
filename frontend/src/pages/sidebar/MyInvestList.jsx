import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../../lib/axios';
import { formatNumber } from '../../utils/formatters'; 
import '../../styles/MyInvestList.css'; 

const MyInvestList = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState(null); 
  const [portfolio, setPortfolio] = useState([]); 
  const [hasAccount, setHasAccount] = useState(false);

  // 실시간 데이터 관리를 위한 State
  const [realtimePortfolio, setRealtimePortfolio] = useState([]);
  const ws = useRef(null);

  useEffect(() => {
    fetchMyAccount();
    return () => {
      if (ws.current) ws.current.close();
    };
  }, []);

  useEffect(() => {
    if (portfolio.length > 0) {
      connectWebSocket();
    } else {
      setRealtimePortfolio([]);
    }
  }, [portfolio]);

  const fetchMyAccount = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/invest/virtual/account');
      setAccount(res.data);
      setHasAccount(true);
      await fetchPortfolio();
    } catch (error) {
      if (error.response && error.response.status === 404) {
        setHasAccount(false);
      } else {
        console.error("계좌 조회 실패:", error);
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchPortfolio = async () => {
    try {
      const res = await axios.get('/invest/virtual/portfolio');
      setPortfolio(res.data);
      setRealtimePortfolio(res.data);
    } catch (error) {
      console.error("포트폴리오 조회 실패:", error);
    }
  };

  const connectWebSocket = () => {
    if (ws.current) ws.current.close();
    ws.current = new WebSocket('ws://localhost:8000/stocks/ws/realtime');

    ws.current.onopen = () => {
      const items = portfolio.map(item => ({
        code: item.stock_code,
        market: item.market_type || "domestic",
        type: "tick" 
      }));
      ws.current.send(JSON.stringify({ items }));
    };

    ws.current.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'realtime' && msg.data.type === 'tick') {
          updatePortfolioPrice(msg.data);
        }
      } catch (e) {
        console.error("WS Parse Error:", e);
      }
    };
  };

  const updatePortfolioPrice = (data) => {
    setRealtimePortfolio(prevList => {
        return prevList.map(item => {
            if (item.stock_code === data.code) {
                const currentPrice = parseFloat(data.price.replace(/,/g, ''));
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

  const handleStartInvest = async () => {
    if (!window.confirm("모의투자를 시작하시겠습니까?\n가상 계좌가 생성되고 1,000만원이 지급됩니다.")) return;
    try {
      const res = await axios.post('/invest/virtual/account');
      alert(`계좌가 생성되었습니다!\n계좌번호: ${res.data.account_number}`);
      setAccount(res.data);
      setHasAccount(true);
      setPortfolio([]);
    } catch (error) {
      alert(error.response?.data?.detail || "계좌 생성에 실패했습니다.");
    }
  };

  const handleRowClick = (item) => {
     const market = item.market_type || "domestic"; 
     navigate(`/stock/${market}/${item.stock_code}`, { state: { name: item.stock_name } });
  };

  // 총 자산 및 손익 계산
  const totalStockEval = realtimePortfolio.reduce((sum, item) => sum + (item.current_price * item.quantity), 0);
  const totalAsset = (account?.balance || 0) + totalStockEval;
  const totalInvest = realtimePortfolio.reduce((sum, item) => sum + (item.average_price * item.quantity), 0);
  const totalProfit = totalStockEval - totalInvest;
  const totalRate = totalInvest > 0 ? (totalProfit / totalInvest) * 100 : 0;

  if (loading) return <div className="loading-container">로딩 중...</div>;

  if (!hasAccount) {
    return (
      <div className="invest-start-container">
        <div className="invest-intro">
          <h2>📈 모의투자 시작하기</h2>
          <p>아직 모의투자 계좌가 없습니다.</p>
          <p>지금 시작하면 <strong>1,000만원</strong>의 가상 시드머니를 드려요!</p>
          <button className="start-btn" onClick={handleStartInvest}>모의투자 계좌 만들기</button>
        </div>
      </div>
    );
  }

  return (
    <div className="my-invest-container">
      <h2 className="page-title">내 투자 현황</h2>
      
      {/* 종합 자산 현황 카드 */}
      <div className="account-summary-card">
        <div className="summary-row main">
             <div className="summary-item">
                <span className="label">총 자산 (평가)</span>
                <span className="value highlight">{formatNumber(Math.floor(totalAsset))} 원</span>
            </div>
            <div className="summary-item">
                <span className="label">총 평가손익</span>
                <span className={`value ${totalProfit >= 0 ? 'up' : 'down'}`}>
                    {formatNumber(Math.floor(totalProfit))} 원
                    <span className="rate-badge"> ({totalRate.toFixed(2)}%)</span>
                </span>
            </div>
        </div>
        <div className="summary-divider"></div>
        <div className="summary-row sub">
            <div className="summary-item-sm">
                <span className="label">예수금</span>
                <span className="value">{formatNumber(account?.balance)} 원</span>
            </div>
             <div className="summary-item-sm">
                <span className="label">총 매입금액</span>
                <span className="value">{formatNumber(Math.floor(totalInvest))} 원</span>
            </div>
             <div className="summary-item-sm">
                <span className="label">계좌번호</span>
                <span className="value">{account?.account_number}</span>
            </div>
        </div>
      </div>

      <h3 className="section-title">보유 종목 ({portfolio.length})</h3>
      
      {/* 포트폴리오 리스트 */}
      <div className="portfolio-list">
        {realtimePortfolio.length === 0 ? (
          <div className="empty-portfolio">
            <p>보유 중인 주식이 없습니다.</p>
            <p>검색 탭에서 종목을 찾아 매수를 시작해보세요!</p>
          </div>
        ) : (
          <table className="portfolio-table">
            <thead>
              <tr>
                <th style={{width: '20%'}}>종목명</th>
                <th>현재가</th>
                <th>평단가</th>
                <th>변동률</th>
                <th>보유수량</th>
                <th>평가금액</th>
                <th>투자원금</th>
              </tr>
            </thead>
            <tbody>
              {realtimePortfolio.map((item) => {
                // 종목별 계산
                const investAmt = Math.floor(item.average_price * item.quantity); // 투자원금
                const evalAmt = Math.floor(item.current_price * item.quantity);   // 평가금액

                return (
                  <tr key={item.stock_code} onClick={() => handleRowClick(item)} className="clickable-row">
                    {/* 1. 종목명 */}
                    <td>
                      <div className="stock-name">{item.stock_name}</div>
                      <div className="stock-code">{item.stock_code}</div>
                    </td>
                    
                    {/* 2. 현재가 */}
                    <td className={`amt-text ${item.current_price > item.average_price ? 'up' : item.current_price < item.average_price ? 'down' : ''}`}>
                        {formatNumber(item.current_price)}
                    </td>

                    {/* 3. 평단가 (구매금액) */}
                    <td className="amt-text">
                        {formatNumber(Math.floor(item.average_price))}
                    </td>

                    {/* 4. 변동률 (수익률) */}
                    <td className={item.profit_rate >= 0 ? 'up' : 'down'}>
                        {item.profit_rate.toFixed(2)}%
                    </td>

                    {/* 5. 보유수량 */}
                    <td>{formatNumber(item.quantity)}</td>

                    {/* 6. 평가금액 */}
                    <td className="amt-text">
                        {formatNumber(evalAmt)}
                    </td>

                    {/* 7. 투자원금 */}
                    <td className="amt-text" style={{color: '#666'}}>
                        {formatNumber(investAmt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default MyInvestList;