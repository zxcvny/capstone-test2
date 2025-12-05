import { useEffect, useState } from "react"
import axios from "../lib/axios";

export function useAI() {
    // AI 예측 상태
    const [aiLoading, setAiLoading] = useState(false);
    const [aiResult, setAiResult] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    // AI 예측 요청
    const handleAiPredict = async (item) => {
        setAiLoading(true); setAiResult(null); setIsModalOpen(true);
        try {
            const market = item.market === 'domestic' ? 'KR' : 'NAS';
            const response = await axios.get(`/stocks/ai/predict`, { params: { market: market, code: item.code } });
            setAiResult(response.data);
        } catch (error) { setAiResult({ error: "분석에 실패했습니다." }); } 
        finally { setAiLoading(false); }
    };

    const closeModal = () => { setIsModalOpen(false); setAiResult(null); };

    return {
        aiLoading,
        aiResult,
        isModalOpen,
        handleAiPredict,
        closeModal
    };
}