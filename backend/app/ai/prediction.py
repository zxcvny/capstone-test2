import torch
import torch.nn.functional as F
import pandas as pd
import joblib
import numpy as np
import os
from services.kis.data import kis_data
from ai.models import StockLSTM
from ai.utils import add_indicators

class AiPredictor:
    def __init__(self):
        self.device = 'cuda' if torch.cuda.is_available() else 'cpu'
        self.base_dir = os.path.dirname(os.path.abspath(__file__))
        self.models = {}
        self.scalers = {}
        
        # [중요] 학습 코드와 설정 일치시키기
        self.seq_length = 20    # 60 -> 20 (Fast Mode 설정)
        self.input_size = 7    
        self.hidden_size = 64   # 128 -> 64 (Fast Mode 설정)

    # [중요] 이 함수가 class AiPredictor 안에 들여쓰기 되어 있어야 합니다.
    def load_model(self):
        """서버 시작 시 KR, NAS 모델 로드"""
        markets = ["KR", "NAS"]
        for m in markets:
            m_path = os.path.join(self.base_dir, f"stock_model_{m.lower()}.pth")
            s_path = os.path.join(self.base_dir, f"scaler_{m.lower()}.pkl")
            
            if os.path.exists(m_path) and os.path.exists(s_path):
                try:
                    # [수정] Dropout=0.2 로 맞춤 (학습 코드와 동일해야 함)
                    model = StockLSTM(self.input_size, self.hidden_size, num_layers=2, output_size=3, dropout=0.2).to(self.device)
                    
                    model.load_state_dict(torch.load(m_path, map_location=self.device))
                    model.eval()
                    self.models[m] = model
                    self.scalers[m] = joblib.load(s_path)
                    print(f"🤖 {m} AI 모델 로드 완료 (Hidden: {self.hidden_size})")
                except Exception as e:
                    print(f"⚠️ {m} 모델 로드 에러: {e}")

    async def predict_buy_signal(self, market: str, code: str):
        # 시장 구분 (KR / NAS)
        target_key = "KR" if market == "KR" else "NAS"
        
        if target_key not in self.models:
            self.load_model()
            if target_key not in self.models:
                return {"error": f"{target_key} 모델이 준비되지 않았습니다."}

        model = self.models[target_key]
        scaler = self.scalers[target_key]

        try:
            # 1. 데이터 조회 (일봉 D)
            chart_data = await kis_data.get_stock_chart(market, code, "D")
            
            if not chart_data or len(chart_data) < 100:
                return {"error": "차트 데이터 부족"}

            df = pd.DataFrame(chart_data)
            df = df[['time', 'open', 'high', 'low', 'close', 'volume']].sort_values('time')

            try:
                # 2. 보조지표 계산
                df = add_indicators(df)
            except:
                return {"error": "지표 계산 실패 (데이터 부족)"}
            
            if len(df) < self.seq_length:
                return {"error": "지표 계산 후 데이터 부족"}
            
            # 3. 목표가/손절가 계산 (USD 상태)
            current_price = df['close'].iloc[-1]
            volatility = df['close'].iloc[-20:].std()
            
            target_price = current_price + (volatility * 1.5)
            stop_loss = current_price - volatility

            # 4. 최근 데이터 추출 및 전처리
            features = ['Change', 'RSI', 'Disparity_5', 'Disparity_20', 'Vol_Ratio', 'PPO', 'BB_Width']
            recent_data = df.iloc[-self.seq_length:][features].values
            
            # 스케일링 (3차원 입력 준비)
            recent_data_reshaped = recent_data.reshape(-1, len(features))
            scaled_data = scaler.transform(recent_data_reshaped)
            
            x_tensor = torch.tensor(scaled_data, dtype=torch.float32).unsqueeze(0).to(self.device)

            # 5. AI 추론
            with torch.no_grad():
                outputs = model(x_tensor)          # [val_down, val_hold, val_up]
                probs = F.softmax(outputs, dim=1)  # 확률로 변환
                
                prob_down = probs[0][0].item() * 100
                prob_hold = probs[0][1].item() * 100
                prob_up = probs[0][2].item() * 100

            # 6. 결과 해석 (5단계 신호)
            max_prob = max(prob_down, prob_hold, prob_up)
            
            signal = "관망"
            main_prob = prob_hold 

            if prob_up == max_prob:
                main_prob = prob_up
                if prob_up >= 70: signal = "적극 매수"
                elif prob_up >= 50: signal = "매수"
                else: signal = "관망"
            
            elif prob_down == max_prob:
                main_prob = prob_down
                if prob_down >= 70: signal = "적극 매도"
                elif prob_down >= 50: signal = "매도"
                else: signal = "관망"
            
            else:
                main_prob = prob_hold
                signal = "관망"

           # [수정] 최종 반환 전 환율 적용 로직 추가
            final_target_price = target_price
            final_stop_loss = stop_loss

            if market != "KR":
                # 해외 주식이면 환율 적용
                rate = await kis_data.get_exchange_rate()
                final_target_price = target_price * rate
                final_stop_loss = stop_loss * rate

            return {
                "code": code,
                "market": market,
                "probability": f"{main_prob:.2f}%",
                "signal": signal,
                "desc": f"1일 후: 상승 {prob_up:.0f}% / 횡보 {prob_hold:.0f}% / 하락 {prob_down:.0f}%",
                "target_price": int(final_target_price), # 원화 변환된 값 (정수)
                "stop_loss": int(final_stop_loss)        # 원화 변환된 값 (정수)
            }
            
        except Exception as e:
            return {"error": str(e)}
        
        

ai_predictor = AiPredictor()