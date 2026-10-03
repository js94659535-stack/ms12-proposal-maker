# 한글 프로그램으로 HWPX를 열어 쪽 수를 세고 PDF로 저장한다(10-18). 한글 2020 이상이 설치된 Windows에서만 된다.
# 사용: powershell -File tools/hangul-check.ps1 -In <파일.hwpx> -Pdf <결과.pdf>
param([Parameter(Mandatory = $true)][string]$In, [Parameter(Mandatory = $true)][string]$Pdf)
$ErrorActionPreference = 'Stop'
$result = [ordered]@{ opened = $false; pages = $null; pdf = $false; error = '' }
$before = @(Get-Process Hwp -ErrorAction SilentlyContinue | ForEach-Object { $_.Id })
try {
  $hwp = New-Object -ComObject HWPFrame.HwpObject
  try { $hwp.XHwpWindows.Item(0).Visible = $false } catch {}
  $result.opened = [bool]$hwp.Open((Resolve-Path $In).Path, 'HWPX', '')
  try { $result.pages = [int]$hwp.PageCount } catch {}
  $result.pdf = [bool]$hwp.SaveAs([IO.Path]::GetFullPath($Pdf), 'PDF', '')
  $hwp.Quit()
} catch { $result.error = $_.Exception.Message }
# 이 스크립트가 띄운 한글만 끝낸다(원래 열려 있던 것은 건드리지 않는다).
Get-Process Hwp -ErrorAction SilentlyContinue | Where-Object { $before -notcontains $_.Id } | Stop-Process -Force -ErrorAction SilentlyContinue
$result | ConvertTo-Json -Compress
