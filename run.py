"""애플리케이션 실행 스크립트"""
import uvicorn
from app.config import settings

if __name__ == "__main__":
    # Windows에서 reload 모드가 문제를 일으킬 수 있으므로 비활성화
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=False  # Windows에서 안정성을 위해 비활성화
    )
