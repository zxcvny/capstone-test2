import { useEffect, useRef } from "react";
import { FaChartArea } from "react-icons/fa";
import { createChart, ColorType, CandlestickSeries, LineSeries, HistogramSeries, CrosshairMode } from 'lightweight-charts';

function StockChart({ 
    chartData, realtimeData, chartPeriod, setChartPeriod, 
    chartType, setChartType 
}) {
    const chartContainerRef = useRef(null);
    const chartInstance = useRef(null);
    const mainSeriesRef = useRef(null);
    const volumeSeriesRef = useRef(null);
    const lastCandleRef = useRef(null);

    // 1. 차트 초기화 및 생성
    useEffect(() => {
        if (!chartContainerRef.current) return;

        if (chartInstance.current) {
            chartInstance.current.remove();
            mainSeriesRef.current = null;
            volumeSeriesRef.current = null;
        }

        const isIntraday = chartPeriod.includes('m');

        const chart = createChart(chartContainerRef.current, {
            layout: { 
                background: { type: ColorType.Solid, color: '#1e222d' },
                textColor: '#d1d4dc',
            },
            width: chartContainerRef.current.clientWidth,
            height: 350,
            grid: { vertLines: { color: '#2B2B43' }, horzLines: { color: '#2B2B43' } },
            rightPriceScale: { borderVisible: false, borderColor: '#2B2B43' },
            timeScale: { 
                borderVisible: false, borderColor: '#2B2B43',
                timeVisible: isIntraday, secondsVisible: false,
            },
            crosshair: { mode: CrosshairMode.Normal }, 
            localization: { 
                timeFormatter: (timestamp) => {
                    if (typeof timestamp === 'string') return timestamp;
                    const date = new Date(timestamp * 1000);
                    return date.toLocaleTimeString('ko-KR', { 
                        hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' 
                    });
                },
                dateFormat: 'yyyy-MM-dd' 
            }
        });

        chartInstance.current = chart;

        let mainSeries;
        if (chartType === 'candle') {
            mainSeries = chart.addSeries(CandlestickSeries, {
                upColor: '#ef5350', downColor: '#26a69a',
                borderVisible: false, wickUpColor: '#ef5350', wickDownColor: '#26a69a',
            });
            mainSeries.setData(chartData);
        } else {
            mainSeries = chart.addSeries(LineSeries, { color: '#2962FF', lineWidth: 2 });
            const lineData = chartData.map(d => ({ time: d.time, value: d.close }));
            mainSeries.setData(lineData);
        }
        mainSeriesRef.current = mainSeries;

        const volSeries = chart.addSeries(HistogramSeries, {
            color: '#26a69a', priceFormat: { type: 'volume' }, priceScaleId: '', 
        });
        volumeSeriesRef.current = volSeries;

        chart.priceScale('').applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });

        if (chartData.length > 0) {
            const volData = chartData.map(d => ({ time: d.time, value: d.value, color: d.color }));
            volSeries.setData(volData);
            chart.timeScale().fitContent();
            lastCandleRef.current = chartData[chartData.length - 1];
        }

        const handleResize = () => {
            if (chartContainerRef.current) chart.applyOptions({ width: chartContainerRef.current.clientWidth });
        };
        window.addEventListener('resize', handleResize);
        
        return () => {
            window.removeEventListener('resize', handleResize);
            chart.remove();
            chartInstance.current = null;
        };
    }, [chartData, chartType, chartPeriod]);

    // 2. 실시간 데이터 업데이트 (Realtime Update)
    useEffect(() => {
        if (!realtimeData || !mainSeriesRef.current) return;

        const currentPrice = Number(realtimeData.price);
        const currentVol = Number(realtimeData.volume);
        
        let lastCandle = lastCandleRef.current;
        
        // 차트 데이터가 없으면 기존 state에서 가져오기
        if (!lastCandle && chartData.length > 0) {
            lastCandle = chartData[chartData.length - 1];
        }
        
        if (!lastCandle) return;

        // [중요] 데이터 타입 불일치 방지 (일봉<->분봉 전환 시점의 에러 방지)
        const isIntraday = chartPeriod.includes('m');
        const isLastCandleNumber = typeof lastCandle.time === 'number';
        
        // 분봉 모드인데 마지막 캔들이 날짜 문자열(일봉 데이터)인 경우 -> 무시
        if (isIntraday && !isLastCandleNumber) return;
        // 일봉 모드인데 마지막 캔들이 숫자(분봉 데이터)인 경우 -> 무시
        if (!isIntraday && isLastCandleNumber) return;

        let targetTime = null;

        if (!isIntraday) {
            // 일/주/월봉: 날짜 문자열 처리
            if (chartPeriod === 'D') {
                const today = new Date();
                // YYYY-MM-DD 포맷
                targetTime = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
            } else {
                targetTime = lastCandle.time;
            }
        } else {
            // 분봉: 타임스탬프 처리
            const now = new Date();
            const currentTimestamp = Math.floor(now.getTime() / 1000); // 초 단위 타임스탬프
            const intervalMin = parseInt(chartPeriod.replace('m', ''));
            const intervalSec = intervalMin * 60;
            const lastTime = lastCandle.time; // 여기서 숫자여야 함

            // 현재 시간이 마지막 캔들 시간 + 간격보다 작으면 현재 캔들 업데이트
            if (currentTimestamp < lastTime + intervalSec) {
                targetTime = lastTime; 
            } else {
                // 아니면 새로운 캔들 시간 생성
                targetTime = lastTime + intervalSec;
            }
        }

        let updatedCandle = null;
        if (lastCandle.time === targetTime) {
            updatedCandle = {
                ...lastCandle,
                high: Math.max(lastCandle.high, currentPrice),
                low: Math.min(lastCandle.low, currentPrice),
                close: currentPrice,
                value: currentVol,
                color: currentPrice >= lastCandle.open ? '#ef5350' : '#26a69a'
            };
        } else {
            updatedCandle = {
                time: targetTime, open: currentPrice, high: currentPrice,
                low: currentPrice, close: currentPrice, value: currentVol, color: '#ef5350'
            };
        }

        if (chartType === 'candle') mainSeriesRef.current.update(updatedCandle);
        else mainSeriesRef.current.update({ time: targetTime, value: currentPrice });
        
        volumeSeriesRef.current.update({ time: targetTime, value: currentVol, color: updatedCandle.color });
        lastCandleRef.current = updatedCandle;

    }, [realtimeData, chartPeriod, chartType, chartData]);

    return (
        <div className="chart-card">
            <div className="card-header-sm">
                <span className="card-title"><FaChartArea /> 차트</span>
                <div className="chart-controls">
                    <div className="chart-type-toggle">
                        <button onClick={() => setChartType('candle')} className={chartType === 'candle' ? 'active' : ''}>봉</button>
                        <button onClick={() => setChartType('line')} className={chartType === 'line' ? 'active' : ''}>라인</button>
                    </div>
                    <select className="chart-select" value={chartPeriod.includes('m') ? chartPeriod : 'custom'} onChange={(e) => setChartPeriod(e.target.value)}>
                        <option value="1m">1분봉</option>
                        <option value="5m">5분봉</option>
                        <option value="10m">10분봉</option>
                        <option value="30m">30분봉</option>
                        <option value="custom" disabled hidden>분봉 선택</option>
                    </select>
                    <div className="chart-tabs">
                        <button className={chartPeriod === 'D' ? 'active' : ''} onClick={() => setChartPeriod('D')}>일</button>
                        <button className={chartPeriod === 'W' ? 'active' : ''} onClick={() => setChartPeriod('W')}>주</button>
                        <button className={chartPeriod === 'M' ? 'active' : ''} onClick={() => setChartPeriod('M')}>월</button>
                        <button className={chartPeriod === 'Y' ? 'active' : ''} onClick={() => setChartPeriod('Y')}>년</button>
                    </div>
                </div>
            </div>
            <div ref={chartContainerRef} className="chart-container" style={{ position: 'relative', width: '100%', height: '350px' }} />
        </div>
    );
}

export default StockChart;