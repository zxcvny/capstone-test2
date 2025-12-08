import sys
import os
import torch
import numpy as np
import pandas as pd
from datetime import datetime, timedelta

# --- 모듈 경로 설정 ---
sys.path.append(os.path.dirname(os.path.abspath(os.path.dirname(__file__))))

from services.kis.data import kis_data
from ai.models import StockLSTM
import asyncio

# --- 설정값 ---
SEQ_LENGTH = 60
INPUT_SIZE = 1
HIDDEN_SIZE = 64
NUM_LAYERS = 2
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

class AiPredictor:
    def __init__(self, target="domestic"):
        self.target = target
        self.file_suffix = "kr" if target == "domestic" else "nas"
        self.model = self._load_model()

    def _load_model(self):
        model = StockLSTM(
            input_size=INPUT_SIZE,
            hidden_size=HIDDEN_SIZE,
            num_layers=NUM_LAYERS,
            output_size=1
        ).to(DEVICE)

        current_dir = os.path.dirname(os.path.abspath(__file__))
        model_path = os.path.join(current_dir, f"stock_model_{self.file_suffix}.pth")

        if not os.path.exists(model_path):
            print(f"⚠️ {self.target} 모델 파일이 없습니다: {model_path}")
            return None

        try:
            model.load_state_dict(torch.load(model_path, map_location=DEVICE))
            model.eval()
            print(f"✅ {self.target.upper()} ({self.file_suffix}) AI 모델 로드 완료!")
            return model
        except Exception as e:
            print(f"❌ 모델 로드 중 에러 발생: {e}")
            return None

    async def predict_next_day(self, code):
        if self.model is None:
            return {"error": f"{self.target} AI 모델이 준비되지 않았습니다."}

        api_market = "KR" if self.target == "domestic" else "NAS"

        end_dt = datetime.now().strftime("%Y%m%d")
        start_dt = (datetime.now() - timedelta(days=150)).strftime("%Y%m%d")

        try:
            data = await kis_data.get_stock_chart(api_market, code, "D", start_dt, end_dt)
            if not data or len(data) < SEQ_LENGTH:
                return {"error": "데이터 부족 (신규 상장주거나 데이터 누락)"}
        except Exception as e:
            return {"error": f"API 호출 실패: {str(e)}"}

        df = pd.DataFrame(data)
        close_prices = pd.to_numeric(df['close'], errors='coerce').values
        
        last_window = close_prices[-SEQ_LENGTH:]
        current_price = last_window[-1]

        min_val = np.min(last_window)
        max_val = np.max(last_window)

        if max_val == min_val:
            return {"error": "가격 변동 없음"}

        normalized_window = (last_window - min_val) / (max_val - min_val)
        input_tensor = torch.tensor(normalized_window, dtype=torch.float32).view(1, SEQ_LENGTH, 1).to(DEVICE)

        with torch.no_grad():
            predicted_norm = self.model(input_tensor).item()

        predicted_price = predicted_norm * (max_val - min_val) + min_val
        expected_return = ((predicted_price - current_price) / current_price) * 100
        
        # --- 추가 정보 생성 ---
        signal = "관망"
        desc_text = "현재 추세가 불확실하여 관망을 추천합니다."
        
        if expected_return > 3.0: 
            signal = "매수"
            desc_text = "상승 추세가 예측됩니다. 매수 기회로 보입니다."
        elif expected_return < -2.0: 
            signal = "매도"
            desc_text = "하락 위험이 있습니다. 매도를 고려하세요."

        # 손절가 (단순 -3% 룰)
        stop_loss = current_price * 0.97
        
        # 확률 (재미요소)
        probability_val = min(abs(expected_return) * 10 + 50, 95)

        # [최종 반환] Numpy 타입을 float/int로 변환해서 리턴
        return {
            "code": code,
            "market": api_market,
            "current_price": int(current_price),
            "predicted_price": int(predicted_price),
            
            # --- [복구된 항목들] ---
            "target_price": int(predicted_price),    # 목표가 (=예측가)
            "stop_loss": int(stop_loss),             # 손절가
            "desc": desc_text,                       # 설명
            "probability": f"{probability_val:.1f}%",# 확률
            # ---------------------

            "expected_return": float(round(expected_return, 2)),
            "signal": signal,
            "min_val_in_window": float(min_val),
            "max_val_in_window": float(max_val)
        }

domestic_predictor = AiPredictor("domestic")
overseas_predictor = AiPredictor("overseas")