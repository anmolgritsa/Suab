# ocr-ref2.ps1 - OCR the reference image split into left/right halves, more bands.
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($winRtTask, $type) {
  $netTask = $asTaskGeneric.MakeGenericMethod($type).Invoke($null, @($winRtTask))
  $netTask.Wait(-1) | Out-Null
  $netTask.Result
}
[Windows.Storage.StorageFile, Windows.Storage, ContentType=WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType=WindowsRuntime] | Out-Null
[Windows.Media.Ocr.OcrEngine, Windows.Media.Ocr, ContentType=WindowsRuntime] | Out-Null
[Windows.Globalization.Language, Windows.Globalization, ContentType=WindowsRuntime] | Out-Null
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new("en-US"))

$path = "C:\Users\Anmol Bajpai\.jiva\uploads\image.png"
$src = [System.Drawing.Bitmap]::FromFile($path)
$W = $src.Width; $H = $src.Height
Write-Output "size: ${W}x${H}"

# sample some pixel colours: corners, centre of each half, button areas
$samplePoints = @(
  @{n='top-left-half-bg'; x=380; y=120},
  @{n='top-right-half-bg'; x=1150; y=120},
  @{n='left-half-mid'; x=380; y=500},
  @{n='right-half-mid'; x=1150; y=500},
  @{n='left-bottom'; x=380; y=950},
  @{n='right-bottom'; x=1150; y=950},
  @{n='left-btn-area'; x=380; y=880},
  @{n='right-btn-area'; x=1150; y=880}
)
foreach ($p in $samplePoints) {
  $c = $src.GetPixel($p.x, $p.y)
  Write-Output ("{0}: R={1} G={2} B={3} #{4:X2}{5:X2}{6:X2}" -f $p.n, $c.R, $c.G, $c.B, $c.R, $c.G, $c.B)
}

$halves = @(
  @{n='LEFT'; x0=0; x1=[int]($W/2)},
  @{n='RIGHT'; x0=[int]($W/2); x1=$W}
)
foreach ($h in $halves) {
  Write-Output "===== $($h.n) HALF ====="
  $hw = $h.x1 - $h.x0
  $bands = 34
  for ($b = 0; $b -lt $bands; $b++) {
    $y0 = [int]($b * $H / $bands); $y1 = [int](($b + 1) * $H / $bands)
    $crop = $src.Clone([System.Drawing.Rectangle]::new($h.x0, $y0, $hw, $y1 - $y0), $src.PixelFormat)
    $big = New-Object System.Drawing.Bitmap ($hw * 4), (($y1 - $y0) * 4)
    $g = [System.Drawing.Graphics]::FromImage($big)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.DrawImage($crop, 0, 0, $big.Width, $big.Height)
    $g.Dispose()
    $tmp = "C:\Users\Anmol Bajpai\dev\Suab\.tmp-refband.png"
    $big.Save($tmp, [System.Drawing.Imaging.ImageFormat]::Png)
    $big.Dispose(); $crop.Dispose()
    $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($tmp)) ([Windows.Storage.StorageFile])
    $stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
    $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
    $result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
    $text = ($result.Lines | ForEach-Object { $_.Text }) -join " / "
    if ($text) { Write-Output ("band {0,2}: {1}" -f $b, $text) }
    $stream.Dispose(); $bitmap.Dispose()
  }
}
$src.Dispose()
