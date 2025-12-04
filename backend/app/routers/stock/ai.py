from fastapi import APIRouter, Query
from ai.prediction import ai_predictor

router = APIRouter(prefix="/stocks/ai", tags=["AI Prediction"])

@router.get("/predict")
async def predict_stock(
    market: str = Query(..., description="KR, NAS, NYS"),
    code: str = Query(..., description="종목코드 (005930, AAPL)")
):
    """
    특정 종목에 대한 AI 매수/매도 시그널 분석 결과 반환
    """
    # 해외주식의 경우 시장 코드(NAS 등) 처리가 필요하다면 여기서 처리
    # prediction.py는 "KR" 또는 "NAS"(해외통칭)로 모델을 로드하므로 매핑 필요
    
    model_market = "KR" if market == "domestic" or market == "KR" else "NAS"
    
    result = await ai_predictor.predict_buy_signal(model_market, code)
    return result