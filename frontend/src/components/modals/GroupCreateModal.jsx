import { FaTimes } from "react-icons/fa";

function GroupCreateModal({ isOpen, setIsCreateGroupModalOpen, newGroupName, setNewGroupName, handleCreateGroup}) {
    if (!isOpen) return null;
    
    return (
        <div className="ai-modal-overlay" onClick={() => setIsCreateGroupModalOpen(false)}>
            <div className="ai-modal-content group-select-modal" onClick={(e) => e.stopPropagation()}>
                <button className="ai-close-btn" onClick={() => setIsCreateGroupModalOpen(false)}><FaTimes /></button>
                <h3 className="modal-title">새 그룹 만들기</h3>
                <p className="modal-desc">새로운 관심 그룹의 이름을 입력하세요.</p>
                <input 
                    type="text" 
                    className="modal-input" 
                    placeholder="예: 반도체, 2차전지" 
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCreateGroup()}
                    autoFocus
                />
                <div className="modal-btn-group">
                    <button className="modal-confirm-btn" onClick={handleCreateGroup}>생성하기</button>
                </div>
            </div>
        </div>
    )
}

export default GroupCreateModal