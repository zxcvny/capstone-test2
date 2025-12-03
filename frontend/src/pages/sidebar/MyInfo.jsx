import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import axios from '../../lib/axios';
import LoginRequired from '../../components/LoginRequired';
import '../../styles/MyInfo.css';

function MyInfo() {
    const { user, loading, logout } = useAuth();
    
    // UI 상태
    const [isChangeMode, setIsChangeMode] = useState(false); 
    const [showDeleteModal, setShowDeleteModal] = useState(false);

    // 폼 데이터
    const [form, setForm] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
    });

    // 에러 메시지
    const [errors, setErrors] = useState({
        current: '',
        match: '',
        general: ''
    });

    // 로딩 처리
    if (loading) return <div className="loading-container">Loading...</div>;

    // 비로그인 처리
    if (!user) {
        return <LoginRequired message="내 정보를 확인하려면 로그인이 필요합니다." />;
    }

    // 날짜 포맷팅 함수
    const formatDate = (dateString) => {
        if (!dateString) return '-';
        return new Date(dateString).toLocaleDateString('ko-KR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    };

    // 입력 핸들러
    const handleChange = (e) => {
        const { name, value } = e.target;
        setForm(prev => ({ ...prev, [name]: value }));
        
        // 입력 시 해당 필드 에러 초기화
        if (name === 'currentPassword') setErrors(prev => ({ ...prev, current: '' }));
    };

    // 실시간 비밀번호 일치 확인
    useEffect(() => {
        if (form.confirmPassword && form.newPassword !== form.confirmPassword) {
            setErrors(prev => ({ ...prev, match: '비밀번호가 일치하지 않습니다.' }));
        } else {
            setErrors(prev => ({ ...prev, match: '' }));
        }
    }, [form.newPassword, form.confirmPassword]);

    // 비밀번호 변경 제출
    const handleSubmitPassword = async () => {
        // 유효성 검사
        if (form.newPassword !== form.confirmPassword) return;
        if (!form.currentPassword) {
            setErrors(prev => ({ ...prev, current: '현재 비밀번호를 입력해주세요.' }));
            return;
        }

        try {
            // 백엔드 요청: current_password 필드를 추가하여 전송
            await axios.patch('/users/me', {
                password: form.newPassword,
                current_password: form.currentPassword
            });

            alert("비밀번호가 성공적으로 변경되었습니다.");
            setIsChangeMode(false);
            setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
            setErrors({});
            
        } catch (error) {
            console.error(error);
            const status = error.response?.status;
            const errorMsg = error.response?.data?.detail;

            // 400 Bad Request: 비밀번호 불일치 등
            if (status === 400) {
                if (errorMsg === "현재 비밀번호가 일치하지 않습니다.") {
                    setErrors(prev => ({ ...prev, current: errorMsg }));
                } else {
                    setErrors(prev => ({ ...prev, general: errorMsg || '요청이 잘못되었습니다.' }));
                }
            } else if (status === 403) {
                 alert("소셜 로그인 사용자는 비밀번호를 변경할 수 없습니다.");
            } else {
                setErrors(prev => ({ ...prev, general: '비밀번호 변경 중 오류가 발생했습니다.' }));
            }
        }
    };

    // 회원 탈퇴 처리
    const handleDeleteAccount = async () => {
        try {
            await axios.delete('/users/me');
            alert("회원 탈퇴가 완료되었습니다.");
            logout(); 
        } catch (error) {
            console.error(error);
            alert("회원 탈퇴 처리 중 오류가 발생했습니다.");
        }
    };

    return (
        <div className="myinfo-container">
            <h1 className="page-title">내 정보 관리</h1>

            <div className="myinfo-content">
                {/* 기본 정보 섹션 */}
                <section className="info-card">
                    <div className="card-header">
                        <h2>기본 정보</h2>
                        <span className={`badge ${user.is_social ? 'social' : 'general'}`}>
                            {user.is_social ? '소셜 회원' : '일반 회원'}
                        </span>
                    </div>
                    <div className="info-grid">
                        <div className="info-item">
                            <label>이름</label>
                            <p>{user.name}</p>
                        </div>
                        <div className="info-item">
                            <label>이메일</label>
                            <p>{user.email}</p>
                        </div>
                        {/* 가입일 다시 추가됨 */}
                        <div className="info-item">
                            <label>가입일</label>
                            <p>{formatDate(user.created_at)}</p>
                        </div>
                        {!user.is_social && (
                            <div className="info-item">
                                <label>아이디</label>
                                <p>{user.username}</p>
                            </div>
                        )}
                        {user.is_social && (
                            <div className="info-item">
                                <label>연동 계정</label>
                                <p>{user.social_provider}</p>
                            </div>
                        )}
                    </div>
                </section>

                {/* 비밀번호 변경 섹션 (일반 회원만) */}
                {!user.is_social ? (
                    <section className="info-card password-section">
                        {!isChangeMode ? (
                            <button 
                                className="btn-open-password"
                                onClick={() => setIsChangeMode(true)}
                            >
                                비밀번호 변경
                            </button>
                        ) : (
                            <div className="password-form">
                                <h3>비밀번호 변경</h3>
                                
                                {/* 현재 비밀번호 */}
                                <div className="form-group">
                                    <label>현재 비밀번호</label>
                                    <input 
                                        type="password" 
                                        name="currentPassword"
                                        placeholder="현재 사용 중인 비밀번호"
                                        value={form.currentPassword}
                                        onChange={handleChange}
                                    />
                                    {errors.current && <span className="error-text">{errors.current}</span>}
                                </div>

                                {/* 새 비밀번호 */}
                                <div className="form-group">
                                    <label>변경할 비밀번호</label>
                                    <input 
                                        type="password" 
                                        name="newPassword"
                                        placeholder="새로운 비밀번호"
                                        value={form.newPassword}
                                        onChange={handleChange}
                                    />
                                </div>

                                {/* 새 비밀번호 확인 */}
                                <div className="form-group">
                                    <label>변경할 비밀번호 확인</label>
                                    <input 
                                        type="password" 
                                        name="confirmPassword"
                                        placeholder="새로운 비밀번호 재입력"
                                        value={form.confirmPassword}
                                        onChange={handleChange}
                                    />
                                    {/* 실시간 불일치 에러 표시 */}
                                    {errors.match && <span className="error-text">{errors.match}</span>}
                                </div>

                                {errors.general && <div className="error-box">{errors.general}</div>}

                                <div className="form-actions">
                                    <button 
                                        className="btn-cancel" 
                                        onClick={() => {
                                            setIsChangeMode(false);
                                            setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
                                            setErrors({});
                                        }}
                                    >
                                        취소
                                    </button>
                                    <button 
                                        className="btn-submit" 
                                        onClick={handleSubmitPassword}
                                        disabled={!!errors.match || !form.newPassword || !form.confirmPassword}
                                    >
                                        변경 확인
                                    </button>
                                </div>
                            </div>
                        )}
                    </section>
                ) : (
                    <div className="info-card social-notice">
                        <p>🔒 소셜 로그인 사용자는 비밀번호를 변경할 수 없습니다.</p>
                    </div>
                )}

                {/* 회원 탈퇴 버튼 */}
                <div className="delete-account-zone">
                    <button 
                        className="btn-delete-account"
                        onClick={() => setShowDeleteModal(true)}
                    >
                        회원 탈퇴하기
                    </button>
                </div>
            </div>

            {/* 회원 탈퇴 모달 */}
            {showDeleteModal && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h3>정말 탈퇴하시겠습니까?</h3>
                        <p>탈퇴 시 모든 계정 정보가 삭제되며 복구할 수 없습니다.</p>
                        <div className="modal-actions">
                            <button 
                                className="btn-modal-cancel"
                                onClick={() => setShowDeleteModal(false)}
                            >
                                취소
                            </button>
                            <button 
                                className="btn-modal-confirm"
                                onClick={handleDeleteAccount}
                            >
                                탈퇴하기
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default MyInfo;