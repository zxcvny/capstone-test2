import pandas as pd
import numpy as np
from sklearn.preprocessing import MinMaxScaler

def add_indicators(df: pd.DataFrame):
    df = df.copy()
    
    # 0. 거래량이 0인 구간 처리
    df['volume'] = df['volume'].replace(0, np.nan)
    df = df.dropna()

    # 1. 이동평균선
    df['MA5'] = df['close'].rolling(window=5).mean()
    df['MA20'] = df['close'].rolling(window=20).mean()
    df['MA60'] = df['close'].rolling(window=60).mean()
    
    # 2. 이격도 (가격이 이평선 대비 얼마나 떨어져 있는지)
    df['Disparity_5'] = df['close'] / df['MA5']
    df['Disparity_20'] = df['close'] / df['MA20']
    
    # 3. RSI (상대강도지수)
    delta = df['close'].diff()
    gain = (delta.where(delta > 0, 0)).rolling(window=14).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
    rs = gain / loss
    df['RSI'] = 100 - (100 / (1 + rs))
    df['RSI'] = df['RSI'] / 100.0 # 0~1 정규화
    
    # 4. [신규] PPO (MACD의 비율 버전) - 추세 지표
    # (12일 지수이동평균 - 26일 지수이동평균) / 26일 지수이동평균
    ema12 = df['close'].ewm(span=12, adjust=False).mean()
    ema26 = df['close'].ewm(span=26, adjust=False).mean()
    df['PPO'] = (ema12 - ema26) / ema26
    
    # 5. [신규] 볼린저 밴드 폭 (변동성 지표)
    # (상단밴드 - 하단밴드) / 중단밴드
    std20 = df['close'].rolling(window=20).std()
    df['BB_Upper'] = df['MA20'] + (std20 * 2)
    df['BB_Lower'] = df['MA20'] - (std20 * 2)
    df['BB_Width'] = (df['BB_Upper'] - df['BB_Lower']) / df['MA20']

    # 6. 등락률 및 거래량 비율
    df['Change'] = df['close'].pct_change()
    df['Vol_MA5'] = df['volume'].rolling(window=5).mean()
    df['Vol_Ratio'] = df['volume'] / df['Vol_MA5']
    
    # NaN 제거
    df.dropna(inplace=True)
    
    return df

def create_dataset(data, seq_length):
    xs, ys = [], []
    for i in range(len(data) - seq_length):
        x = data[i:(i + seq_length)]
        y = data[i + seq_length][-1] 
        xs.append(x)
        ys.append(y)
    return np.array(xs), np.array(ys)