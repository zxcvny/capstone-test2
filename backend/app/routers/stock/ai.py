from fastapi import APIRouter, HTTPException
# 방금 만든 인스턴스들을 가져옵니다
from ai.prediction import domestic_predictor, overseas_predictor 

# [수정] prefix를 추가하여 URL을 "/stocks/ai"로 시작하게 설정
router = APIRouter(
    prefix="/stocks/ai",
    tags=["Stock AI"]
)

@router.get("/predict")
async def predict_stock(market: str, code: str):
    """
    특정 종목의 AI 예측 결과를 반환
    (최종 URL: /stocks/ai/predict)
    """
    result = None

    if market == "KR":
        # domestic 예측기 사용
        result = await domestic_predictor.predict_next_day(code)
        
    elif market == "NAS":
        # overseas 예측기 사용
        result = await overseas_predictor.predict_next_day(code)
        
    else:
        raise HTTPException(status_code=400, detail="지원하지 않는 마켓입니다 (KR/NAS)")

    # 결과에 에러 메시지가 포함된 경우
    if result and "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])

    return result
