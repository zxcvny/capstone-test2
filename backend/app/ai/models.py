import torch
import torch.nn as nn

class StockLSTM(nn.Module):
    def __init__(self, input_size, hidden_size, num_layers, output_size):
        super(StockLSTM, self).__init__()
        self.hidden_size = hidden_size
        self.num_layers = num_layers
        
        # batch_first=True가 중요합니다 (입력을 (Batch, Seq, Feature)로 받음)
        self.lstm = nn.LSTM(input_size, hidden_size, num_layers, batch_first=True)
        self.fc = nn.Linear(hidden_size, output_size)

    def forward(self, x):
        # 초기 은닉 상태와 셀 상태 0으로 초기화
        h0 = torch.zeros(self.num_layers, x.size(0), self.hidden_size).to(x.device)
        c0 = torch.zeros(self.num_layers, x.size(0), self.hidden_size).to(x.device)
        
        # LSTM 순전파
        # out 형상은 (batch_size, sequence_length, hidden_size)
        out, _ = self.lstm(x, (h0, c0))
        
        # 마지막 타임스텝(마지막 날)의 hidden state만 가져와서 FC 레이어에 넣음
        # out[:, -1, :] -> (batch_size, hidden_size) 가 됨 (2차원)
        out = out[:, -1, :] 
        
        return self.fc(out)