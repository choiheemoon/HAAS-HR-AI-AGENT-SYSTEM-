# 프론트엔드 실행 가이드

## 빠른 시작

### 1. 프론트엔드 디렉토리로 이동
```bash
cd frontend
```

### 2. 개발 서버 실행
```bash
npm run dev
```

### 3. 브라우저에서 접속
http://localhost:3000

## 주의사항

1. **백엔드 서버가 실행 중이어야 합니다**
   - 백엔드가 `http://localhost:8000`에서 실행 중이어야 API가 정상 작동합니다
   - 백엔드 실행: 프로젝트 루트에서 `python run.py`

2. **환경 변수 설정 (선택사항)**
   - `frontend/.env.local` 파일을 생성하여 API URL을 변경할 수 있습니다
   ```
   NEXT_PUBLIC_API_URL=http://localhost:8000
   ```

## 주요 페이지

- **대시보드**: http://localhost:3000
- **직원 관리**: http://localhost:3000/employees
- **채용 관리**: http://localhost:3000/recruitment
- **근태관리**: http://localhost:3000/attendance
- **급여 관리**: http://localhost:3000/payroll
- **급여명세서**: http://localhost:3000/payslip
- **인사리포트**: http://localhost:3000/reports
- **세금 관리**: http://localhost:3000/tax

## 문제 해결

### 포트가 이미 사용 중인 경우
다른 포트로 실행:
```bash
npm run dev -- -p 3001
```

### API 연결 오류
- 백엔드 서버가 실행 중인지 확인
- `frontend/.env.local`에서 API URL 확인
