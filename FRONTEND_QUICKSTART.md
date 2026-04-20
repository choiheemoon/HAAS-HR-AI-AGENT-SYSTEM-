# 프론트엔드 실행 가이드

## 🚀 빠른 시작

### 1단계: 프론트엔드 디렉토리로 이동
```bash
cd frontend
```

### 2단계: 의존성 패키지 설치 (최초 1회만)
```bash
npm install
```

### 3단계: 개발 서버 실행
```bash
npm run dev
```

### 4단계: 브라우저에서 접속
```
http://localhost:3000
```

## 📋 전체 실행 순서

### Windows PowerShell에서:
```powershell
# 1. 프로젝트 루트에서
cd frontend

# 2. 패키지 설치 (처음 한 번만)
npm install

# 3. 개발 서버 실행
npm run dev
```

### 결과:
```
  ▲ Next.js 14.0.4
  - Local:        http://localhost:3000
  - Ready in 2.3s
```

## ⚠️ 주의사항

### 1. 백엔드 서버가 실행 중이어야 합니다
- 프론트엔드는 백엔드 API(`http://localhost:8000`)와 통신합니다
- 백엔드 실행 방법:
  ```bash
  # 프로젝트 루트에서
  python run.py
  ```

### 2. Node.js가 설치되어 있어야 합니다
- Node.js 버전: 18.x 이상 권장
- 확인 방법:
  ```bash
  node --version
  npm --version
  ```

## 🔧 환경 변수 설정 (선택사항)

`frontend/.env.local` 파일을 생성하여 API URL을 변경할 수 있습니다:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

기본값은 `http://localhost:8000`입니다.

## 📱 주요 페이지

- **로그인**: http://localhost:3000/login
- **회원가입**: http://localhost:3000/register
- **대시보드**: http://localhost:3000
- **직원 관리**: http://localhost:3000/employees
- **채용 관리**: http://localhost:3000/recruitment
- **근태관리**: http://localhost:3000/attendance
- **급여 관리**: http://localhost:3000/payroll
- **급여명세서**: http://localhost:3000/payslip
- **인사리포트**: http://localhost:3000/reports
- **세금 관리**: http://localhost:3000/tax
- **AI 채팅**: http://localhost:3000/chat

## 🛠️ 문제 해결

### 포트 3000이 이미 사용 중인 경우
다른 포트로 실행:
```bash
npm run dev -- -p 3001
```

### npm install 오류
```bash
# 캐시 삭제 후 재설치
npm cache clean --force
npm install
```

### API 연결 오류
1. 백엔드 서버가 실행 중인지 확인
2. `http://localhost:8000/health` 접속하여 확인
3. `frontend/.env.local`에서 API URL 확인

### 컴파일 오류
```bash
# node_modules 삭제 후 재설치
rm -rf node_modules
npm install
```

## 📦 프로덕션 빌드

### 빌드
```bash
npm run build
```

### 프로덕션 서버 실행
```bash
npm start
```

## 🎯 개발 팁

- **Hot Reload**: 파일 수정 시 자동으로 새로고침됩니다
- **에러 표시**: 브라우저 콘솔에서 오류 확인 가능
- **API 테스트**: Swagger UI에서 `http://localhost:8000/docs` 접속
