# 빠른 시작 가이드

## 1. 환경 설정

### 필수 요구사항
- Python 3.11 이상
- PostgreSQL 데이터베이스
- OpenAI API 키 (AI 기능 사용 시)

### 설치

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

## 2. 환경 변수 설정

`.env` 파일을 생성하고 다음 내용을 설정하세요:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/hr_ai_agent
OPENAI_API_KEY=your_openai_api_key_here
SECRET_KEY=your_secret_key_here
```

## 3. 데이터베이스 설정

```bash
# 데이터베이스 마이그레이션
alembic upgrade head
```

## 4. 서버 실행

```bash
# 방법 1: run.py 사용
python run.py

# 방법 2: uvicorn 직접 사용
uvicorn app.main:app --reload
```

서버가 실행되면 다음 URL에서 API 문서를 확인할 수 있습니다:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## 5. 주요 API 엔드포인트

### 채용 (Recruitment)
- `POST /api/v1/recruitment/job-postings` - 채용 공고 생성
- `POST /api/v1/recruitment/job-postings/{id}/applications` - 지원서 생성

### 기준정보 (Master Data)
- `POST /api/v1/employees/` - 직원 정보 생성
- `GET /api/v1/employees/{id}` - 직원 정보 조회
- `PUT /api/v1/employees/{id}` - 직원 정보 수정

### 근태관리 (Attendance)
- `POST /api/v1/attendance/check-in/{employee_id}` - 출근 기록
- `POST /api/v1/attendance/check-out/{employee_id}` - 퇴근 기록
- `POST /api/v1/attendance/leaves` - 휴가 신청

### 급여 (Payroll)
- `POST /api/v1/payroll/calculate` - 급여 계산
- `POST /api/v1/payroll/{id}/approve` - 급여 승인

### 급여명세서 (Payslip)
- `POST /api/v1/payslip/generate/{payroll_id}` - 급여명세서 생성
- `GET /api/v1/payslip/{id}` - 급여명세서 조회

### 인사리포트 (Reports)
- `GET /api/v1/reports/dashboard` - 대시보드 데이터
- `GET /api/v1/reports/turnover` - 이직률 분석

### 세금 (Tax)
- `POST /api/v1/tax/withholding/{payroll_id}` - 원천세 계산
- `POST /api/v1/tax/year-end/{employee_id}` - 연말정산 계산

## 6. 다음 단계

1. 데이터베이스에 실제 데이터 입력
2. OpenAI API 키 설정 (AI 기능 사용)
3. 이메일 서버 설정 (알림 기능)
4. 파일 저장소 설정 (S3 또는 로컬)
5. 프로덕션 환경 설정

## 문제 해결

### 데이터베이스 연결 오류
- PostgreSQL이 실행 중인지 확인
- DATABASE_URL이 올바른지 확인

### OpenAI API 오류
- OPENAI_API_KEY가 올바르게 설정되었는지 확인
- API 키에 충분한 크레딧이 있는지 확인

### 모듈 import 오류
- 가상환경이 활성화되었는지 확인
- 모든 의존성이 설치되었는지 확인 (`pip install -r requirements.txt`)
