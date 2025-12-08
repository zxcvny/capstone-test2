import { useEffect, useState } from "react"
import axios from "../lib/axios";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom"; // navigate 사용을 위해 추가

export function useFavorites() {
    const { user } = useAuth();
    const navigate = useNavigate(); // navigate 훅 추가
    const [favorites, setFavorites] = useState(new Set());
    const [loading, setLoading] = useState(false);
    const [myGroups, setMyGroups] = useState([]); 
    const [targetStock, setTargetStock] = useState(null);
    const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);

    // 관심종목 불러오기
    const fetchFavorites = async () => {
        if (!user) {
            setFavorites(new Set());
            return;
        }
        setLoading(true);
        try {
            const response = await axios.get('/users/me/favorites/stocks');
            const favSet = new Set(response.data.map(item => item.code));
            setFavorites(favSet);
        } catch (error) {
            console.log("관심종목 로드 실패:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchFavorites();
    }, [user]);

    // 관심 목록 추가
    const addFavorite = (code) => {
        setFavorites(prev => {
            const newFavorite = new Set(prev);
            newFavorite.add(code);
            return newFavorite;
        });
    };

    // 관심 목록 삭제
    const removeFavorite = (code) => {
        setFavorites(prev => {
            const favorite = new Set(prev);
            favorite.delete(code);
            return favorite;
        });
    };

    // 관심 종목 토글 핸들러
    const toggleFavorite = async (e, item) => {
        e.stopPropagation();
        
        if (!user) {
            if(window.confirm("로그인이 필요한 서비스입니다.\n로그인 페이지로 이동하시겠습니까?")) navigate('/login');
            return;
        }

        // [수정] 해외주식은 symb, 국내주식은 code를 식별자로 사용
        const targetCode = item.market === "overseas" ? item.symb : item.code;
        const isFavorite = favorites.has(targetCode);

        if (isFavorite) {
            // [삭제 로직]
            if (!window.confirm("관심종목에서 삭제하시겠습니까?")) return;
            try {
                // [수정] 삭제 시 올바른 code(해외는 심볼)를 전송
                await axios.delete('/users/me/favorites/stocks', { params: { code: targetCode } });
                setFavorites(prev => { 
                    const n = new Set(prev); 
                    n.delete(targetCode); 
                    return n; 
                });
            } catch (e) { console.error(e); }
        } else {
            // [추가 로직]
            try {
                const groupRes = await axios.get('/users/me/favorites/groups');
                const groups = groupRes.data;

                // 그룹이 기본 그룹(1개) 이하인 경우 바로 추가
                if (groups.length <= 1) {
                    await addToGroup(groups[0]?.group_id, item);
                } else {
                    // 그룹이 여러 개면 모달 띄우기
                    setMyGroups(groups);
                    setTargetStock(item);
                    setIsGroupModalOpen(true);
                }
            } catch (e) { console.error(e); alert("그룹 정보를 불러오지 못했습니다."); }
        }
    };

    // 그룹에 추가
    const addToGroup = async (groupId, stockItem) => {
        try {
            const targetCode = stockItem.market === "overseas" ? stockItem.symb : stockItem.code;
            await axios.post('/users/me/favorites/stocks', {
                group_id: groupId,
                market: stockItem.market === 'domestic' ? 'domestic' : 'overseas',
                code: targetCode,
                name: stockItem.name
            });
            setFavorites(prev => { 
                const n = new Set(prev); 
                n.add(targetCode); 
                return n; 
            });
            setIsGroupModalOpen(false);
        } catch (e) {
            alert(e.response?.data?.detail || "추가 실패");
        }
    };

    return {
        favorites,
        loading,
        myGroups,
        targetStock,
        isGroupModalOpen,
        fetchFavorites,
        addFavorite,
        removeFavorite,
        toggleFavorite,
        setIsGroupModalOpen,
        addToGroup
    };
}