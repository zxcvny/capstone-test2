import asyncio
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import TensorDataset, DataLoader
import pandas as pd
import numpy as np
from sklearn.preprocessing import MinMaxScaler
import joblib 
import os 
import time

from services.kis.data import kis_data
from ai.models import StockLSTM
from ai.utils import add_indicators

# --- [긴급 수정: 속도 및 학습 효율 최적화] ---
SEQ_LENGTH = 20       # [축소] 60일 -> 20일 (과거 1달치만 봄, 속도 향상)
PREDICT_DAY = 1      
TARGET_PCT = 0.01    
EPOCHS = 100         
LR = 0.001           
BATCH_SIZE = 1024     # [증가] 64 -> 1024 (CPU 연산 효율 극대화)
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def create_dataset_multiclass(data_x, data_y, seq_length):
    xs, ys = [], []
    for i in range(len(data_x) - seq_length):
        x = data_x[i:(i + seq_length)]
        y = data_y[i + seq_length]
        xs.append(x)
        ys.append(y)
    return np.array(xs), np.array(ys)

async def run_training(market_name, stock_list, model_file, scaler_file):
    print(f"\n🚀 [{market_name}] 상위 {len(stock_list)}개 종목 데이터 수집 및 학습 (Fast Mode)...")
    print(f"💻 학습 장치: {DEVICE} | 배치 사이즈: {BATCH_SIZE}")
    
    all_x = []
    all_y = []
    
    # 1. 데이터 수집
    for idx, stock in enumerate(stock_list):
        # 진행상황을 10개 단위로만 출력 (로그 줄임)
        if idx % 10 == 0:
            print(f"[{idx+1}/{len(stock_list)}] {stock['name']} 수집 중...")
            
        await asyncio.sleep(0.01) # 딜레이 최소화
        
        chart_data = await kis_data.get_stock_chart(stock['market'], stock['code'], "D")
        if not chart_data or len(chart_data) < 250: continue
            
        df = pd.DataFrame(chart_data)
        try:
            df = add_indicators(df)
            
            df['Return'] = df['close'].shift(-PREDICT_DAY) / df['close'] - 1.0
            df.dropna(inplace=True)
            
            conditions = [
                (df['Return'] <= -TARGET_PCT),
                (df['Return'] > -TARGET_PCT) & (df['Return'] < TARGET_PCT),
                (df['Return'] >= TARGET_PCT)
            ]
            choices = [0, 1, 2]
            df['Target'] = np.select(conditions, choices, default=1)
            
            features = ['Change', 'RSI', 'Disparity_5', 'Disparity_20', 'Vol_Ratio', 'PPO', 'BB_Width']
            
            data_x = df[features].values
            data_y = df['Target'].values
            
            x_seq, y_seq = create_dataset_multiclass(data_x, data_y, SEQ_LENGTH)
            all_x.append(x_seq)
            all_y.append(y_seq)
        except: continue

    if not all_x:
        print(f"❌ [{market_name}] 데이터 없음")
        return

    X = np.concatenate(all_x, axis=0)
    Y = np.concatenate(all_y, axis=0)
    
    count_0 = np.sum(Y == 0)
    count_1 = np.sum(Y == 1)
    count_2 = np.sum(Y == 2)
    total_samples = len(Y)
    
    print(f"📊 데이터: 총 {total_samples}개 (하락 {count_0} | 횡보 {count_1} | 상승 {count_2})")
    
    # 가중치 계산 (너무 극단적이지 않게 로그 스케일 적용 고려 가능하나 일단 유지)
    w0 = total_samples / (3 * count_0) if count_0 > 0 else 1.0
    w1 = total_samples / (3 * count_1) if count_1 > 0 else 1.0
    w2 = total_samples / (3 * count_2) if count_2 > 0 else 1.0
    class_weights = torch.FloatTensor([w0, w1, w2]).to(DEVICE)
    
    # 스케일링
    num_samples, seq_len, num_features = X.shape
    X_reshaped = X.reshape(-1, num_features)
    scaler = MinMaxScaler(feature_range=(-1, 1))
    X_scaled = scaler.fit_transform(X_reshaped)
    X_final = X_scaled.reshape(num_samples, seq_len, num_features)
    joblib.dump(scaler, os.path.join(BASE_DIR, scaler_file))

    # DataLoader
    x_tensor = torch.tensor(X_final, dtype=torch.float32).to(DEVICE)
    y_tensor = torch.tensor(Y, dtype=torch.long).to(DEVICE)
    dataset = TensorDataset(x_tensor, y_tensor)
    
    train_size = int(len(dataset) * 0.8)
    val_size = len(dataset) - train_size
    train_dataset, val_dataset = torch.utils.data.random_split(dataset, [train_size, val_size])
    
    train_loader = DataLoader(train_dataset, batch_size=BATCH_SIZE, shuffle=True)
    val_loader = DataLoader(val_dataset, batch_size=BATCH_SIZE, shuffle=False)

    # [수정] 모델 경량화: Hidden 64, Layers 2
    model = StockLSTM(input_size=num_features, hidden_size=64, num_layers=2, output_size=3, dropout=0.2).to(DEVICE)
    criterion = nn.CrossEntropyLoss(weight=class_weights)
    optimizer = optim.Adam(model.parameters(), lr=LR)
    scheduler = optim.lr_scheduler.ReduceLROnPlateau(optimizer, mode='min', factor=0.5, patience=5)

    print(f"🔥 학습 시작...")
    
    start_time = time.time()
    for epoch in range(EPOCHS):
        epoch_start = time.time()
        model.train()
        total_loss = 0
        
        for batch_x, batch_y in train_loader:
            optimizer.zero_grad()
            outputs = model(batch_x)
            loss = criterion(outputs, batch_y)
            loss.backward()
            optimizer.step()
            total_loss += loss.item()
            
        avg_train_loss = total_loss / len(train_loader)
        
        # 검증 (매 에포크)
        model.eval()
        val_loss = 0
        correct = 0
        total = 0
        with torch.no_grad():
            for val_x, val_y in val_loader:
                val_out = model(val_x)
                loss = criterion(val_out, val_y)
                val_loss += loss.item()
                
                _, predicted = torch.max(val_out.data, 1)
                total += val_y.size(0)
                correct += (predicted == val_y).sum().item()
        
        avg_val_loss = val_loss / len(val_loader)
        val_acc = 100 * correct / total
        
        # 스케줄러
        old_lr = optimizer.param_groups[0]['lr']
        scheduler.step(avg_val_loss)
        new_lr = optimizer.param_groups[0]['lr']
        
        elapsed = time.time() - epoch_start
        lr_msg = f" | 📉 LR: {new_lr:.5f}" if new_lr != old_lr else ""
        
        # [중요] Loss가 1.09 밑으로 떨어지는지 확인
        print(f"Ep {epoch+1:3d}/{EPOCHS} | Loss: {avg_train_loss:.4f} | Val: {avg_val_loss:.4f} | Acc: {val_acc:.2f}% ({elapsed:.1f}s){lr_msg}")

    print(f"✅ 학습 완료 ({(time.time()-start_time)/60:.1f}분 소요)")
    torch.save(model.state_dict(), os.path.join(BASE_DIR, model_file))

async def main():
    # 국내
    kr_list = []
    try:
        ranks = await kis_data.get_ranking_data("cap")
        limit = 200 if len(ranks) > 200 else len(ranks)
        for item in ranks[:limit]:
            kr_list.append({"market": "KR", "code": item['code'], "name": item['name']})
    except: pass
    
    if kr_list: await run_training("국내(KR)", kr_list, "stock_model_kr.pth", "scaler_kr.pkl")

    # 나스닥
    nas_list = []
    try:
        ranks = await kis_data.get_overseas_ranking_data("market_cap", "NAS")
        limit = 200 if len(ranks) > 200 else len(ranks)
        for item in ranks[:limit]:
            nas_list.append({"market": "NAS", "code": item['code'], "name": item.get('name', item['code'])})
    except: pass

    if nas_list: await run_training("나스닥(NAS)", nas_list, "stock_model_nas.pth", "scaler_nas.pkl")

if __name__ == "__main__":
    asyncio.run(main())