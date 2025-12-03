import { Link } from 'react-router-dom';
import { IoSearchOutline } from "react-icons/io5";
import Logo from "./Logo";
import { useAuth } from "../context/AuthContext"; 
import "../styles/Header.css"

function Header() {
    const { user, logout } = useAuth(); 

    const handleLogout = () => {
        if (window.confirm("로그아웃 하시겠습니까?")) {
            logout();
        }
    };

    return (
        <header className="header-container">
            <div className="header-content-wrapper">
                <div className="header-logo">
                    <Logo />
                </div>
                <div className="header-search">
                    <form action="" className="search-form">
                        <IoSearchOutline className="search-icon" />
                        <input
                         type="text"
                         className="search-input"
                         placeholder="종목명 검색"
                        />
                    </form>
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
    )
}
export default Header