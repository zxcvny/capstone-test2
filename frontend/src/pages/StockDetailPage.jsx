import { useParams, useLocation } from "react-router-dom"

function StockDetailPage() {
    const { market, stockId } = useParams();
    const location = useLocation();

    const realCode = location.state?.code || stockId;
    const stockName = location.state?.name || '';

    return (
        <div className="detail-container">
            <p><strong>마켓:</strong> {market === 'domestic' ? '국내 (KOR)' : '해외 (USA)'}</p>
                
                {/* 주소창에 보이는 값 */}
                <p><strong>URL 식별자:</strong> {stockId}</p>
                
                {/* 내부 로직용 실제 코드 */}
                <p><strong>실제 종목코드(Code):</strong> {realCode}</p>
        </div>
    )
}

export default StockDetailPage