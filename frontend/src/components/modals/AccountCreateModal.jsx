import { useState } from 'react';
import { FaTimes } from "react-icons/fa";
import '../../styles/Home.css';

function AccountCreateModal({ isOpen, onClose, handleCreateAccount }) {
    if (!isOpen) return null;

    const [agreed, setAgreed] = useState(false);

    const onConfirm = () => {
        if (agreed) {
            handleCreateAccount();
            setAgreed(false);
        }
    };

    return (
        <div className="ai-modal-overlay" onClick={onClose}>
            <div className="ai-modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px', textAlign: 'left' }}>
                <button className="ai-close-btn" onClick={onClose}><FaTimes /></button>
                
                <h3 style={{ textAlign: 'center', marginBottom: '24px', fontSize: '22px' }}>🚀 모의투자 계좌 개설</h3>
                
                <div className="terms-box" style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.05)', 
                    padding: '20px', 
                    borderRadius: '12px', 
                    height: '240px', 
                    overflowY: 'auto',
                    marginBottom: '20px',
                    fontSize: '14px',
                    color: '#d1d4dc',
                    lineHeight: '1.6',
                    border: '1px solid var(--color-border)'
                }}>
                    <h4 style={{ color: 'var(--color-primary)', marginBottom: '8px' }}>제 1조 (목적)</h4>
                    <p>본 약관은 Zero to Mars(이하 "회사")가 제공하는 가상 모의투자 서비스 이용에 관한 제반 사항을 규정함을 목적으로 합니다.</p>
                    <br/>
                    
                    <h4 style={{ color: 'var(--color-primary)', marginBottom: '8px' }}>제 2조 (가상 자산)</h4>
                    <p>1. 계좌 개설 시 지급되는 <strong>1,000만원</strong>은 실제 현금이 아닌 사이버 머니입니다.</p>
                    <p>2. 해당 자산은 현금으로 출금할 수 없으며, 오직 화성 갈 끄니까 종목 매수에만 사용할 수 있습니다.</p>
                    <br/>
                    
                    <h4 style={{ color: 'var(--color-primary)', marginBottom: '8px' }}>제 3조 (면책 조항)</h4>
                    <p>1. 모의투자의 결과가 실제 투자의 수익을 보장하지 않습니다.</p>
                    <p>2. 주가 하락으로 인한 멘탈 붕괴에 대해 회사는 책임지지 않습니다.</p>
                    <br/>
                    <p style={{ textAlign: 'center', color: '#888' }}>- Zero to Mars 우주투자청 -</p>
                </div>

                <label className="checkbox-label" style={{
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '10px', 
                    cursor: 'pointer', 
                    marginBottom: '24px', 
                    justifyContent: 'center',
                    padding: '10px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(255, 255, 255, 0.02)'
                }}>
                    <input 
                        type="checkbox" 
                        checked={agreed} 
                        onChange={(e) => setAgreed(e.target.checked)}
                        style={{ accentColor: 'var(--color-primary)', width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                    <span style={{ color: '#fff', fontSize: '15px' }}>위 약관을 모두 읽었으며 이에 동의합니다.</span>
                </label>
                
                <button 
                    className="modal-confirm-btn" 
                    onClick={onConfirm}
                    disabled={!agreed}
                    style={{
                        width: '100%', 
                        padding: '16px',
                        fontSize: '16px',
                        opacity: agreed ? 1 : 0.5, 
                        cursor: agreed ? 'pointer' : 'not-allowed',
                        backgroundColor: agreed ? 'var(--color-primary)' : '#555',
                        border: 'none',
                        color: 'white',
                        fontWeight: 'bold',
                        borderRadius: '8px'
                    }}
                >
                    계좌 개설하고 1,000만원 받기
                </button>
            </div>
        </div>
    )
}

export default AccountCreateModal;