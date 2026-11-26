# 지금 진행 중인 반복이 끝나면 루프를 멈춘다. (작업 중간에 끊지 않아 커밋/결정 기록이 깨지지 않음)
Set-Location (Split-Path $PSScriptRoot -Parent)
New-Item -ItemType File -Force autodev\STOP | Out-Null
Write-Host "STOP 요청됨. 현재 반복이 끝나면 멈춥니다. 즉시 멈추려면 루프 창에서 Ctrl+C."
