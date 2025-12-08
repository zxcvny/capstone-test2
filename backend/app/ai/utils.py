import pandas as pd
import numpy as np

def add_indicators(df: pd.DataFrame):
    """
    보조지표 추가 함수
    학습 모델(train_advanced.py)에서 사용하는 모든 지표를 계산합니다.
    """
    df = df.copy()
    
    # 0. 거래량이 0인 구간 처리 (데이터 오염 방지)
    df['volume'] = df['volume'].replace(0, np.nan)
    df = df.dropna()

    # 1. 이동평균선 (MA)
    # 단기(5, 20), 중기(60), 장기(120, 240)
    for window in [5, 20, 60, 120, 240]:
        df[f'MA_{window}'] = df['close'].rolling(window=window).mean()
        # 이격도 (Disparity): 이동평균선 대비 현재 주가 위치
        df[f'Disparity_{window}'] = (df['close'] / df[f'MA_{window}']) * 100

    # 2. RSI (상대강도지수, 14일 기준)
    delta = df['close'].diff()
    gain = (delta.where(delta > 0, 0)).rolling(window=14).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
    rs = gain / loss
    df['RSI'] = 100 - (100 / (1 + rs))
    
    # 3. MACD (Moving Average Convergence Divergence)
    # 12일 지수이동평균 - 26일 지수이동평균
    exp12 = df['close'].ewm(span=12, adjust=False).mean()
    exp26 = df['close'].ewm(span=26, adjust=False).mean()
    df['MACD'] = exp12 - exp26
    # Signal: MACD의 9일 지수이동평균
    df['MACD_Signal'] = df['MACD'].ewm(span=9, adjust=False).mean()
    # Oscillator: MACD - Signal
    df['MACD_Oscillator'] = df['MACD'] - df['MACD_Signal']
    
    # 4. 볼린저 밴드 (Bollinger Bands)
    df['BB_Mid'] = df['close'].rolling(window=20).mean()
    df['BB_Std'] = df['close'].rolling(window=20).std()
    df['BB_Upper'] = df['BB_Mid'] + (df['BB_Std'] * 2)
    df['BB_Lower'] = df['BB_Mid'] - (df['BB_Std'] * 2)
    # 밴드폭 (Band Width): 변동성 지표
    df['BB_Width'] = (df['BB_Upper'] - df['BB_Lower']) / df['BB_Mid']

    # 5. 거래량 변화율
    df['Vol_MA20'] = df['volume'].rolling(window=20).mean()
    df['Vol_Ratio'] = df['volume'] / df['Vol_MA20']
    
    # NaN 데이터 제거 (이동평균 계산 등으로 생긴 빈 값 제거)
    df = df.dropna()
    
    return df

def create_labels(df, look_forward=5):
    """
    5단계 라벨링 로직 (정답지 생성)
    look_forward: 며칠 뒤의 수익률을 예측할 것인가 (기본 5일)
    """
    df = df.copy()
    
    # N일 뒤의 종가와 비교하여 수익률 계산
    # shift(-N)은 N일 뒤의 데이터를 현재 행으로 가져옴
    df['Target_Return'] = df['close'].shift(-look_forward) / df['close'] - 1
    
    # 라벨링 기준 정의
    conditions = [
        (df['Target_Return'] >= 0.05),   # 5% 이상 상승 -> 적극 매수 (0)
        (df['Target_Return'] >= 0.02),   # 2~5% 상승 -> 매수 (1)
        (df['Target_Return'] > -0.02),   # -2~2% 변동 -> 관망 (2)
        (df['Target_Return'] > -0.05),   # -2~-5% 하락 -> 매도 (3)
        (df['Target_Return'] <= -0.05)   # -5% 이하 하락 -> 적극 매도 (4)
    ]
    choices = [0, 1, 2, 3, 4]
    
    # 조건을 적용하여 Label 컬럼 생성 (기본값: 2 관망)
    df['Label'] = np.select(conditions, choices, default=2)
    
    # 미래 데이터가 없는 마지막 행들(NaN) 제거
    df = df.dropna(subset=['Target_Return'])
    
    return df

# import pandas as pd
# import numpy as np
# from sklearn.preprocessing import MinMaxScaler

# def add_indicators(df: pd.DataFrame):
#     df = df.copy()
    
#     # 0. 거래량이 0인 구간 처리
#     df['volume'] = df['volume'].replace(0, np.nan)
#     df = df.dropna()

#     # 1. 이동평균선
#     df['MA5'] = df['close'].rolling(window=5).mean()
#     df['MA20'] = df['close'].rolling(window=20).mean()
#     df['MA60'] = df['close'].rolling(window=60).mean()
    
#     # 2. 이격도 (가격이 이평선 대비 얼마나 떨어져 있는지)
#     df['Disparity_5'] = df['close'] / df['MA5']
#     df['Disparity_20'] = df['close'] / df['MA20']
    
#     # 3. RSI (상대강도지수)
#     delta = df['close'].diff()
#     gain = (delta.where(delta > 0, 0)).rolling(window=14).mean()
#     loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
#     rs = gain / loss
#     df['RSI'] = 100 - (100 / (1 + rs))
#     df['RSI'] = df['RSI'] / 100.0 # 0~1 정규화
    
#     # 4. [신규] PPO (MACD의 비율 버전) - 추세 지표
#     # (12일 지수이동평균 - 26일 지수이동평균) / 26일 지수이동평균
#     ema12 = df['close'].ewm(span=12, adjust=False).mean()
#     ema26 = df['close'].ewm(span=26, adjust=False).mean()
#     df['PPO'] = (ema12 - ema26) / ema26
    
#     # 5. [신규] 볼린저 밴드 폭 (변동성 지표)
#     # (상단밴드 - 하단밴드) / 중단밴드
#     std20 = df['close'].rolling(window=20).std()
#     df['BB_Upper'] = df['MA20'] + (std20 * 2)
#     df['BB_Lower'] = df['MA20'] - (std20 * 2)
#     df['BB_Width'] = (df['BB_Upper'] - df['BB_Lower']) / df['MA20']

#     # 6. 등락률 및 거래량 비율
#     df['Change'] = df['close'].pct_change()
#     df['Vol_MA5'] = df['volume'].rolling(window=5).mean()
#     df['Vol_Ratio'] = df['volume'] / df['Vol_MA5']
    
#     # NaN 제거
#     df.dropna(inplace=True)
    
#     return df

# def create_dataset(data, seq_length):
#     xs, ys = [], []
#     for i in range(len(data) - seq_length):
#         x = data[i:(i + seq_length)]
#         y = data[i + seq_length][-1] 
#         xs.append(x)
#         ys.append(y)
#     return np.array(xs), np.array(ys)