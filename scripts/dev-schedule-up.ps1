# 개발 PC에서 자동 스케줄(Redis + Celery Worker + Beat) 기동
# 사용: 관리자 권한 불필요. 프로젝트 루트에서 실행 권장:
#   powershell -ExecutionPolicy Bypass -File .\scripts\dev-schedule-up.ps1

$ErrorActionPreference = "Stop"
# scripts\ 폴더 기준 상위 = 프로젝트 루트
$root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $root "app\celery_app.py"))) {
  throw "프로젝트 루트를 찾을 수 없습니다. scripts\dev-schedule-up.ps1 를 저장소 기준으로 두었는지 확인하세요."
}

Set-Location $root

$py = "python"
if (Test-Path (Join-Path $root "venv\Scripts\python.exe")) {
  $py = (Join-Path $root "venv\Scripts\python.exe")
}

$redisDir = Join-Path $root ".dev\redis"
$redisExe = Join-Path $redisDir "redis-server.exe"
$logDir = Join-Path $root "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Test-RedisPing {
  param([string]$PythonExe)
  try {
    & $PythonExe -c "import redis; r=redis.Redis(host='127.0.0.1',port=6379,db=0); print(r.ping())" 2>$null
    return $LASTEXITCODE -eq 0
  } catch { return $false }
}

if (-not (Test-RedisPing -PythonExe $py)) {
  if (-not (Test-Path $redisExe)) {
    Write-Host "Redis 바이너리 없음. 포터블 Redis를 내려받습니다..."
    New-Item -ItemType Directory -Force -Path $redisDir | Out-Null
    $zip = Join-Path $redisDir "redis.zip"
    Invoke-WebRequest -Uri "https://github.com/tporadowski/redis/releases/download/v5.0.14.1/Redis-x64-5.0.14.1.zip" -OutFile $zip -UseBasicParsing
    Expand-Archive -Path $zip -DestinationPath $redisDir -Force
  }
  Write-Host "Redis 시작..."
  Start-Process -FilePath $redisExe -WorkingDirectory $redisDir -WindowStyle Hidden
  Start-Sleep -Seconds 2
}

if (-not (Test-RedisPing -PythonExe $py)) {
  throw "Redis(127.0.0.1:6379)에 연결할 수 없습니다. 방화벽·포트를 확인하세요."
}

$wOut = Join-Path $logDir "celery-worker.out.log"
$wErr = Join-Path $logDir "celery-worker.err.log"
$bOut = Join-Path $logDir "celery-beat.out.log"
$bErr = Join-Path $logDir "celery-beat.err.log"

Write-Host "Celery Worker 시작..."
Start-Process -FilePath $py -ArgumentList @(
  "-m", "celery", "-A", "app.celery_app:celery_app", "worker", "--pool=solo", "--loglevel=info"
) -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $wOut -RedirectStandardError $wErr

Write-Host "Celery Beat 시작..."
Start-Process -FilePath $py -ArgumentList @(
  "-m", "celery", "-A", "app.celery_app:celery_app", "beat", "--loglevel=info"
) -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $bOut -RedirectStandardError $bErr

Start-Sleep -Seconds 3
& $py -m celery -A app.celery_app:celery_app inspect ping
Write-Host "완료. 로그: $logDir"
