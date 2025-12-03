// src/pages/auth/SignUpPage.jsx
import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FaTimes } from 'react-icons/fa';
import { RiAlertFill } from 'react-icons/ri';
import Logo from "../../components/Logo";
import axios from "../../lib/axios";
import '../../styles/SignUpPage.css';

function SignUpPage() {
    const navigate = useNavigate();

    // --- State 관리 ---
    const [name, setName] = useState('');
    const [nameError, setNameError] = useState('');

    const [userId, setUserId] = useState('');
    const [userIdError, setUserIdError] = useState('');
    const [isUserIdAvailable, setIsUserIdAvailable] = useState(false);

    const [password, setPassword] = useState('');
    const [passwordError, setPasswordError] = useState('');
    
    const [confirmPassword, setConfirmPassword] = useState('');
    const [confirmPasswordError, setConfirmPasswordError] = useState('');

    const [emailId, setEmailId] = useState('');
    const [emailDomain, setEmailDomain] = useState('naver.com');
    const [customDomain, setCustomDomain] = useState('');
    const [isDirectInput, setIsDirectInput] = useState(false);
    const [emailError, setEmailError] = useState('');

    const [phoneMiddle, setPhoneMiddle] = useState('');
    const [phoneLast, setPhoneLast] = useState('');
    const [phoneError, setPhoneError] = useState('');
    
    const [isVerifyRequested, setIsVerifyRequested] = useState(false);
    const [verifyCode, setVerifyCode] = useState('');
    const [serverVerifyCode, setServerVerifyCode] = useState('');
    const [isPhoneVerified, setIsPhoneVerified] = useState(false);
    
    const [timeLeft, setTimeLeft] = useState(180);
    const [resendCooldown, setResendCooldown] = useState(0);

    // --- 실시간 중복 확인 ---
    // (이전과 동일한 로직 유지)
    useEffect(() => {
        const checkId = async () => {
            if (userId.length < 4) {
                setUserIdError(userId ? '아이디는 4자 이상이어야 합니다.' : '');
                setIsUserIdAvailable(false);
                return;
            }
            try {
                const response = await axios.post('/auth/check-availability', { field: 'username', value: userId });
                if (response.data.available) { setUserIdError(''); setIsUserIdAvailable(true); }
            } catch (error) {
                if (error.response && error.response.status === 409) setUserIdError(error.response.data.message);
                else setUserIdError('중복 확인 중 오류가 발생했습니다.');
                setIsUserIdAvailable(false);
            }
        };
        const timer = setTimeout(() => { if (userId) checkId(); }, 100);
        return () => clearTimeout(timer);
    }, [userId]);

    useEffect(() => {
        const finalDomain = isDirectInput ? customDomain : emailDomain;
        const fullEmail = `${emailId}@${finalDomain}`;
        const checkEmail = async () => {
            if (!emailId || (isDirectInput && !customDomain)) { setEmailError(''); return; }
            try {
                const response = await axios.post('/auth/check-availability', { field: 'email', value: fullEmail });
                if (response.data.available) setEmailError('');
            } catch (error) {
                if (error.response && error.response.status === 409) setEmailError(error.response.data.message);
                else setEmailError('중복 확인 중 오류');
            }
        };
        const timer = setTimeout(() => { if (emailId) checkEmail(); }, 500);
        return () => clearTimeout(timer);
    }, [emailId, emailDomain, customDomain, isDirectInput]);

    useEffect(() => {
        if (!confirmPassword) { setConfirmPasswordError(''); return; }
        if (password !== confirmPassword) setConfirmPasswordError('비밀번호가 일치하지 않습니다.');
        else setConfirmPasswordError('');
    }, [password, confirmPassword]);


    // --- 핸들러 ---
    const handleDomainChange = (e) => {
        const value = e.target.value;
        if (value === 'type') { setIsDirectInput(true); setCustomDomain(''); }
        else { setEmailDomain(value); setIsDirectInput(false); }
    };
    const handleResetDomain = () => { setIsDirectInput(false); setEmailDomain('naver.com'); };

    const handlePhoneChange = (e, setter, maxLength) => {
        const value = e.target.value.replace(/[^0-9]/g, '');
        if (value.length <= maxLength) {
            setter(value);
            setIsVerifyRequested(false);
            setIsPhoneVerified(false);
            setVerifyCode('');
            setPhoneError('');
        }
    };

    const handleVerifyCodeInput = (e) => {
        const code = e.target.value.replace(/[^0-9]/g, '');
        if (code.length > 6) return;

        setVerifyCode(code);

        if (code.length === 6) {
            if (code === serverVerifyCode) {
                setIsPhoneVerified(true);
                setPhoneError('');
                // 인증 성공 시 타이머는 의미가 없으므로 별도 처리 필요 없음 (UI에서 숨김)
            } else {
                setIsPhoneVerified(false);
                setPhoneError('인증번호가 올바르지 않습니다.');
            }
        } else {
            setPhoneError('');
        }
    };

    const isPhoneFilled = phoneMiddle.length === 4 && phoneLast.length === 4;

    const handleRequestVerification = async () => {
        if (!isPhoneFilled) { setPhoneError("전화번호를 올바르게 입력해주세요."); return; }
        if (resendCooldown > 0) return;

        const fullPhone = `010-${phoneMiddle}-${phoneLast}`;
        try {
            const response = await axios.post('/auth/send-verification-code', { phone_number: fullPhone });
            setServerVerifyCode(response.data.code);
            alert(`인증번호가 발송되었습니다. (테스트용: ${response.data.code})`);
            
            setIsVerifyRequested(true);
            setIsPhoneVerified(false);
            setVerifyCode('');
            setTimeLeft(180);
            setResendCooldown(60);
            setPhoneError('');
        } catch (error) {
            console.error(error);
            alert("인증번호 발송 실패");
        }
    };

    // 타이머
    useEffect(() => {
        let timer = null;
        if (isVerifyRequested && !isPhoneVerified && timeLeft > 0) {
            timer = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
        } else if (timeLeft === 0) {
            clearInterval(timer);
        }
        return () => clearInterval(timer);
    }, [isVerifyRequested, isPhoneVerified, timeLeft]);

    useEffect(() => {
        let cooldownTimer = null;
        if (resendCooldown > 0) {
            cooldownTimer = setInterval(() => setResendCooldown(prev => prev - 1), 1000);
        }
        return () => clearInterval(cooldownTimer);
    }, [resendCooldown]);

    const formatTime = (seconds) => {
        const min = Math.floor(seconds / 60);
        const sec = seconds % 60;
        return `${min}:${sec < 10 ? `0${sec}` : sec}`;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        let isValid = true; 
        if (!name.trim()) { setNameError("이름을 입력해주세요."); isValid = false; }
        if (!userId.trim()) { setUserIdError("아이디를 입력해주세요."); isValid = false; }
        else if (!isUserIdAvailable && userIdError) isValid = false;
        
        const finalDomain = isDirectInput ? customDomain : emailDomain;
        if (!emailId.trim() || (isDirectInput && !customDomain.trim())) { setEmailError("이메일을 입력해주세요."); isValid = false; }
        else if (emailError) isValid = false;

        if (!password.trim()) { setPasswordError("비밀번호를 입력해주세요."); isValid = false; }
        if (!confirmPassword.trim()) { setConfirmPasswordError("비밀번호를 한 번 더 입력해주세요."); isValid = false; }
        else if (password !== confirmPassword) { setConfirmPasswordError("비밀번호가 일치하지 않습니다."); isValid = false; }

        if (!isPhoneFilled) { setPhoneError("전화번호를 입력해주세요."); isValid = false; }
        else if (!isPhoneVerified) { setPhoneError("전화번호 인증을 완료해주세요."); isValid = false; }

        if (!isValid) return;

        const fullEmail = `${emailId}@${finalDomain}`;
        const fullPhone = `010-${phoneMiddle}-${phoneLast}`;
        const payload = { username: userId, password: password, email: fullEmail, name: name, phone_number: fullPhone };

        try {
            await axios.post('/auth/register', payload);
            alert('회원가입이 완료되었습니다.'); navigate('/login');
        } catch (error) { console.error(error); alert(error.response?.data?.detail || "회원가입 실패"); }
    };

    const ErrorMessage = ({ message }) => {
        if (!message) return null;
        
        return (
            <div style={{ 
                color: 'var(--color-error)', 
                fontSize: '12px', 
                marginTop: '6px', 
                textAlign: 'left', 
                display: 'flex', 
                alignItems: 'center', 
                gap: '4px',
                // minHeight, visibility 제거됨
            }}>
                <RiAlertFill />
                <span>{message}</span>
            </div>
        );
    };

    return (
        <div className="signup-container">
            <div className="signup-card">
                <div className="signup-logo">
                    <Logo v="mini" />
                    <h2>Create Account</h2>
                    <p>화성으로 가는 첫 걸음을 떼세요</p>
                </div>

                <form className="signup-form" onSubmit={handleSubmit}>
                    {/* ... 이름, 아이디, 이메일, 비밀번호 등은 그대로 유지 ... */}
                    <div className="input-group">
                        <label htmlFor="name">이름</label>
                        <input type="text" id="name" className="signup-input" placeholder="이름을 입력하세요" value={name} onChange={(e) => { setName(e.target.value); setNameError(""); }} />
                        <ErrorMessage message={nameError} />
                    </div>

                    <div className="input-group">
                        <label htmlFor="userId">아이디</label>
                        <input type="text" id="userId" className="signup-input" placeholder="아이디를 입력하세요" value={userId} onChange={(e) => setUserId(e.target.value)} style={{ borderColor: userIdError ? 'var(--color-error)' : undefined }} />
                        <ErrorMessage message={userIdError} />
                    </div>

                    <div className="input-group">
                        <label>이메일</label>
                        <div className="email-row">
                            <input type="text" className="signup-input" placeholder="이메일 아이디" style={{ flex: 1 }} value={emailId} onChange={(e) => setEmailId(e.target.value)} />
                            <span>@</span>
                            {isDirectInput ? (
                                <>
                                    <input type="text" className="signup-input" placeholder="도메인 입력" style={{ flex: 1 }} value={customDomain} onChange={(e) => setCustomDomain(e.target.value)} autoFocus />
                                    <button type="button" className="btn-reset-domain" onClick={handleResetDomain}><FaTimes /></button>
                                </>
                            ) : (
                                <select className="signup-select" style={{ flex: 1 }} value={emailDomain} onChange={handleDomainChange}>
                                    <option value="naver.com">naver.com</option>
                                    <option value="gmail.com">gmail.com</option>
                                    <option value="daum.net">daum.net</option>
                                    <option value="type">직접 입력</option>
                                </select>
                            )}
                        </div>
                        <ErrorMessage message={emailError} />
                    </div>

                    <div className="input-group">
                        <label htmlFor="password">비밀번호</label>
                        <input type="password" id="password" className="signup-input" placeholder="비밀번호" value={password} onChange={(e) => { setPassword(e.target.value); setPasswordError(""); }} />
                        <ErrorMessage message={passwordError} />
                    </div>

                    <div className="input-group">
                        <label htmlFor="confirmPassword">비밀번호 확인</label>
                        <input type="password" id="confirmPassword" className="signup-input" placeholder="비밀번호 재입력" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} style={{ borderColor: confirmPasswordError ? 'var(--color-error)' : undefined }} />
                        <ErrorMessage message={confirmPasswordError} />
                    </div>

                    {/* 전화번호 & 인증번호 섹션 수정됨 */}
                    <div className="input-group">
                        <label>전화번호</label>
                        <div className="phone-row">
                            <input type="text" className="signup-input phone-input phone-prefix" value="010" disabled style={{ width: '60px' }} />
                            <span>-</span>
                            <input type="text" className="signup-input phone-input" placeholder="1234" style={{ flex: 1 }} maxLength={4} value={phoneMiddle} onChange={(e) => handlePhoneChange(e, setPhoneMiddle, 4)} disabled={isPhoneVerified} />
                            <span>-</span>
                            <input type="text" className="signup-input phone-input" placeholder="5678" style={{ flex: 1 }} maxLength={4} value={phoneLast} onChange={(e) => handlePhoneChange(e, setPhoneLast, 4)} disabled={isPhoneVerified} />
                            
                            <button 
                                type="button" 
                                className="btn-verify-request"
                                onClick={handleRequestVerification}
                                disabled={!isPhoneFilled || resendCooldown > 0 || isPhoneVerified} // 인증 완료 시 비활성화
                                style={{
                                    backgroundColor: isPhoneVerified ? 'var(--color-success)' : undefined,
                                    borderColor: isPhoneVerified ? 'var(--color-success)' : undefined,
                                    color: isPhoneVerified ? '#fff' : undefined,
                                    cursor: isPhoneVerified ? 'default' : 'pointer'
                                }}
                            >
                                {isPhoneVerified 
                                    ? "인증완료" 
                                    : (isVerifyRequested 
                                        ? (resendCooldown > 0 ? `재전송 (${resendCooldown})` : '재전송') 
                                        : '인증요청')
                                }
                            </button>
                        </div>
                        
                        {/* 인증이 요청되었으면(isVerifyRequested) 항상 표시하되, 인증 완료 시(isPhoneVerified) 비활성화 */}
                        {isVerifyRequested && (
                            <div className="verification-area" style={{ marginTop: '10px' }}>
                                <input 
                                    type="text" 
                                    className="signup-input" 
                                    placeholder="인증번호 6자리 입력" 
                                    maxLength={6}
                                    value={verifyCode} 
                                    onChange={handleVerifyCodeInput} 
                                    disabled={isPhoneVerified} // 인증 완료 시 비활성화
                                    style={{ 
                                        paddingRight: '60px',
                                        // 인증 완료 시 시각적 피드백 (선택사항)
                                        borderColor: isPhoneVerified ? 'var(--color-success)' : undefined
                                    }}
                                />
                                {/* 인증이 아직 안 되었을 때만 타이머 표시 */}
                                {!isPhoneVerified && (
                                    <span className="timer-text">{formatTime(timeLeft)}</span>
                                )}
                            </div>
                        )}
                         <ErrorMessage message={phoneError} />
                    </div>

                    <button type="submit" className="btn-signup">
                        회원가입 완료
                    </button>
                </form>

                <div className="login-link-box">
                    이미 계정이 있으신가요? <Link to="/login" style={{ color: 'var(--color-primary)', fontWeight: 'bold' }}>로그인</Link>
                </div>
            </div>
        </div>
    )
}
export default SignUpPage;