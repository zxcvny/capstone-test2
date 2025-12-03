
import { useEffect, useState } from 'react';
import axios from '../../lib/axios';
import '../../styles/Home.css';
function Home() {
    const [marketType, setMarketType] = useState('all');
    const [rankType, setRankType] = useState('volume');
    const [results, setResults] = useState([]); 

    const fetchRankings = async () => {
        try {
            let url = ``;

            if (['volume', 'amount', 'market-cap'].includes(rankType)) {
                url = `/stocks/ranking/${marketType}/${rankType}`;
            } else if (rankType === 'rising') {
                url = `/stocks/ranking/${marketType}/fluctuation/rising`;
            } else if (rankType === 'falling') {
                url = `/stocks/ranking/${marketType}/fluctuation/falling`;
            }
            const res = await axios.get(url);

            const list = res.data?.output;
            setResults(Array.isArray(list) ? list : []);

            console.log("📊 결과:", list);
        } catch (error) {
            console.error("순위 데이터 로드 실패:", error)
            setResults([]);
        }
    };

    return (
        <div className="home-container">
            <div className="btn-group">
                <button onClick={() => setMarketType('all')}>전체</button>
                <button onClick={() => setMarketType('domestic')}>국내</button>
                <button onClick={() => setMarketType('overseas')}>해외</button>
            </div>
            <div className="btn-group">
                <button onClick={() => setRankType('volume')}>거래량</button>
                <button onClick={() => setRankType('amount')}>거래대금</button>
                <button onClick={() => setRankType('market-cap')}>시총</button>
                <button onClick={() => setRankType('rising')}>급상승</button>
                <button onClick={() => setRankType('falling')}>급하락</button>
            </div>
            <button className="load-btn" onClick={fetchRankings}>
                순위 조회하기
            </button>
            <ul>
                {results.map((item, idx) => (
                    <li key={idx}>
                        {item.market} | {item.code} | {item.name} |
                        Price: {item.price} | Rate: {item.rate}
                    </li>
                ))}
            </ul>
        </div>
    );
    
}

export default Home;