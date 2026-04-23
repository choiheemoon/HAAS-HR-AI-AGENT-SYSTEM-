# 개발용 Redis / Celery Worker·Beat 중지 (Windows)
# 주의: 이름에 celery가 들어간 다른 Python 프로세스도 종료될 수 있으니, 다른 작업 중이면 수동으로 종료하세요.

Get-Process -Name "redis-server" -ErrorAction SilentlyContinue | Stop-Process -Force

Get-CimInstance Win32_Process -Filter "Name = 'python.exe'" |
  Where-Object { $_.CommandLine -match "celery" -and $_.CommandLine -match "app\.celery_app" } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

Write-Host "redis-server 및 Celery 관련 python 프로세스 종료 시도 완료."
