import { useState, useCallback } from "react"
import axios from "../lib/axios";

export function useAI() {
    // AI 예측 상태
    const [aiLoading, setAiLoading] = useState(false);
    const [aiResult, setAiResult] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    // [유지] 홈/리스트에서 버튼 클릭 시 사용 (모달 열기 + 데이터 조회)
    const handleAiPredict = async (item) => {
        setAiLoading(true); 
        setAiResult(null); 
        setIsModalOpen(true);
        try {
            const market = (item.market === 'domestic' || item.market === 'KR') ? 'KR' : 'NAS';
            const response = await axios.get(`/stocks/ai/predict`, { params: { market: market, code: item.code } });
            setAiResult(response.data);
        } catch (error) { 
            setAiResult({ error: "분석에 실패했습니다." }); 
        } finally { 
            setAiLoading(false); 
        }
    };

    // [추가] 상세 페이지 진입 시 자동 조회용 (모달 안 염, 데이터만 조회)
    const fetchAiPrediction = useCallback(async (market, code) => {
        if (!code) return;
        setAiLoading(true);
        // 기존 결과가 있으면 잠깐 유지해도 됨 (깜빡임 방지)
        try {
            const targetMarket = (market === 'domestic' || market === 'KR') ? 'KR' : 'NAS';
            const response = await axios.get(`/stocks/ai/predict`, { 
                params: { market: targetMarket, code: code } 
            });
            setAiResult(response.data);
        } catch (error) {
            console.error("AI Fetch Error:", error);
            setAiResult({ error: "분석 실패" });
        } finally {
            setAiLoading(false);
        }
    }, []);

    const openModal = () => setIsModalOpen(true);
    
    // [수정] 모달을 닫아도 상세페이지의 배지(결과)는 유지되어야 하므로 setAiResult(null) 제거
    const closeModal = () => { 
        setIsModalOpen(false); 
    };

    return {
        aiLoading,
        aiResult,
        isModalOpen,
        handleAiPredict,   // 홈/리스트용 (버튼 클릭)
        fetchAiPrediction, // 상세페이지용 (자동 조회)
        openModal,         // 상세페이지 배지 클릭 시 모달 열기
        closeModal
    };
}