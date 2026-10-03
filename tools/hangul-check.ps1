# 한글 프로그램으로 HWPX를 열어 쪽 수를 세고 PDF로 저장한다(10-18). 한글 2020 이상이 설치된 Windows에서만 된다.
# 사용: powershell -File tools/hangul-check.ps1 -In <파일.hwpx> -Pdf <결과.pdf>
# 한글 자동화(COM)는 가끔 「원격 프로시저 호출 실패(0x800706BE)」로 첫 시도가 실패한다(10-19 실측).
# 문서 폴더 경로의 파일을 열면 한글이 「파일 접근을 허용하겠습니까」 보안 확인창을 띄워 자동화가 멈춘다(10-19 실측).
# 그래서 임시 폴더(%TEMP%)에 복사해서 열고 PDF도 거기에 저장한 뒤 원하는 위치로 옮긴다.
# 이 스크립트가 띄운 한글만 정리하고 한 번 다시 시도한다. 원래 열려 있던 한글(창 제목이 있는 것)은 건드리지 않는다.
param([Parameter(Mandatory = $true)][string]$In, [Parameter(Mandatory = $true)][string]$Pdf)
$ErrorActionPreference = 'Stop'
$srcPath = (Resolve-Path $In).Path
$pdfDest = [IO.Path]::GetFullPath($Pdf)
$work = Join-Path $env:TEMP 'hwpcheck'
New-Item -ItemType Directory -Force $work | Out-Null
$inPath = Join-Path $work 'in.hwpx'
$pdfPath = Join-Path $work 'out.pdf'
Copy-Item $srcPath $inPath -Force
Remove-Item $pdfPath -Force -ErrorAction SilentlyContinue

function Invoke-Once {
  $r = [ordered]@{ opened = $false; pages = $null; pdf = $false; error = '' }
  $before = @(Get-Process Hwp -ErrorAction SilentlyContinue | ForEach-Object { $_.Id })
  try {
    $hwp = New-Object -ComObject HWPFrame.HwpObject
    try { $hwp.XHwpWindows.Item(0).Visible = $false } catch {}
    $r.opened = [bool]$hwp.Open($inPath, 'HWPX', '')
    try { $r.pages = [int]$hwp.PageCount } catch {}
    $r.pdf = [bool]$hwp.SaveAs($pdfPath, 'PDF', '')
    $hwp.Quit()
  } catch { $r.error = $_.Exception.Message }
  Get-Process Hwp -ErrorAction SilentlyContinue | Where-Object { $before -notcontains $_.Id } | Stop-Process -Force -ErrorAction SilentlyContinue
  return $r
}

$result = Invoke-Once
if (-not ($result.opened -and $result.pdf)) {
  Start-Sleep -Seconds 3
  $retry = Invoke-Once
  $retry['retried'] = $true
  if ($retry.opened -and $retry.pdf) { $result = $retry } else { $result['retried'] = $true; if (-not $result.error) { $result.error = $retry.error } }
}
if ($result.pdf -and (Test-Path $pdfPath)) { Copy-Item $pdfPath $pdfDest -Force }
$result | ConvertTo-Json -Compress
