# 원본 .hwp 를 한글로 열어 구조 조사용 HWPX 사본을 만든다(10-36). 원본은 건드리지 않는다. 제출 파일을 만드는 용도가 아니다.
# 사용: powershell -File tools/hwp-inspect.ps1 -In <원본.hwp> -Out <조사용.hwpx>
param([Parameter(Mandatory = $true)][string]$In, [Parameter(Mandatory = $true)][string]$Out)
$ErrorActionPreference = 'Stop'
$src = (Resolve-Path $In).Path
$dest = [IO.Path]::GetFullPath($Out)
$work = Join-Path $env:TEMP 'hwpinspect'
New-Item -ItemType Directory -Force $work | Out-Null
$inPath = Join-Path $work 'in.hwp'
$outPath = Join-Path $work 'out.hwpx'
Copy-Item $src $inPath -Force
Remove-Item $outPath -Force -ErrorAction SilentlyContinue
$before = @(Get-Process Hwp -ErrorAction SilentlyContinue | ForEach-Object { $_.Id })
$r = [ordered]@{ opened = $false; pages = $null; saved = $false; error = '' }
try {
  $hwp = New-Object -ComObject HWPFrame.HwpObject
  try { $hwp.XHwpWindows.Item(0).Visible = $false } catch {}
  $r.opened = [bool]$hwp.Open($inPath, 'HWP', '')
  try { $r.pages = [int]$hwp.PageCount } catch {}
  $r.saved = [bool]$hwp.SaveAs($outPath, 'HWPX', '')
  $hwp.Quit()
} catch { $r.error = $_.Exception.Message }
Get-Process Hwp -ErrorAction SilentlyContinue | Where-Object { $before -notcontains $_.Id } | Stop-Process -Force -ErrorAction SilentlyContinue
if ($r.saved -and (Test-Path $outPath)) { Copy-Item $outPath $dest -Force }
$r | ConvertTo-Json -Compress
