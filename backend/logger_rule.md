## logging 규칙
```python
import logging
logger = logging.getLogger(__name__)
```
``` python
logger.info("✅ FastAPI 앱이 시작됩니다.")
```
### INFO (`logger.info`)
✅: 일반적인 실행 정보, 정상 동작 메시지  
🔑: 외부 API 키 발급 동작 메시지
💡: 시도

### WARNING (`logger.warning`)
⚠️: 예상 가능한 문제 상황, 심각하지 않지만 주의가 필요한 상태

### ERROR (`logger.error`)
⛔: 요청 실패, 처리가 중단된 경우, 예외 발생