// src/utils/formatters.jsx
import { FaCaretUp, FaCaretDown, FaMinus } from "react-icons/fa";

/**
 * 숫자 포맷팅 (콤마 추가)
 */
export const formatNumber = (num) => {
    if (num === null || num === undefined || num === '') return '-';
    return Number(num).toLocaleString();
};

/**
 * 금액 포맷팅 (조, 억 단위 변환)
 */
export const formatAmount = (num) => {
    if (num === null || num === undefined) return '-';
    const val = Number(num);
    if (val >= 1_000_000_000_000) {
        return `${(val / 1_000_000_000_000).toFixed(2)}조`;
    }
    if (val >= 100_000_000) {
        return `${(val / 100_000_000).toFixed(0)}억`;
    }
    return `${Math.floor(val).toLocaleString()}원`;
};

/**
 * 가격 포맷팅 (소수점 버림 및 콤마)
 */
export const formatPrice = (num) => {
    if (!num) return '-';
    const value = Math.floor(Number(num));
    return `${value.toLocaleString()}원`;
};

/**
 * [추가] 등락률에 따른 CSS 클래스명 반환
 */
export const getRateClass = (rate) => {
    const val = Number(rate);
    if (val > 0) return "text-up";
    if (val < 0) return "text-down";
    return "text-flat";
};

export const formatHMS = (hms) => {
    if (!hms || hms.length !== 6) return hms;
    return `${hms.slice(0,2)}:${hms.slice(2,4)}:${hms.slice(4,6)}`;
};

/**
 * 등락률 렌더링 (JSX 반환)
 */
export const renderRate = (rate) => {
    const val = Number(rate);
    if (val > 0) {
        return <span className={`rate-cell ${getRateClass(val)}`}><FaCaretUp /> {val.toFixed(2)}%</span>;
    } else if (val < 0) {
        return <span className={`rate-cell ${getRateClass(val)}`}><FaCaretDown /> {Math.abs(val).toFixed(2)}%</span>;
    } else {
        return <span className={`rate-cell ${getRateClass(val)}`}><FaMinus style={{ fontSize: '10px' }} /> 0.00%</span>;
    }
};