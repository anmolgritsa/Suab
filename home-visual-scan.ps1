# home-visual-scan.ps1 — structural pixel scan of the homepage screenshot.
#
# The design mockups were conversation attachments (not on disk), so this
# script verifies the captured screenshot against the mockups' colour
# signatures instead: navy logo, pale-blue shift pill, the three card
# palettes (amber / blue / green) and the full-width red SOS band.
#
# Usage:  powershell -File home-visual-scan.ps1 [.tmp-home-shot.png]

param(
    [string]$ShotPath = (Join-Path $PSScriptRoot '.tmp-home-shot.png'),
    [string]$ReminderPath = (Join-Path $PSScriptRoot '.tmp-reminder-shot.png')
)

Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap($ShotPath)
$W = $bmp.Width; $H = $bmp.Height
"Scanning $ShotPath  ($W x $H)"

# name -> @(r, g, b, tolerance)
$targets = [ordered]@{
    'logo navy'        = @(27, 42, 74, 40)     # suab-logo.png dark mark
    'timer pale blue'  = @(232, 242, 254, 3)   # --blue-soft #e8f2fe (tight: blue card soft is nearby)
    'amber badge'      = @(246, 167, 35, 14)   # ActionCard amber
    'amber card'       = @(253, 243, 215, 6)   # ActionCard amber soft
    'blue badge'       = @(46, 131, 249, 14)   # ActionCard blue
    'blue card'        = @(227, 239, 253, 6)   # ActionCard blue soft
    'green badge'      = @(34, 181, 127, 14)   # ActionCard green
    'green card'       = @(224, 246, 236, 6)   # ActionCard green soft
    'sos red'          = @(229, 72, 77, 14)    # --danger #e5484d
    'frame background' = @(245, 250, 253, 4)   # --bg #f5fafd (app-frame surface)
}

$stats = @{}
foreach ($name in $targets.Keys) { $stats[$name] = @{ n = 0; minX = $W; maxX = 0; minY = $H; maxY = 0; ys = New-Object System.Collections.Generic.List[int] } }

$step = 4
for ($y = 0; $y -lt $H; $y += $step) {
    for ($x = 0; $x -lt $W; $x += $step) {
        $p = $bmp.GetPixel($x, $y)
        foreach ($name in $targets.Keys) {
            $t = $targets[$name]
            if ([Math]::Abs($p.R - $t[0]) -le $t[3] -and
                [Math]::Abs($p.G - $t[1]) -le $t[3] -and
                [Math]::Abs($p.B - $t[2]) -le $t[3]) {
                $s = $stats[$name]
                $s.n++
                $s.ys.Add($y)
                if ($x -lt $s.minX) { $s.minX = $x }
                if ($x -gt $s.maxX) { $s.maxX = $x }
                if ($y -lt $s.minY) { $s.minY = $y }
                if ($y -gt $s.maxY) { $s.maxY = $y }
            }
        }
    }
}
$bmp.Dispose()

# Median y of the matches — robust against a few antialiased edge pixels
# far from the main region (the bbox alone would stretch to them).
function MedianY($s) {
    $ys = $s.ys; $ys.Sort()
    $ys[[int][Math]::Floor(($ys.Count - 1) / 2)]
}

$failures = 0
function Check($label, $pass, $detail) {
    if ($pass) { "PASS $label  [$detail]" }
    else { $script:failures++; "FAIL $label  [$detail]" }
}

# --- structural expectations (fractions of the 393x852 layout) ---
$logo = $stats['logo navy']
Check 'navy logo mark in the top-left' (
    $logo.n -gt 20 -and $logo.minY -lt $H * 0.12 -and $logo.minX -lt $W * 0.30) (
    "n=$($logo.n) box=($($logo.minX),$($logo.minY))..($($logo.maxX),$($logo.maxY))")

$pill = $stats['timer pale blue']
$pillMedian = MedianY $pill
Check 'pale-blue shift pill in the upper quarter' (
    $pill.n -gt 40 -and $pillMedian -gt $H * 0.05 -and $pillMedian -lt $H * 0.25) (
    "n=$($pill.n) medianY=$($pillMedian) bbox=$($pill.minY)..$($pill.maxY)")

foreach ($pair in @(@('amber', 'amber badge', 'amber card'),
                    @('blue', 'blue badge', 'blue card'),
                    @('green', 'green badge', 'green card'))) {
    $badge = $stats[$pair[1]]; $soft = $stats[$pair[2]]
    # The blue palette also tints the timer pill's clock icon, so the blue
    # badge may start higher than the card band — only cap the bottom.
    $mid = $badge.n -gt 15 -and $badge.maxY -lt $H * 0.75
    Check "$($pair[0]) card badge in the middle band" $mid (
        "n=$($badge.n) y=$($badge.minY)..$($badge.maxY)")
    Check "$($pair[0]) card surface present" ($soft.n -gt 200) ("n=$($soft.n)")
}

$sos = $stats['sos red']
$wideEnough = ($sos.maxX - $sos.minX) -gt $W * 0.60
Check 'red SOS band pinned near the bottom, full width' (
    $sos.n -gt 300 -and $sos.minY -gt $H * 0.70 -and $sos.maxY -gt $H * 0.85 -and $wideEnough) (
    "n=$($sos.n) y=$($sos.minY)..$($sos.maxY) x=$($sos.minX)..$($sos.maxX)")

$bg = $stats['frame background']
Check 'light frame background dominates' ($bg.n -gt ($W / $step) * ($H / $step) * 0.25) ("n=$($bg.n)")

if ($failures -eq 0) { "`nAll visual structure checks passed" }
else { "`n$failures visual structure check(s) FAILED"; exit 1 }

# ---- reminder modal (mockup 6.2) -------------------------------------------
# The modal card is warm cream with a blue send button, floating over a
# dimmed backdrop. The backdrop dims the whole homepage, so the corners of
# the shot must be clearly darker than the page background.

if (-not (Test-Path $ReminderPath)) {
    "`n(reminder screenshot not found at $ReminderPath - skipping mockup 6.2 scan)"
    return
}

$rbmp = New-Object System.Drawing.Bitmap($ReminderPath)
$rw = $rbmp.Width; $rh = $rbmp.Height
"`nScanning $ReminderPath  ($rw x $rh)"

$rFailures = 0
function CheckR($label, $pass, $detail) {
    if ($pass) { "PASS $label  [$detail]" }
    else { $script:rFailures++; "FAIL $label  [$detail]" }
}

$cream = 0; $blue = 0; $cornerSum = 0; $cornerN = 0
for ($y = 0; $y -lt $rh; $y += 4) {
    for ($x = 0; $x -lt $rw; $x += 4) {
        $p = $rbmp.GetPixel($x, $y)
        if ([Math]::Abs($p.R - 253) -le 8 -and [Math]::Abs($p.G - 238) -le 8 -and [Math]::Abs($p.B - 221) -le 8) { $cream++ }
        if ([Math]::Abs($p.R - 46) -le 20 -and [Math]::Abs($p.G - 131) -le 20 -and [Math]::Abs($p.B - 249) -le 20) { $blue++ }
        if (($x -lt $rw * 0.12 -or $x -gt $rw * 0.88) -and ($y -lt $rh * 0.12 -or $y -gt $rh * 0.88)) {
            $cornerSum += ($p.R + $p.G + $p.B); $cornerN++
        }
    }
}
$rbmp.Dispose()

CheckR 'cream reminder card present' ($cream -gt 300) "n=$cream"
CheckR 'blue send button present' ($blue -gt 100) "n=$blue"
$cornerAvg = [Math]::Round($cornerSum / [Math]::Max(1, $cornerN) / 3)
CheckR 'backdrop dims the page corners' ($cornerAvg -gt 90 -and $cornerAvg -lt 190) "avg=$cornerAvg (page bg is ~249)"

if ($rFailures -eq 0) { "`nAll reminder-modal checks passed" }
else { "`n$rFailures reminder-modal check(s) FAILED"; exit 1 }
