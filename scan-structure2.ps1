# scan-structure2.ps1 — find the light content rect inside the dark frame,
# then per-row runs of non-background pixels WITHIN the content area.
Add-Type -AssemblyName System.Drawing
$bmp = [System.Drawing.Bitmap]::FromFile("C:\Users\Anmol Bajpai\.jiva\uploads\image.png")
$W = $bmp.Width; $H = $bmp.Height
function Hex($c) { "#{0:X2}{1:X2}{2:X2}" -f $c.R, $c.G, $c.B }

# --- content bbox: light pixels (lum >= 200) ---
$minX = $W; $maxX = 0; $minY = $H; $maxY = 0
for ($y = 0; $y -lt $H; $y += 1) {
  for ($x = 0; $x -lt $W; $x += 1) {
    $c = $bmp.GetPixel($x, $y)
    if (($c.R + $c.G + $c.B) / 3 -ge 200) {
      if ($x -lt $minX) { $minX = $x }
      if ($x -gt $maxX) { $maxX = $x }
      if ($y -lt $minY) { $minY = $y }
      if ($y -gt $maxY) { $maxY = $y }
    }
  }
}
Write-Output ("CONTENT BBOX: x {0}-{1}  y {2}-{3}  (size {4} x {5})" -f $minX, $maxX, $minY, $maxY, ($maxX-$minX+1), ($maxY-$minY+1))

# --- per-row runs inside content bbox ---
$cx0 = $minX; $cx1 = $maxX
Write-Output "`n=== PER-ROW RUNS (within content; bg >= 238) ==="
for ($y = $minY; $y -le $maxY; $y++) {
  $runs = @()
  $start = -1
  for ($x = $cx0; $x -le $cx1; $x++) {
    $c = $bmp.GetPixel($x, $y)
    $lum = ($c.R + $c.G + $c.B) / 3
    $isBg = $lum -ge 238
    if (-not $isBg -and $start -lt 0) { $start = $x }
    elseif ($isBg -and $start -ge 0) {
      if ($x - $start -ge 2) { $runs += ("{0}-{1}" -f $start, ($x-1)) }
      $start = -1
    }
  }
  if ($start -ge 0 -and ($cx1 - $start) -ge 2) { $runs += ("{0}-{1}" -f $start, $cx1) }
  if ($runs.Count -gt 0) {
    $widest = $runs | Sort-Object { [int]($_.Split('-')[1]) - [int]($_.Split('-')[0]) } -Descending | Select-Object -First 1
    $parts = $widest.Split('-')
    $cx = [math]::Min([int](($parts[0] + $parts[1]) / 2), $W - 1)
    $cc = $bmp.GetPixel($cx, $y)
    Write-Output ("y={0,3}  n={1}  {2}  | {3}" -f $y, $runs.Count, ($runs -join " "), (Hex $cc))
  }
}
$bmp.Dispose()
