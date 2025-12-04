import torch
import torch.nn as nn

class StockLSTM(nn.Module):
    def __init__(self, input_size, hidden_size, num_layers, output_size, dropout=0.2):
        super(StockLSTM, self).__init__()
        self.hidden_size = hidden_size
        self.num_layers = num_layers
        
        # LSTM Layer
        self.lstm = nn.LSTM(
            input_size, 
            hidden_size, 
            num_layers, 
            batch_first=True, 
            dropout=dropout
        )
        
        # Fully Connected Layer
        # [수정] 3가지 클래스(하락, 횡보, 상승)를 분류하기 위해 output_size는 3이 됨
        self.fc = nn.Linear(hidden_size, output_size)
        
        # [수정] Sigmoid 제거 (CrossEntropyLoss 사용 시 Softmax가 포함됨)
        # 추론 시에는 Softmax를 따로 적용해야 확률이 나옴

    def forward(self, x):
        h0 = torch.zeros(self.num_layers, x.size(0), self.hidden_size).to(x.device)
        c0 = torch.zeros(self.num_layers, x.size(0), self.hidden_size).to(x.device)
        
        out, _ = self.lstm(x, (h0, c0))
        out = self.fc(out[:, -1, :]) # 마지막 시점의 결과만 사용
        return out