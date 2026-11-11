# ocr-ref4.ps1 - fine OCR: 60 bands, 5x upscale, per half.
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

$halves = @(
  @{n='LEFT'; x0=0; x1=[int]($W/2)},
  @{n='RIGHT'; x0=[int]($W/2); x1=$W}
)
foreach ($half in $halves) {
  Write-Output "===== $($half.n) HALF ====="
  $hw = $half.x1 - $half.x0
  $bands = 60
  for ($b = 0; $b -lt $bands; $b++) {
    $y0 = [int]($b * $H / $bands); $y1 = [int](($b + 1) * $H / $bands)
    $crop = $src.Clone([System.Drawing.Rectangle]::new($half.x0, $y0, $hw, $y1 - $y0), $src.PixelFormat)
    $big = New-Object System.Drawing.Bitmap ($hw * 5), (($y1 - $y0) * 5)
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
