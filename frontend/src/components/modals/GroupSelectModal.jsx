import { FaTimes } from "react-icons/fa";
import '../../styles/Home.css'; // 스타일 파일 확인

function GroupCreateModal({ isOpen, setIsCreateGroupModalOpen, newGroupName, setNewGroupName, handleCreateGroup }) {
    if (!isOpen) return null;
    
    // 모달 닫기 핸들러
    const handleClose = () => {
        setIsCreateGroupModalOpen(false);
        setNewGroupName(""); // 입력창 초기화 (선택 사항)
    };

    return (
        <div className="ai-modal-overlay" onClick={handleClose}>
            <div className="ai-modal-content group-select-modal" onClick={(e) => e.stopPropagation()}>
                <button className="ai-close-btn" onClick={handleClose}>
                    <FaTimes />
                </button>
                
                <h3 className="modal-title">새 그룹 만들기</h3>
                <p className="modal-desc">
                    관심 종목을 분류할<br />새로운 그룹의 이름을 입력해주세요.
                </p>
                
                <input 
                    type="text" 
                    className="modal-input" 
                    placeholder="예: 반도체, 2차전지, 배당주" 
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCreateGroup()}
                    autoFocus
                />
                
                <div className="modal-btn-group">
                    {/* 취소 버튼 추가 */}
                    <button className="modal-cancel-btn" onClick={handleClose}>
                        취소
                    </button>
                    {/* 생성 버튼 */}
                    <button className="modal-confirm-btn" onClick={handleCreateGroup}>
                        생성하기
                    </button>
                </div>
            </div>
        </div>
    )
}

export default GroupCreateModal;