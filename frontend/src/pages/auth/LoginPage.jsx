// src/pages/auth/LoginPage.jsx
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FcGoogle } from "react-icons/fc";
import { RiKakaoTalkFill, RiAlertFill } from "react-icons/ri";
import Logo from '../../components/Logo';
import axios from '../../lib/axios'; 
import { useAuth } from '../../context/AuthContext';
import '../../styles/LoginPage.css';

function LoginPage() {
    const navigate = useNavigate();
    const { login } = useAuth();
    
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [errorMsg, setErrorMsg] = useState('');

    const handleLogin = async (e) => {
        e.preventDefault();
        setErrorMsg('');

        // --- 빈 값 체크 ---
        if (!username.trim()) {
            setErrorMsg("아이디를 입력해주세요.");
            return;
        }
        if (!password.trim()) {
            setErrorMsg("비밀번호를 입력해주세요.");
            return;
        }

        // FastAPI OAuth2PasswordRequestForm은 x-www-form-urlencoded 형식을 요구합니다.
        const params = new URLSearchParams();
        params.append('username', username);
        params.append('password', password);

        try {
            // [수정된 부분] 3번째 인자로 headers를 명시적으로 전달합니다.
            // 이렇게 하면 axios 기본 설정(application/json)을 무시하고 폼 데이터 형식으로 보냅니다.
            const response = await axios.post('/auth/login', params, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });
            
            const { access_token } = response.data;
            await login(access_token);
            navigate('/'); 
        } catch (error) {
            console.error("로그인 에러:", error);

            if (error.response) {
                const status = error.response.status;
                const errorDetail = error.response.data.detail; // 서버가 보낸 실제 에러 메시지 확인

                if (status === 401) {
                    setErrorMsg("아이디 또는 비밀번호가 올바르지 않습니다.");
                } else if (status === 422) {
                    // 콘솔에 서버가 보낸 구체적인 에러 내용을 출력해봅니다 (F12 개발자 도구 -> Console 확인)
                    console.error("422 상세 에러:", error.response.data);
                    setErrorMsg("입력 정보 형식이 올바르지 않습니다."); 
                } else {
                    setErrorMsg(errorDetail || `로그인 중 오류가 발생했습니다. (${status})`);
                }
            } else {
                setErrorMsg("서버와 연결할 수 없습니다.");
            }
        }
    };

    const handleSocialLogin = (provider) => {
        window.location.href = `http://localhost:8000/auth/${provider}/login`;
    };

    const LoginErrorMessage = ({ message }) => {
        if (!message) return null;

        return (
            <div style={{ 
                color: 'var(--color-error)', 
                fontSize: '13px', 
                textAlign: 'center',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                fontWeight: '500'
                // minHeight, visibility 제거됨
            }}>
                <RiAlertFill style={{ fontSize: '16px' }} />
                <span>{message}</span>
            </div>
        );
    };

    return (
        <div className="login-container">
            <div className="login-card">
                <div className="login-logo">
                    <Logo v="mini" />
                    <h2>Welcome Back</h2>
                    <p>화성으로 가는 여정을 계속하세요</p>
                </div>

                <form className="login-form" onSubmit={handleLogin}>
                    <div className="input-group">
                        <label htmlFor="userId">아이디</label>
                        <input 
                            type="text" 
                            id="userId"
                            className="login-input" 
                            placeholder="아이디 또는 이메일을 입력하세요" 
                            value={username}
                            onChange={(e) => { setUsername(e.target.value); setErrorMsg(''); }}
                        />
                    </div>

                    <div className="input-group">
                        <label htmlFor="password">비밀번호</label>
                        <input 
                            type="password" 
                            id="password"
                            className="login-input" 
                            placeholder="비밀번호를 입력하세요"
                            value={password}
                            onChange={(e) => { setPassword(e.target.value); setErrorMsg(''); }}
                        />
                    </div>

                    <div className="form-options">
                        <label className="checkbox-label">
                            <input type="checkbox" />
                            <span>로그인 상태 유지</span>
                        </label>
                        <Link to="/forgot-password" className="forgot-pw-link">
                            비밀번호 찾기
                        </Link>
                    </div>

                    <LoginErrorMessage message={errorMsg} />

                    <button type="submit" className="btn-login">
                        로그인
                    </button>
                </form>

                <div className="divider">
                    <span>간편 로그인</span>
                </div>

                <div className="social-login">
                    <button 
                        type="button" 
                        className="btn-social btn-kakao"
                        onClick={() => handleSocialLogin('kakao')}
                    >
                        <RiKakaoTalkFill /> 카카오로 시작하기
                    </button>
                    <button 
                        type="button" 
                        className="btn-social btn-google"
                        onClick={() => handleSocialLogin('google')}
                    >
                        <FcGoogle /> 구글로 시작하기
                    </button>
                </div>
                
                <div style={{ marginTop: '24px', fontSize: '14px', color: 'var(--color-text-muted)' }}>
                    계정이 없으신가요? <Link to="/signup" style={{ color: 'var(--color-primary)', fontWeight: 'bold' }}>회원가입</Link>
                </div>
            </div>
        </div>
    );
}

export default LoginPage;