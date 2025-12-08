import sys
import os
import asyncio
import torch
import torch.nn as nn
import torch.optim as optim
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from torch.utils.data import DataLoader, TensorDataset

# --- 모듈 경로 설정 ---
sys.path.append(os.path.dirname(os.path.abspath(os.path.dirname(__file__))))

from services.kis.data import kis_data
from ai.models import StockLSTM
from ai.collector import collector
import models 

# --- 하이퍼파라미터 ---
SEQ_LENGTH = 60
INPUT_SIZE = 1
HIDDEN_SIZE = 64
NUM_LAYERS = 2
EPOCHS = 50
BATCH_SIZE = 64
LEARNING_RATE = 0.0001
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

# --- 1. 데이터 수집 함수 ---
async def fetch_stock_data_paginated(market, code, years):
    all_data = []
    end_dt = datetime.now()
    start_dt = end_dt - timedelta(days=years * 365)
    
    end_str = end_dt.strftime("%Y%m%d")
    start_target_str = start_dt.strftime("%Y%m%d")
    current_end_str = end_str
    
    for _ in range(15):
        try:
            chunk = await kis_data.get_stock_chart(
                market, code, "D", 
                start_date=start_target_str, 
                end_date=current_end_str
            )
            if not chunk: break
            
            all_data = chunk + all_data 
            oldest_date = chunk[0]['time']
            
            if oldest_date <= start_target_str: break
            
            current_end_str = oldest_date
            await asyncio.sleep(0.2)
        except Exception as e:
            print(f"Fetch error {code}: {e}")
            break
    
    if not all_data: return None
    df = pd.DataFrame(all_data)
    df = df.drop_duplicates(subset=['time']).sort_values('time').reset_index(drop=True)
    return df

# --- 2. 윈도우 정규화 및 가중치 생성 ---
def make_windowed_dataset(data, window_size):
    x_list = []
    y_list = []
    w_list = []
    
    for i in range(window_size, len(data)):
        window = data[i - window_size : i]
        target = data[i]
        
        if not np.isfinite(window).all() or not np.isfinite(target):
            continue

        min_val = np.min(window)
        max_val = np.max(window)
        
        if max_val - min_val < 1e-9:
            continue
        
        current_price = window[-1]
        actual_return = (target - current_price) / current_price * 100
        
        # 가중치 부여 (급변동 구간 중요)
        if actual_return >= 1.0 or actual_return <= -1.0:
            weight = 1.2
        else:
            weight = 0.8
        
        normalized_window = (window - min_val) / (max_val - min_val + 1e-9)
        normalized_target = (target - min_val) / (max_val - min_val + 1e-9)
        
        x_list.append(normalized_window.reshape(window_size, 1))
        y_list.append(normalized_target)
        w_list.append(weight)
        
    return np.array(x_list), np.array(y_list), np.array(w_list)

# --- 3. 데이터셋 처리 프로세스 ---
async def process_dataset(market, codes, years):
    dataset_X = []
    dataset_y = []
    dataset_w = []
    total = len(codes)
    
    print(f"[{market}] {years}년치 데이터 처리 시작 ({total}종목)...")
    
    for idx, code in enumerate(codes):
        df = await fetch_stock_data_paginated(market, code, years)
        
        if df is None or len(df) < 300: # 1년치 데이터도 최소 300일(영업일 기준 250일+여유) 필요
            # 1년치 요청의 경우 데이터가 적을 수 있으므로 기준을 낮춤
            if years == 1 and (df is None or len(df) < 100): 
                continue
            elif years > 1 and (df is None or len(df) < 300):
                continue
            
        try:
            close_prices = pd.to_numeric(df['close'], errors='coerce').dropna().values
        except KeyError:
            continue

        if len(close_prices) < SEQ_LENGTH + 1:
            continue

        X, y, w = make_windowed_dataset(close_prices, SEQ_LENGTH)
        
        if len(X) > 0:
            dataset_X.append(X)
            dataset_y.append(y)
            dataset_w.append(w)
            
        if (idx + 1) % 10 == 0:
            print(f" - {idx + 1}/{total} 종목 처리 완료")
            
    if len(dataset_X) > 0:
        final_X = np.concatenate(dataset_X)
        final_y = np.concatenate(dataset_y)
        final_w = np.concatenate(dataset_w)
        
        valid_mask = np.isfinite(final_X).all(axis=(1, 2)) & np.isfinite(final_y)
        
        clean_X = final_X[valid_mask]
        clean_y = final_y[valid_mask]
        clean_w = final_w[valid_mask]
        
        return clean_X, clean_y, clean_w
    else:
        return None, None, None

# --- 4. 학습 함수 ---
def train_and_save(model_name, X_data, y_data, w_data):
    if X_data is None:
        print(f"❌ {model_name} 학습 데이터가 없습니다.")
        return

    X_tensor = torch.tensor(X_data, dtype=torch.float32)
    y_tensor = torch.tensor(y_data, dtype=torch.float32).view(-1, 1)
    w_tensor = torch.tensor(w_data, dtype=torch.float32).view(-1, 1)
    
    print(f"🧠 {model_name} 학습 시작! (총 샘플 수: {len(X_data)})")
    
    train_ds = TensorDataset(X_tensor, y_tensor, w_tensor)
    loader = DataLoader(train_ds, batch_size=BATCH_SIZE, shuffle=True, num_workers=0)
    
    model = StockLSTM(
        input_size=INPUT_SIZE, 
        hidden_size=HIDDEN_SIZE, 
        num_layers=NUM_LAYERS, 
        output_size=1 
    ).to(DEVICE)
    
    optimizer = optim.Adam(model.parameters(), lr=LEARNING_RATE)
    criterion = nn.MSELoss(reduction='none') 
    
    model.train()
    for epoch in range(EPOCHS):
        total_loss = 0
        for X_batch, y_batch, w_batch in loader:
            X_batch = X_batch.to(DEVICE)
            y_batch = y_batch.to(DEVICE)
            w_batch = w_batch.to(DEVICE)

            optimizer.zero_grad()
            out = model(X_batch)
            loss_elementwise = criterion(out, y_batch)
            weighted_loss = loss_elementwise * w_batch
            loss = weighted_loss.mean()
            
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            optimizer.step()
            total_loss += loss.item()
            
        if (epoch+1) % 1 == 0:
            avg_loss = total_loss / len(loader)
            print(f"Epoch [{epoch+1}/{EPOCHS}] Loss: {avg_loss:.6f}")
            
    current_dir = os.path.dirname(os.path.abspath(__file__))
    save_path = os.path.join(current_dir, f"stock_model_{model_name.lower()}.pth")
    os.makedirs(current_dir, exist_ok=True)
    
    torch.save(model.state_dict(), save_path)
    print(f"✅ {model_name} 모델 저장 완료: {save_path}")

# --- 메인 실행 함수 ---
async def main():
    # ---------------------------------------------------------
    # 1. KR (한국 주식) - 이원화 적용
    # ---------------------------------------------------------
    print("\n🇰🇷 한국 주식(KR) 데이터 처리 시작...")
    kr_long, kr_short = await collector.get_kr_targets()
    
    # 1-1. 장기(10년) - 우량주
    print(f"   👉 장기 학습(10년) 처리 중... ({len(kr_long)}개)")
    X_kr_long, y_kr_long, w_kr_long = await process_dataset("KR", kr_long, years=10)
    
    # 1-2. 단기(1년) - 급등주
    print(f"   👉 단기 학습(1년) 처리 중... ({len(kr_short)}개)")
    X_kr_short, y_kr_short, w_kr_short = await process_dataset("KR", kr_short, years=1)
    
    # 1-3. 병합
    X_kr_final, y_kr_final, w_kr_final = None, None, None
    if X_kr_long is not None and X_kr_short is not None:
        X_kr_final = np.concatenate([X_kr_long, X_kr_short], axis=0)
        y_kr_final = np.concatenate([y_kr_long, y_kr_short], axis=0)
        w_kr_final = np.concatenate([w_kr_long, w_kr_short], axis=0)
    elif X_kr_long is not None:
        X_kr_final, y_kr_final, w_kr_final = X_kr_long, y_kr_long, w_kr_long
        
    if X_kr_final is not None:
        # 최종 필터링
        valid_mask = np.isfinite(X_kr_final).all(axis=(1, 2)) & np.isfinite(y_kr_final)
        X_kr_final = X_kr_final[valid_mask]
        y_kr_final = y_kr_final[valid_mask]
        w_kr_final = w_kr_final[valid_mask]
        train_and_save("KR", X_kr_final, y_kr_final, w_kr_final)
    
    # ---------------------------------------------------------
    # 2. NAS (미국 주식) - 기존 유지
    # ---------------------------------------------------------
    print("\n🇺🇸 미국 주식(NAS) 데이터 처리를 시작합니다...")
    nas_long, nas_short = await collector.get_nas_targets()
    
    print(f"   👉 장기 학습(10년) 처리 중... ({len(nas_long)}개)")
    X_nas_long, y_nas_long, w_nas_long = await process_dataset("NAS", nas_long, years=10)
    
    print(f"   👉 단기 학습(1년) 처리 중... ({len(nas_short)}개)")
    X_nas_short, y_nas_short, w_nas_short = await process_dataset("NAS", nas_short, years=1)
    
    X_nas_final, y_nas_final, w_nas_final = None, None, None
    if X_nas_long is not None and X_nas_short is not None:
        X_nas_final = np.concatenate([X_nas_long, X_nas_short], axis=0)
        y_nas_final = np.concatenate([y_nas_long, y_nas_short], axis=0)
        w_nas_final = np.concatenate([w_nas_long, w_nas_short], axis=0)
    elif X_nas_long is not None:
        X_nas_final, y_nas_final, w_nas_final = X_nas_long, y_nas_long, w_nas_long
        
    if X_nas_final is not None:
        valid_mask = np.isfinite(X_nas_final).all(axis=(1, 2)) & np.isfinite(y_nas_final)
        X_nas_final = X_nas_final[valid_mask]
        y_nas_final = y_nas_final[valid_mask]
        w_nas_final = w_nas_final[valid_mask]
        train_and_save("NAS", X_nas_final, y_nas_final, w_nas_final)

if __name__ == "__main__":
    asyncio.run(main())