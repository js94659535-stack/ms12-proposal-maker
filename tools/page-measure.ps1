# 한글 프로그램으로 「15pt 휴먼명조 A4 한 쪽에 글자가 몇 개 들어가는가」를 잰다(10-07).
# 새 문서에 쪽 여백·글꼴·줄 간격을 직접 정하고, 글을 넣은 뒤 줄이 바뀌는 칸과 쪽이 바뀌는 줄을 한글에게 묻는다.
# 사용: powershell -File tools/page-measure.ps1 [-Margins factory|machine] [-Text <글.txt>] [-Out <결과.json>]
#   factory = 한글 공장 기본 여백(왼30·오른30·위20·아래15·머리말15·꼬리말15mm)
#   machine = 이 PC 한글의 새 문서 여백을 그대로 둠
#   -Text 를 주면 그 글을 한 줄 = 한 문단으로 넣고 한글이 센 쪽 수도 남긴다(셈법 검증용).
# 필요: Windows + 한글 2020 이상(COM: HWPFrame.HwpObject).
# 메모: HAction.Execute('CharShape', HParameterSet.HCharShape.HSet)는 False를 돌려주고 글꼴이 안 바뀌었다(10-07 실측).
#       CreateAction → CreateSet → SetItem → Execute는 된다. KeyIndicator는 out 인자라 PowerShell에서 못 받아 GetPosBySet을 쓴다.
param([ValidateSet('factory', 'machine')][string]$Margins = 'factory', [string]$Text = '', [string]$Out = '', [string]$Face = '휴먼명조', [int]$Pt = 15, [int]$LineSpacing = 160)
$ErrorActionPreference = 'Stop'
$before = @(Get-Process Hwp -ErrorAction SilentlyContinue | ForEach-Object { $_.Id })
$hwp = New-Object -ComObject HWPFrame.HwpObject
try { $hwp.XHwpWindows.Item(0).Visible = $false } catch {}
$MM = 283.465  # HWPUNIT / mm

function Run-Action([string]$name, [scriptblock]$fill) {
  $act = $hwp.CreateAction($name); $set = $act.CreateSet(); $act.GetDefault($set) | Out-Null
  & $fill $set
  if (-not $act.Execute($set)) { throw "$name 실행 실패" }
}
function Set-Format {
  Run-Action 'CharShape' {
    param($set)
    foreach ($lang in 'Hangul', 'Latin', 'Hanja', 'Japanese', 'Other', 'Symbol', 'User') { $set.SetItem("FaceName$lang", $Face); $set.SetItem("FontType$lang", 1) }
    $set.SetItem('Height', $Pt * 100)
  }
  Run-Action 'ParagraphShape' { param($set) $set.SetItem('LineSpacingType', 0); $set.SetItem('LineSpacing', $LineSpacing) }
}
function Put([string]$s) {
  $t = $hwp.HParameterSet.HInsertText
  $hwp.HAction.GetDefault('InsertText', $t.HSet) | Out-Null
  $t.Text = $s
  $hwp.HAction.Execute('InsertText', $t.HSet) | Out-Null
}
function Clear-All { $hwp.Run('SelectAll') | Out-Null; $hwp.Run('Delete') | Out-Null; Set-Format }
function Put-Lines([string[]]$lines) {
  Clear-All
  for ($i = 0; $i -lt $lines.Count; $i++) { if ($i) { $hwp.Run('BreakPara') | Out-Null }; if ($lines[$i]) { Put $lines[$i] } }
}
# 한 줄 글자 수: 「한 쪽 줄 수」만큼의 문단에 글자를 n개씩 넣어 한 쪽에 들어가는 가장 큰 n.
# (커서를 한 줄 내려 칸 번호를 읽는 방법은 44처럼 틀린 값을 냈다 — 10-07 실측. 쪽 수로 판정한다.)
function Line-Capacity([scriptblock]$make, [int]$rows) {
  $lo = 1; $hi = 120
  while ($lo -lt $hi) {
    $mid = [int][math]::Ceiling(($lo + $hi) / 2)
    Put-Lines (@(1..$rows | ForEach-Object { & $make $mid }))
    if ([int]$hwp.PageCount -eq 1) { $lo = $mid } else { $hi = $mid - 1 }
  }
  $lo
}

if ($Margins -eq 'factory') {
  Run-Action 'PageSetup' {
    param($set)
    $pd = $set.CreateItemSet('PageDef', 'PageDef')
    $pd.SetItem('PaperWidth', [int](210 * $MM)); $pd.SetItem('PaperHeight', [int](297 * $MM)); $pd.SetItem('Landscape', 0)
    foreach ($pair in @(@('LeftMargin', 30), @('RightMargin', 30), @('TopMargin', 20), @('BottomMargin', 15), @('HeaderLen', 15), @('FooterLen', 15), @('GutterLen', 0))) { $pd.SetItem($pair[0], [int]($pair[1] * $MM)) }
  }
}
Set-Format

$result = [ordered]@{ face = $Face; pt = $Pt; line_spacing_percent = $LineSpacing; margins = $Margins; hwp = $hwp.Version }
Clear-All
for ($n = 1; $n -le 80; $n++) { if ($n -gt 1) { $hwp.Run('BreakPara') | Out-Null }; Put '가'; if ([int]$hwp.PageCount -ge 2) { $result.lines_per_page = $n - 1; break } }
$rows = $result.lines_per_page
$result.per_line = [ordered]@{
  hangul = Line-Capacity { param($n) '가' * $n } $rows
  digit = Line-Capacity { param($n) '1' * $n } $rows
  # 「가가가 」(4칸) 되풀이를 n칸에서 자른 보통 문장. 낱말 단위 줄바꿈이 끼므로 참고값
  hangul_with_spaces = Line-Capacity { param($n) ('가가가 ' * 40).Substring(0, $n).TrimEnd() } $rows
}
$result.hangul_per_page = $result.per_line.hangul * $rows

if ($Text) {
  $lines = @(Get-Content -LiteralPath $Text -Encoding UTF8)
  Put-Lines $lines
  $pages = [int]$hwp.PageCount
  # 마지막 쪽에 몇 줄이 찼는지: 한 글자 문단을 덧붙여 쪽이 하나 늘 때까지 센다 → 글 전체가 쓴 줄 수
  $hwp.Run('MoveDocEnd') | Out-Null
  $added = 0
  while ([int]$hwp.PageCount -eq $pages -and $added -le $rows) { $hwp.Run('BreakPara') | Out-Null; Put '가'; $added++ }
  $result.text = [ordered]@{ file = (Split-Path $Text -Leaf); paragraphs = $lines.Count; chars = ($lines -join '').Length; pages = $pages; lines = $pages * $rows - ($added - 1) }
}
# 실제로 쓰인 쪽 설정을 HWPX로 저장해 다시 읽어 남긴다(설정이 먹었는지 확인).
$probe = Join-Path $env:TEMP 'page-measure.hwpx'
$hwp.SaveAs($probe, 'HWPX', '') | Out-Null
$hwp.Clear(1); $hwp.Quit()
Get-Process Hwp -ErrorAction SilentlyContinue | Where-Object { $before -notcontains $_.Id } | Stop-Process -Force -ErrorAction SilentlyContinue
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::OpenRead($probe)
$section = (New-Object IO.StreamReader ($zip.GetEntry('Contents/section0.xml').Open())).ReadToEnd(); $zip.Dispose()
if ($section -match '<hp:margin ([^>]*)/>') {
  $m = [ordered]@{}; foreach ($a in [regex]::Matches($Matches[1], '(\w+)="(\d+)"')) { $m["$($a.Groups[1].Value)_mm"] = [math]::Round([int]$a.Groups[2].Value / $MM, 1) }
  $result.page_saved = $m
}
$json = $result | ConvertTo-Json -Depth 4
if ($Out) { [IO.File]::WriteAllText([IO.Path]::GetFullPath($Out), $json, (New-Object Text.UTF8Encoding $false)) }
$json
