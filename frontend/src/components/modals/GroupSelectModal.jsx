import { FaTimes, FaFolder } from "react-icons/fa";
import '../../styles/AIModal.css'; // 모달 스타일 사용

function GroupSelectModal({ isOpen, setIsGroupModalOpen, myGroups, targetStock, addToGroup }) {
    if (!isOpen) return null;

    return (
        <div className="ai-modal-overlay" onClick={setIsGroupModalOpen}>
            <div className="ai-modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px' }}>
                <button className="ai-close-btn" onClick={setIsGroupModalOpen}>
                    <FaTimes />
                </button>
                
                <h3 className="modal-title" style={{ marginBottom: '10px' }}>관심 그룹 선택</h3>
                <p className="modal-desc" style={{ marginBottom: '20px' }}>
                    <span style={{ fontWeight: 'bold', color: '#fff' }}>{targetStock?.name}</span>을(를)<br/>
                    어느 그룹에 추가하시겠습니까?
                </p>

                <div className="group-select-list" style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '300px', overflowY: 'auto' }}>
                    {myGroups.map((group) => (
                        <button 
                            key={group.group_id}
                            className="group-select-item"
                            onClick={() => addToGroup(group.group_id)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                width: '100%',
                                padding: '15px',
                                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                borderRadius: '12px',
                                color: 'var(--color-text-primary)',
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                            }}
                            onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'}
                            onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)'}
                        >
                            <FaFolder style={{ color: '#ffd700' }} />
                            <span style={{ fontSize: '15px' }}>{group.name}</span>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

export default GroupSelectModal;