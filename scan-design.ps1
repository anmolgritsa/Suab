# scan-design.ps1 — analyse the attached login-design PNG:
# 1) dimensions  2) coarse colour grid  3) row/column colour signatures
Add-Type -AssemblyName System.Drawing
$bmp = [System.Drawing.Bitmap]::FromFile("C:\Users\Anmol Bajpai\.jiva\uploads\image.png")
Write-Output ("SIZE: {0} x {1}" -f $bmp.Width, $bmp.Height)

function Hex($c) { "#{0:X2}{1:X2}{2:X2}" -f $c.R, $c.G, $c.B }

# ---- coarse grid: 24 cols x 48 rows, sample centre of each cell ----
$cols = 24; $rows = 48
Write-Output "`n=== COLOUR GRID (each cell = centre sample) ==="
for ($r = 0; $r -lt $rows; $r++) {
  $line = ""
  for ($c = 0; $c -lt $cols; $c++) {
    $x = [int]($c * $bmp.Width / $cols + $bmp.Width / (2 * $cols))
    $y = [int]($r * $bmp.Height / $rows + $bmp.Height / (2 * $rows))
    $col = $bmp.GetPixel($x, $y)
    # classify into a compact letter code
    $lum = ($col.R + $col.G + $col.B) / 3
    $ch = "?"
    if ($lum -gt 235) { $ch = "." }              # white
    elseif ($lum -gt 215) { $ch = "," }          # near-white
    elseif ($lum -gt 150) { $ch = "l" }          # light grey
    elseif ($lum -gt 90) { $ch = "g" }           # mid grey
    elseif ($lum -gt 40) { $ch = "d" }           # dark
    else { $ch = "#" }                           # near black
    # hue hints
    if ($col.B -gt $col.R + 30 -and $col.B -gt $col.G + 20) { $ch = "B" }   # blue
    elseif ($col.G -gt $col.R + 20 -and $col.G -gt $col.B + 20) { $ch = "G" } # green
    elseif ($col.R -gt $col.G + 30 -and $col.R -gt $col.B + 30) { $ch = "R" } # red
    elseif ($col.R -gt 200 -and $col.G -gt 150 -and $col.B -lt 120) { $ch = "Y" } # yellow/amber
    $line += $ch
  }
  Write-Output ("{0,3}|{1}" -f $r, $line)
}

# ---- distinct colours (quantised) with counts ----
Write-Output "`n=== TOP COLOURS (quantised to 32-steps) ==="
$counts = @{}
$step = 16
for ($y = 0; $y -lt $bmp.Height; $y += 3) {
  for ($x = 0; $x -lt $bmp.Width; $x += 3) {
    $p = $bmp.GetPixel($x, $y)
    $key = "R{0} G{1} B{2}" -f ([int]([math]::Floor($p.R / $step)) * $step), ([int]([math]::Floor($p.G / $step)) * $step), ([int]([math]::Floor($p.B / $step)) * $step)
    if ($counts.ContainsKey($key)) { $counts[$key]++ } else { $counts[$key] = 1 }
  }
}
$counts.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 18 | ForEach-Object { Write-Output ("{0}  ->  {1}" -f $_.Value, $_.Key) }

$bmp.Dispose()
