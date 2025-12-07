// src/components/stock/OrderForm.jsx
import { FaWallet, FaPlus, FaMinus } from "react-icons/fa";
import { useNavigate } from "react-router-dom"; // 페이지 이동을 위한 훅
import { formatNumber, formatAmount } from "../../utils/formatters";
import { useAuth } from "../../context/AuthContext"; // 로그인 상태 확인을 위한 훅

function OrderForm({ 
    orderType, setOrderType, orderPrice, setOrderPrice, 
    orderQuantity, setOrderQuantity, account, holdingQty, avgPrice, 
    currentPrice, handleOrder 
}) {
    const { user } = useAuth(); // 사용자 정보 가져오기
    const navigate = useNavigate(); // 페이지 이동 함수

    // 내 보유 현황 계산
    const myTotalInvest = Math.floor(holdingQty * avgPrice);
    const myTotalEval = Math.floor(holdingQty * currentPrice);
    const myProfitAmt = myTotalEval - myTotalInvest;
    const myProfitRate = myTotalInvest > 0 ? ((myTotalEval - myTotalInvest) / myTotalInvest) * 100 : 0;
    
    // 주문 가능 계산
    const availableBuyQty = account ? Math.floor(account.balance / (orderPrice || 1)) : 0; 
    const orderTotalAmount = orderPrice * orderQuantity;

    // [추가] 버튼 텍스트 결정 함수
    const getButtonText = () => {
        if (!user) return "로그인이 필요합니다";
        if (!account) return "계좌 만들러가기";
        return orderType === 'buy' ? '현금 매수' : '현금 매도';
    };

    // [추가] 버튼 클릭 핸들러
    const handleButtonClick = () => {
        if (!user) {
            if (window.confirm("로그인이 필요한 서비스입니다. 로그인 페이지로 이동하시겠습니까?")) {
                navigate('/login');
            }
            return;
        }
        if (!account) {
            if (window.confirm("매매를 하려면 모의투자 계좌가 필요합니다. 계좌 개설 페이지로 이동하시겠습니까?")) {
                navigate('/myinvestlist');
            }
            return;
        }
        // 정상적인 경우 주문 처리
        handleOrder();
    };

    return (
        <div className="col-orderform">
            {/* 1. 주문 폼 */}
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
                    
                    {/* [수정] 조건부 텍스트 및 핸들러 적용 */}
                    <button className={`btn-submit-order ${orderType}`} onClick={handleButtonClick}>
                        {getButtonText()}
                    </button>
                </div>
                
                {/* 하단 잔고 정보 (로그인 및 계좌가 있을 때만 표시) */}
                {account && (
                    <div className="user-balance-info">
                        {orderType === 'buy' ? (
                            <><p>주문가능금액: <strong>{formatNumber(account.balance)}원</strong></p><p>매수가능수량: <strong>{formatNumber(availableBuyQty)}주</strong></p></>
                        ) : (
                            <><p>매도가능수량: <strong>{formatNumber(holdingQty)}주</strong></p><p>예상매도금액: <strong>{formatAmount(orderTotalAmount)}</strong></p></>
                        )}
                    </div>
                )}
            </div>

            {/* 2. 내 보유 현황 */}
            <div className="my-position-card">
                <div className="card-header-sm">
                    <span className="card-title"><FaWallet /> 내 보유 현황</span>
                </div>
                {/* 로그인 안했거나 계좌가 없으면 안내 메시지 */}
                {!user || !account ? (
                     <div className="empty-pos-message">
                        {user ? "계좌 개설 후 이용해주세요." : "로그인이 필요합니다."}
                     </div>
                ) : holdingQty > 0 ? (
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
                    <div className="empty-pos-message">
                        보유하고 있는 종목이 아닙니다.
                    </div>
                )}
            </div>
        </div>
    );
}

export default OrderForm;