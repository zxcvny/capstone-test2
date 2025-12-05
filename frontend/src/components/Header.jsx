import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom'; // useNavigate 제거 (window.location 사용으로 불필요)
import { IoSearchOutline } from "react-icons/io5";
import Logo from "./Logo";
import { useAuth } from "../context/AuthContext";
import "../styles/Header.css";

function Header() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    
    const [keyword, setKeyword] = useState("");
    const [results, setResults] = useState([]);
    const [showResults, setShowResults] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const searchRef = useRef(null);
    const wsRef = useRef(null);

    // 1. 웹소켓 연결 및 이벤트 핸들링 (기존 동일)
    useEffect(() => {
        const ws = new WebSocket("ws://localhost:8000/stocks/ws/realtime");
        wsRef.current = ws;

        ws.onopen = () => {
            console.log("🔍 Search/Realtime WS Connected");
        };

        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);

                if (msg.type === "search_result") {
                    setResults(msg.data);
                    setIsLoading(false);
                    if (document.activeElement === document.querySelector('.search-input')) {
                        setShowResults(true);
                    }
                } 
                else if (msg.type === "realtime") {
                    const updateData = msg.data;
                    setResults(prevResults => prevResults.map(stock => {
                        if (stock.stock_code === updateData.code) {
                            const formattedPrice = Number(updateData.price).toLocaleString() + "원";
                            const formattedRate = `${updateData.rate}%`;
                            return {
                                ...stock,
                                current_price: formattedPrice,
                                change_rate: formattedRate
                            };
                        }
                        return stock;
                    }));
                }
            } catch (err) {
                console.error("WS Message Error:", err);
                setIsLoading(false);
            }
        };

        ws.onclose = () => {
            console.log("WS Disconnected");
        };

        return () => {
            if (wsRef.current) {
                wsRef.current.close();
            }
        };
    }, []);

    // 2. 검색어 입력 시 웹소켓 전송 (기존 동일)
    useEffect(() => {
        const sendSearchRequest = () => {
            if (keyword.trim().length < 1) {
                setResults([]);
                setIsLoading(false);
                return;
            }

            setIsLoading(true);

            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({
                    type: "search",
                    keyword: keyword
                }));
            }
        };

        const debounce = setTimeout(() => {
            sendSearchRequest();
        }, 300);

        return () => clearTimeout(debounce);
    }, [keyword]);

    // 외부 클릭 시 닫기 (기존 동일)
    useEffect(() => {
        function handleClickOutside(event) {
            if (searchRef.current && !searchRef.current.contains(event.target)) {
                setShowResults(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleStockClick = (market, code, name) => {
        // 해외 시장 코드 리스트 (필요하면 더 추가 가능)
        const overseasMarkets = ["NAS", "NYS", "AMEX", "NYSE", "NASDAQ"];

        // 정확한 매핑
        const routeMarket = overseasMarkets.includes(market)
            ? "overseas"
            : "domestic";

        // 해외면 symb 사용, 국내면 code 사용
        const routeId = code;

        navigate(`/stock/${routeMarket}/${routeId}`, {
            state: {
                code: code,
                symb: code,
                name: name
            }
        });

        setKeyword("");
        setShowResults(false);
    };

    const handleKeyDown = (e) => {
        if (e.nativeEvent.isComposing) return;

        if (e.key === 'Enter') {
            if (results.length > 0) {
                const firstItem = results[0];
                handleStockClick(firstItem.market_code, firstItem.stock_code, firstItem.display_name);
                e.target.blur();
            }
        }
    };

    const handleLogout = () => {
        if (window.confirm("로그아웃 하시겠습니까?")) {
            logout();
        }
    };

    const getRateClass = (rateStr) => {
        if (!rateStr) return '';
        if (rateStr.includes('+') || parseFloat(rateStr) > 0) return 'text-up';
        if (rateStr.includes('-') || parseFloat(rateStr) < 0) return 'text-down';
        return '';
    };

    return (
        <header className="header-container">
            <div className="header-content-wrapper">
                <div className="header-logo">
                    <Logo />
                </div>
                
                <div className="header-search" ref={searchRef}>
                    <div className="search-form">
                        <IoSearchOutline className="search-icon" />
                        <input
                            type="text"
                            className="search-input"
                            placeholder="종목명 또는 코드 (예: 삼성전자, TSLA)"
                            value={keyword}
                            onChange={(e) => setKeyword(e.target.value)}
                            onFocus={() => setShowResults(true)}
                            onKeyDown={handleKeyDown}
                        />
                    </div>

                    {showResults && (
                        <ul className="search-results-dropdown">
                            {keyword.trim().length === 0 ? (
                                <li className="search-status-message">
                                    검색어를 입력해주세요
                                </li>
                            ) : isLoading ? (
                                <li className="search-status-message loading">
                                    <div className="search-spinner"></div>
                                    검색 중...
                                </li>
                            ) : results.length === 0 ? (
                                <li className="search-status-message">
                                    검색 결과가 없습니다
                                </li>
                            ) : (
                                results.map((stock, index) => (
                                    <li 
                                        key={`${stock.market_code}-${stock.stock_code}-${index}`} 
                                        onClick={() => handleStockClick(stock.market_code, stock.stock_code, stock.display_name)}
                                    >
                                        <div className="search-result-item">
                                            <div className="result-left">
                                            <div className="stock-main-line">
                                                <span className={`market-badge ${stock.display_market === "국내" ? "domestic" : "overseas"}`}>
                                                {stock.display_market}
                                                </span>

                                                <span className="stock-display-name">{stock.display_name}</span>

                                                <span className="stock-code-inline">{stock.stock_code}</span>
                                            </div>
                                            </div>
                                            
                                            <div className="result-right">
                                                <span className="search-current-price">{stock.current_price}</span>
                                                <span className={`change-rate ${getRateClass(stock.change_rate)}`}>
                                                    {stock.change_rate}
                                                </span>
                                            </div>
                                        </div>
                                    </li>
                                ))
                            )}
                        </ul>
                    )}
                </div>

                <div className="header-login">
                    {user ? (
                        <div className="header-user-area" style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                            <span style={{ fontWeight: '600', color: 'var(--color-text-main)' }}>
                                {user.name}님
                            </span>
                            <button 
                                onClick={handleLogout}
                                className="header-login-btn" 
                                style={{ cursor: 'pointer', background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-main)' }}
                            >
                                로그아웃
                            </button>
                        </div>
                    ) : (
                        <Link to="/login" className="header-login-btn">로그인</Link>
                    )}
                </div>
            </div>
        </header>
    );
}

export default Header;