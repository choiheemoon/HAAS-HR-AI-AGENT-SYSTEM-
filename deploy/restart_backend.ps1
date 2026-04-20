# HR AI Agent — 백엔드(8000) 점유 해제 후 run.py 실행
$ErrorActionPreference = 'SilentlyContinue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host '[1/2] 포트 8000 LISTEN 프로세스 종료...'
$conns = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
if ($conns) {
  $conns | ForEach-Object {
    $procId = $_.OwningProcess
    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    Write-Host "  PID $procId 종료"
  }
} else {
  netstat -ano | Select-String ':8000.*LISTENING' | ForEach-Object {
    $parts = $_.Line -split '\s+' | Where-Object { $_ }
    $last = $parts[-1]
    if ($last -match '^\d+$') {
      taskkill /F /PID $last 2>$null | Out-Null
      Write-Host "  PID $last 종료 (netstat)"
    }
  }
}

Write-Host ''
Write-Host '[2/2] 백엔드 기동 (종료: Ctrl+C)'
Set-Location $root
python run.py
