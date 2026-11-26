# RE:Cord 자율 개발 루프 — START
# 사용: 저장소 루트에서  powershell -ExecutionPolicy Bypass -File autodev\start.ps1
#   옵션: -MaxIter 0 (0 = STOP 할 때까지 무한)  -MaxTurns 80  -MaxNoProgress 5
# 중지: 다른 창에서  powershell -File autodev\stop.ps1  (지금 반복이 끝나면 멈춤) / 즉시 중지는 Ctrl+C
param([int]$MaxIter = 0, [int]$MaxTurns = 80, [int]$MaxNoProgress = 5)

$ErrorActionPreference = "Continue"
$OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)  # 한글 프롬프트가 깨지지 않게
Set-Location (Split-Path $PSScriptRoot -Parent)
New-Item -ItemType Directory -Force autodev\log, autodev\shots, .claude | Out-Null
Remove-Item autodev\STOP -ErrorAction SilentlyContinue
if (Test-Path claude-settings.json) { Copy-Item claude-settings.json .claude\settings.json -Force }

# 1) 전용 브랜치 (팀원 브랜치와 분리). 커밋 안 된 작업은 지우지 않고 첫 커밋으로 보존
$branch = git rev-parse --abbrev-ref HEAD
if ($branch -notlike "autodev/*") {
  $new = "autodev/" + (Get-Date -Format "MMdd-HHmm")
  git switch -c $new | Out-Null
  Write-Host "브랜치 $new 를 $branch 에서 만들었습니다."
}
if (git status --porcelain) {
  git add -A; git commit -q -m "[WIP] autodev 시작 전 작업 내용 보존 ($branch)"
  Write-Host "커밋 안 된 변경을 첫 커밋으로 보존했습니다."
}

$prompt = Get-Content autodev\LOOP_PROMPT.md -Raw -Encoding UTF8
$noProgress = 0; $i = 0

while ($true) {
  $i++
  if ($MaxIter -gt 0 -and $i -gt $MaxIter) { Write-Host "최대 반복 $MaxIter 회 도달"; break }
  if (Test-Path autodev\STOP) { Write-Host "STOP 확인 → 종료"; break }

  $n = "{0:D3}" -f ((Get-ChildItem autodev\log -Filter "iter-*.json").Count + 1)
  $before = git rev-parse HEAD
  Write-Host "`n=== 반복 #$n  $(Get-Date -Format 'MM-dd HH:mm:ss') ===" -ForegroundColor Cyan

  # 프롬프트는 따옴표 문제를 피하려고 표준입력으로 전달
  ("$prompt`n`n이번 반복 번호: $n") | claude -p --max-turns $MaxTurns --dangerously-skip-permissions --output-format json |
    Out-File "autodev\log\iter-$n.json" -Encoding utf8

  # 2) 남은 변경은 버리지 않고 커밋
  if (git status --porcelain) { git add -A; git commit -q -m "[iter $n] 반복 종료 시 남은 변경" }

  # 3) 에이전트 말을 믿지 않고 스크립트가 다시 검증. 깨졌으면 이번 반복을 되돌림
  Push-Location Src; npm test --silent *> "..\autodev\log\iter-$n-test.txt"; $ok = $LASTEXITCODE -eq 0; Pop-Location
  $after = git rev-parse HEAD
  if (-not $ok -and $after -ne $before) {
    git revert --no-edit "$before..$after" | Out-Null
    Add-Content autodev\log\GUARD.md "- 반복 #$n : 테스트 실패 → $before..$after 되돌림 (다음 반복이 원인을 다시 시도)"
    Write-Host "테스트 실패 → 이번 반복을 되돌렸습니다." -ForegroundColor Yellow
  }

  if ($after -eq $before -or -not $ok) { $noProgress++ } else { $noProgress = 0 }
  if ($noProgress -ge $MaxNoProgress) { Write-Host "$MaxNoProgress 회 연속 진척 없음 → 정지. autodev\log 확인" -ForegroundColor Yellow; break }
}
Write-Host "`n끝. 확인: autodev\DECISIONS.md · autodev\log\ · autodev\PARITY.md · git log --oneline"
