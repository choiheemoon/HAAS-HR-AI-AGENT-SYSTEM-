# HR AI Agent System

종합 인사관리 및 급여관리 AI 에이전트 시스템

## 주요 기능

### 1. 채용 (Recruitment)
- 채용 요청/공고 작성·승인
- 지원자 추적과 이력서 파싱 (ATS)
- 후보자 검색과 AI 소싱
- 지원자 커뮤니케이션 자동화
- 지원자 평가 및 서류 관리
- 제안서 발행과 전자 서명

### 2. 기준정보입력 (Master Data Entry)
- 통합 인사 데이터 관리
- 표준화된 데이터 모델
- 실시간 동기화 및 API 통합
- 데이터 입력 검증과 거버넌스
- 감사 추적 및 변경 이력 관리
- 직원 셀프서비스
- 문서 관리

### 3. 근태관리 (Time & Attendance Management)
- 다양한 출퇴근 기록 방법
- GPS 지오펜싱
- 타임시트 및 프로젝트별 시간관리
- 휴가 및 연차 관리
- 스케줄링 도구
- 캘린더 통합과 알림
- 근태 보고 및 분석
- 급여/회계 연동

### 4. 급여계산 (Payroll Calculation)
- 급여 자동 계산
- 급여세 자동 공제 및 납부
- 다양한 급여 요소 관리
- 근태데이터 연동
- 지역별 규정 지원
- 승인·지급 일정 관리
- 회계 통합

### 5. 급여명세서 발급 (Payslip Issuance)
- 전자급여명세서 생성·배포
- 사용자 친화적 UI
- 보안 기능
- 세금공제 자동 반영
- 시스템 통합
- 자동 공개 및 저장
- 법규 준수 도구

### 6. 인사리포트 (HR Reports)
- 맞춤 대시보드·리포트
- 실시간 데이터와 예측 분석
- 핵심 HR 지표 제공
- 커스텀 리포트 생성 및 스케줄링
- 규정 보고
- 자연어 검색 및 대화형 분석

### 7. 세금계산 (Tax Calculation)
- 원천세 자동 계산 및 신고
- 다양한 세목 처리
- 연말정산·세금신고 지원
- 다지역·다국가 세금 처리
- 규정 업데이트 및 컴플라이언스 알림
- 세무 보고와 감사 대비

## 기술 스택

- **Backend**: FastAPI, Python 3.11+
- **Database**: PostgreSQL
- **AI/ML**: LangChain, OpenAI GPT-4
- **Frontend**: React/Next.js (별도 저장소)
- **Authentication**: JWT
- **File Storage**: Local/S3

## 설치 및 실행

### 1. 환경 설정

```bash
# 가상환경 생성
python -m venv venv

# 가상환경 활성화 (Windows)
venv\Scripts\activate

# 가상환경 활성화 (Linux/Mac)
source venv/bin/activate

# 의존성 설치
pip install -r requirements.txt
```

### 2. 환경 변수 설정

```bash
# .env.example을 복사하여 .env 파일 생성
cp .env.example .env
# (Windows PowerShell)
copy .env.example .env

# .env 파일을 편집하여 필요한 값 설정
# 특히 OPENAI_API_KEY와 DATABASE_URL을 설정해야 합니다
```

### 3. 데이터베이스 설정

```bash
# 데이터베이스 마이그레이션
alembic upgrade head
```

### 4. 서버 실행

```bash
# 개발 서버 실행
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## API 문서

서버 실행 후 다음 URL에서 API 문서를 확인할 수 있습니다:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## 프로젝트 구조

```
.
├── app/
│   ├── __init__.py
│   ├── main.py                 # FastAPI 메인 애플리케이션
│   ├── config.py               # 설정 관리
│   ├── database.py             # 데이터베이스 연결
│   ├── models/                 # SQLAlchemy 모델
│   ├── schemas/                # Pydantic 스키마
│   ├── api/                    # API 라우터
│   ├── core/                   # 핵심 비즈니스 로직
│   │   ├── ai_agent.py         # AI Agent 핵심
│   │   └── agents/             # 각 기능별 AI Agent
│   ├── services/               # 서비스 레이어
│   │   ├── recruitment/        # 채용 서비스
│   │   ├── master_data/        # 기준정보 서비스
│   │   ├── attendance/         # 근태관리 서비스
│   │   ├── payroll/            # 급여계산 서비스
│   │   ├── payslip/            # 급여명세서 서비스
│   │   ├── reports/            # 인사리포트 서비스
│   │   └── tax/                # 세금계산 서비스
│   └── utils/                  # 유틸리티 함수
├── alembic/                    # 데이터베이스 마이그레이션
├── tests/                      # 테스트 코드
├── storage/                    # 파일 저장소
├── requirements.txt
├── .env.example
└── README.md
```

## 라이선스

MIT License
