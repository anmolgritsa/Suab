# scan-structure.ps1 — detailed structural analysis of the design PNG:
# 1) edge/border colours  2) per-row runs of non-background pixels
Add-Type -AssemblyName System.Drawing
$bmp = [System.Drawing.Bitmap]::FromFile("C:\Users\Anmol Bajpai\.jiva\uploads\image.png")
$W = $bmp.Width; $H = $bmp.Height
function Hex($c) { "#{0:X2}{1:X2}{2:X2}" -f $c.R, $c.G, $c.B }

Write-Output "=== EDGE SAMPLES ==="
Write-Output ("top-left {0}  top-mid {1}  top-right {2}" -f (Hex $bmp.GetPixel(0,0)), (Hex $bmp.GetPixel([int]($W/2),0)), (Hex $bmp.GetPixel($W-1,0)))
Write-Output ("bot-left {0}  bot-mid {1}  bot-right {2}" -f (Hex $bmp.GetPixel(0,$H-1)), (Hex $bmp.GetPixel([int]($W/2),$H-1)), (Hex $bmp.GetPixel($W-1,$H-1)))
Write-Output ("mid-left {0}  centre   {1}  mid-right {2}" -f (Hex $bmp.GetPixel(0,[int]($H/2))), (Hex $bmp.GetPixel([int]($W/2),[int]($H/2))), (Hex $bmp.GetPixel($W-1,[int]($H/2))))

# right-edge vertical profile: where does the dark band start/end?
Write-Output "`n=== RIGHT-EDGE PROFILE (x from W-1 leftwards, at y=H/2) ==="
$y = [int]($H/2)
$desc = ""
for ($i = 0; $i -lt 40; $i++) {
  $x = $W - 1 - $i
  $c = $bmp.GetPixel($x, $y)
  $desc += ("{0}:{1} " -f $x, (Hex $c))
}
Write-Output $desc

Write-Output "`n=== PER-ROW NON-BG RUNS (rows with content; bg = near-white >=235) ==="
for ($y = 0; $y -lt $H; $y++) {
  $runs = @()
  $start = -1
  for ($x = 0; $x -lt $W; $x++) {
    $c = $bmp.GetPixel($x, $y)
    $lum = ($c.R + $c.G + $c.B) / 3
    $isBg = $lum -ge 238
    if (-not $isBg -and $start -lt 0) { $start = $x }
    elseif ($isBg -and $start -ge 0) {
      if ($x - $start -ge 2) { $runs += ("{0}-{1}" -f $start, ($x-1)) }
      $start = -1
    }
  }
  if ($start -ge 0 -and ($W - $start) -ge 2) { $runs += ("{0}-{1}" -f $start, ($W-1)) }
  if ($runs.Count -gt 0) {
    # sample the colour of the widest run
    $widest = $runs | Sort-Object { [int]($_.Split('-')[1]) - [int]($_.Split('-')[0]) } -Descending | Select-Object -First 1
    $parts = $widest.Split('-')
    $cx = [int](($parts[0] + $parts[1]) / 2)
    $cc = $bmp.GetPixel($cx, $y)
    Write-Output ("y={0,3}  runs[{1}]: {2}  widest-colour {3}" -f $y, $runs.Count, ($runs -join " "), (Hex $cc))
  }
}
$bmp.Dispose()
