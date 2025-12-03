import React from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/LoginRequired.css'; // 스타일 분리

const LoginRequired = ({ message = "로그인이 필요한 서비스입니다." }) => {
    const navigate = useNavigate();

    return (
        <div className="login-required-container">
            <div className="login-required-card">
                <div className="icon">🔒</div>
                <h2>접근 권한이 없습니다</h2>
                <p>{message}</p>
                <button 
                    className="go-login-btn"
                    onClick={() => navigate('/login')}
                >
                    로그인 페이지로 이동
                </button>
            </div>
        </div>
    );
};

export default LoginRequired;