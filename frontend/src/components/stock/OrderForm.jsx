// src/components/stock/OrderForm.jsx
import { FaWallet, FaPlus, FaMinus } from "react-icons/fa";
import { formatNumber, formatAmount } from "../../utils/formatters";

function OrderForm({ 
    orderType, setOrderType, orderPrice, setOrderPrice, 
    orderQuantity, setOrderQuantity, account, holdingQty, avgPrice, 
    currentPrice, handleOrder 
}) {
    // 내 보유 현황 계산
    const myTotalInvest = Math.floor(holdingQty * avgPrice);
    const myTotalEval = Math.floor(holdingQty * currentPrice);
    const myProfitAmt = myTotalEval - myTotalInvest;
    const myProfitRate = myTotalInvest > 0 ? ((myTotalEval - myTotalInvest) / myTotalInvest) * 100 : 0;
    
    // 주문 가능 계산
    const availableBuyQty = account ? Math.floor(account.balance / (orderPrice || 1)) : 0; 
    const orderTotalAmount = orderPrice * orderQuantity;

    return (
        <div className="col-orderform">
            {/* 1. 주문 폼 (위로 이동됨) */}
            <div className={`order-form-card ${orderType}`}>
                <div className="order-tabs">
                    <button className={`tab-btn buy ${orderType === 'buy' ? 'active' : ''}`} onClick={() => setOrderType('buy')}>매수</button>
                    <button className={`tab-btn sell ${orderType === 'sell' ? 'active' : ''}`} onClick={() => setOrderType('sell')}>매도</button>
                </div>
                <div className="order-body">
                    <div className="input-row">
                        <label>주문단가</label>
                        <div className="number-input-box">
                            <button onClick={() => setOrderPrice(p => Math.max(0, Number(p) - 100))}><FaMinus /></button>
                            <input type="text" value={formatNumber(orderPrice)} onChange={(e) => setOrderPrice(e.target.value.replace(/,/g, ''))}/>
                            <button onClick={() => setOrderPrice(p => Number(p) + 100)}><FaPlus /></button>
                        </div>
                    </div>
                    <div className="input-row">
                        <label>주문수량</label>
                        <div className="number-input-box">
                            <button onClick={() => setOrderQuantity(q => Math.max(1, Number(q) - 1))}><FaMinus /></button>
                            <input type="number" value={orderQuantity} onChange={(e) => setOrderQuantity(e.target.value)}/>
                            <button onClick={() => setOrderQuantity(q => Number(q) + 1)}><FaPlus /></button>
                        </div>
                    </div>
                    <div className="order-summary">
                        <div className="summary-row"><span>총 주문금액</span><span className="total-price">{formatAmount(orderTotalAmount)}</span></div>
                    </div>
                    <button className={`btn-submit-order ${orderType}`} onClick={handleOrder}>
                        {orderType === 'buy' ? '현금 매수' : '현금 매도'}
                    </button>
                </div>
                <div className="user-balance-info">
                    {orderType === 'buy' ? (
                        <><p>주문가능금액: <strong>{formatNumber(account?.balance || 0)}원</strong></p><p>매수가능수량: <strong>{formatNumber(availableBuyQty)}주</strong></p></>
                    ) : (
                        <><p>매도가능수량: <strong>{formatNumber(holdingQty)}주</strong></p><p>예상매도금액: <strong>{formatAmount(orderTotalAmount)}</strong></p></>
                    )}
                </div>
            </div>

            {/* 2. 내 보유 현황 (아래로 이동됨) */}
            <div className="my-position-card">
                <div className="card-header-sm">
                    <span className="card-title"><FaWallet /> 내 보유 현황</span>
                </div>
                {holdingQty > 0 ? (
                    <div className="my-pos-body">
                        <div className="pos-row"><span>평단가</span><span className="val">{formatNumber(Math.floor(avgPrice))}원</span></div>
                        <div className="pos-row"><span>보유수량</span><span className="val">{formatNumber(holdingQty)}주</span></div>
                        <div className="pos-row"><span>투자원금</span><span className="val">{formatNumber(myTotalInvest)}원</span></div>
                        <div className="pos-divider"></div>
                        <div className="pos-row highlight"><span>평가금액</span><span className="val">{formatNumber(myTotalEval)}원</span></div>
                        <div className="pos-row">
                            <span>평가손익</span>
                            <span className={`val ${myProfitAmt >= 0 ? 'up' : 'down'}`}>{formatNumber(myProfitAmt)}원</span>
                        </div>
                        <div className="pos-row large">
                            <span>수익률</span>
                            <span className={`val ${myProfitRate >= 0 ? 'up' : 'down'}`}>{myProfitRate.toFixed(2)}%</span>
                        </div>
                    </div>
                ) : (
                    // 보유하지 않은 경우 안내 메시지
                    <div className="empty-pos-message">
                        보유하고 있는 종목이 아닙니다.
                    </div>
                )}
            </div>
        </div>
    );
}

export default OrderForm;