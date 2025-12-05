// src/components/modals/TradeModal.jsx

import React, { useState, useEffect } from 'react';
import axios from '../../lib/axios';
import '../../styles/TradeModal.css'; // 스타일 파일 (아래 2번에서 생성)

const TradeModal = ({ isOpen, onClose, type, stockInfo, account }) => {
  if (!isOpen || !stockInfo) return null;

  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(false);

  // 가격 정보 (쉼표 제거 후 숫자로 변환)
  const currentPrice = parseInt(stockInfo.price.replace(/,/g, ''));
  const totalAmount = currentPrice * quantity;
  
  // 매수 가능 수량 계산 (잔고 / 현재가)
  const maxBuyQuantity = account ? Math.floor(account.balance / currentPrice) : 0;

  useEffect(() => {
    setQuantity(1); // 모달 열릴 때 수량 초기화
  }, [isOpen, type]);

  const handleTrade = async () => {
    if (quantity <= 0) {
      alert("수량은 1주 이상이어야 합니다.");
      return;
    }
    if (type === 'BUY' && totalAmount > account?.balance) {
      alert("예수금이 부족합니다.");
      return;
    }

    try {
      setLoading(true);
      const endpoint = type === 'BUY' ? '/invest/virtual/buy' : '/invest/virtual/sell';
      
      // API 호출
      await axios.post(endpoint, {
        stock_code: stockInfo.code,
        market_type: stockInfo.market_type || "domestic", // 상세페이지에서 market_type 넘겨줘야 함
        quantity: quantity,
        exchange: stockInfo.exchange // 해외주식일 경우 필요
      });

      alert(`${type === 'BUY' ? '매수' : '매도'}가 체결되었습니다!`);
      onClose(true); // true를 반환하여 부모가 데이터를 갱신하게 함
    } catch (error) {
      console.error("Trade Failed:", error);
      const msg = error.response?.data?.detail || "거래에 실패했습니다.";
      alert(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="trade-modal">
        <div className="modal-header">
          <h3>{type === 'BUY' ? '📈 매수하기' : '📉 매도하기'}</h3>
          <button className="close-btn" onClick={() => onClose(false)}>X</button>
        </div>
        
        <div className="stock-summary">
          <span className="stock-name">{stockInfo.name}</span>
          <span className="stock-price">{stockInfo.price} 원</span>
        </div>

        <div className="trade-info">
          <div className="info-row">
            <span>보유 예수금</span>
            <span>{account?.balance?.toLocaleString()} 원</span>
          </div>
          {type === 'BUY' && (
             <div className="info-row">
               <span>매수 가능 수량</span>
               <span>{maxBuyQuantity} 주</span>
             </div>
          )}
        </div>

        <div className="input-group">
          <label>주문 수량</label>
          <input 
            type="number" 
            min="1" 
            value={quantity} 
            onChange={(e) => setQuantity(parseInt(e.target.value) || 0)}
          />
        </div>

        <div className="total-section">
          <span>총 주문금액</span>
          <span className={`total-price ${type === 'BUY' ? 'red' : 'blue'}`}>
            {totalAmount.toLocaleString()} 원
          </span>
        </div>

        <button 
          className={`confirm-btn ${type === 'BUY' ? 'buy' : 'sell'}`} 
          onClick={handleTrade}
          disabled={loading}
        >
          {loading ? '처리 중...' : (type === 'BUY' ? '매수 확정' : '매도 확정')}
        </button>
      </div>
    </div>
  );
};

export default TradeModal;