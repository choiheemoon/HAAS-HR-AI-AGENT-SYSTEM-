"""애플리케이션 실행 스크립트"""
import uvicorn
from app.config import settings

if __name__ == "__main__":
    # 백엔드 파일 수정 시 자동 재시작(Hot Reload)
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=True,
        reload_dirs=["app"],
    )
