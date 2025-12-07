import os
import logging
from typing import List, Dict

logger = logging.getLogger(__name__)

class StockSearchService:
    def __init__(self):
        self.stocks = []
        self.stock_map = {}
        # 마스터 파일 경로 (backend/app/master)
        self.base_dir = os.path.dirname(os.path.abspath(__file__))
        self.master_dir = os.path.join(self.base_dir, "..", "..", "master")
        
        # 서버 시작 시 마스터 데이터 로드
        self.load_master_files()

    def load_master_files(self):
        """KOSPI, KOSDAQ, NASDAQ 마스터 파일을 읽어 메모리에 적재"""
        self.stocks = []
        logger.info("마스터 데이터 로딩 시작...")

        # 1. KOSPI 로드
        self._load_domestic_mst("kospi_code.mst", "KOSPI")
        
        # 2. KOSDAQ 로드
        self._load_domestic_mst("kosdaq_code.mst", "KOSDAQ")
        
        # 3. NASDAQ (해외) 로드
        self._load_overseas_mst("NASMST.COD", "NAS")

        self.stock_map = {stock['code']: stock['name'] for stock in self.stocks}

        logger.info(f"마스터 데이터 로딩 완료: 총 {len(self.stocks)}개 종목")

    def _load_domestic_mst(self, filename: str, market_code: str):
        """국내 주식 마스터 파일 파싱 (Fixed Width, CP949) - Byte Slicing 필수"""
        filepath = os.path.join(self.master_dir, filename)
        if not os.path.exists(filepath):
            logger.warning(f"마스터 파일 없음: {filepath}")
            return

        try:
            # [수정] 바이너리 모드(rb)로 읽어야 바이트 인덱싱이 정확함
            with open(filepath, "rb") as f:
                for line in f:
                    try:
                        # 국내 MST 파일 구조 (Byte 기준)
                        # 0~9: 단축코드 (예: A005930..)
                        # 21~71: 한글명 (50 bytes)
                        # 이후: ST, 증권그룹코드 등등...
                        
                        # cp949 디코딩 후 공백 제거
                        raw_code = line[0:9].decode('cp949').strip()
                        code = raw_code[:6]  # 'A' 제외하거나 앞 6자리 사용 (필요에 따라 조정)
                        if raw_code.startswith('A'):
                            code = raw_code[1:7] # 표준 단축코드(A005930 -> 005930)
                        else:
                            code = raw_code[:6]

                        # [핵심 수정] 바이트 슬라이싱 후 디코딩해야 뒤에 붙는 쓰레기값(ST...) 제거됨
                        name_part = line[21:61].decode('cp949', errors='replace').strip()
                        
                        self.stocks.append({
                            "market": market_code,
                            "code": code,
                            "name": name_part,
                            "full_code": raw_code
                        })
                    except Exception as e:
                        # 파싱 에러 발생 시 해당 라인 건너뜀
                        continue
        except Exception as e:
            logger.error(f"{filename} 로드 실패: {e}")

    def _load_overseas_mst(self, filename: str, market_code: str):
        """해외 주식 마스터 파일 파싱 (Tab Separated, CP949)"""
        filepath = os.path.join(self.master_dir, filename)
        if not os.path.exists(filepath):
            logger.warning(f"마스터 파일 없음: {filepath}")
            return

        try:
            # 해외 마스터 파일은 탭 구분자라 텍스트 모드로 읽어도 무방하지만, 
            # 인코딩 에러 방지를 위해 cp949 명시
            with open(filepath, "r", encoding="cp949", errors="ignore") as f:
                for line in f:
                    try:
                        parts = line.split('\t')
                        if len(parts) < 7: continue
                        
                        # NASMST.COD 구조: 
                        # [0]국가코드 [1]시장구분 [2]시장코드 [3]시장명 [4]심볼 [5]풀코드 [6]한글명 [7]영문명
                        code = parts[4].strip()    # 예: AAPL
                        name_kr = parts[6].strip() # 예: 애플
                        name_en = parts[7].strip() # 예: APPLE INC
                        
                        name = name_kr if name_kr else name_en
                        
                        self.stocks.append({
                            "market": market_code,
                            "code": code,
                            "name": name,      
                            "name_en": name_en 
                        })
                    except Exception:
                        continue
        except Exception as e:
            logger.error(f"{filename} 로드 실패: {e}")

    def get_stock_name(self, code: str) -> str:
        """종목 코드를 입력받아 종목명을 반환 (없으면 코드 반환)"""
        return self.stock_map.get(code, code)

    def search_stocks(self, keyword: str, limit: int = 10) -> List[Dict]:
        """
        종목명 또는 코드로 검색 (정확도 우선 -> 길이 짧은 순 정렬)
        """
        keyword = keyword.upper().strip()
        if not keyword:
            return []

        exact_matches = []
        start_matches = []
        contain_matches = []

        for stock in self.stocks:
            code = stock['code'].upper()
            name = stock['name'].upper()
            name_en = str(stock.get('name_en', '') or '').upper()

            # 1. 정확히 일치
            if keyword == code or keyword == name or keyword == name_en:
                exact_matches.append(stock)
                continue

            # 2. 시작 글자 일치
            if code.startswith(keyword) or name.startswith(keyword) or name_en.startswith(keyword):
                start_matches.append(stock)
                continue

            # 3. 중간에 포함
            if keyword in code or keyword in name or keyword in name_en:
                contain_matches.append(stock)

        # [정렬] 이름 짧은 순서대로 정렬 (관련성 높은 종목 상위 노출)
        start_matches.sort(key=lambda x: len(x['name']))
        contain_matches.sort(key=lambda x: len(x['name']))

        results = exact_matches + start_matches + contain_matches
        
        return results[:limit]

stock_search_service = StockSearchService()