import { useEffect, useState } from "react"
import axios from "../lib/axios";
import { useAuth } from "../context/AuthContext";

export function useFavorites() {
    const { user } = useAuth();
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

        const isFavorite = favorites.has(item.market === "overseas" ? item.symb : item.code);

        if (isFavorite) {
            if (!window.confirm("관심종목에서 삭제하시겠습니까?")) return;
            try {
                await axios.delete('/users/me/favorites/stocks', { params: { code: item.code } });
                setFavorites(prev => { const n = new Set(prev); n.delete(item.market === "overseas" ? item.symb : item.code); return n; });
            } catch (e) { console.error(e); }
        } else {
            try {
                const groupRes = await axios.get('/users/me/favorites/groups');
                const groups = groupRes.data;

                if (groups.length <= 1) {
                    await addToGroup(groups[0]?.group_id, item);
                } else {
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
            await axios.post('/users/me/favorites/stocks', {
                group_id: groupId,
                market: stockItem.market === 'domestic' ? 'domestic' : 'overseas',
                code: stockItem.market === "overseas" ? stockItem.symb : stockItem.code,
                name: stockItem.name
            });
            setFavorites(prev => { const n = new Set(prev); n.add(stockItem.market === "overseas" ? stockItem.symb : stockItem.code); return n; });
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