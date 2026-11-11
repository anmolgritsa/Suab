# ocr-image-now.ps1 - banded OCR of the current uploaded reference image
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
Write-Output "===== $path ====="
$src = [System.Drawing.Bitmap]::FromFile($path)
$W = $src.Width; $H = $src.Height
Write-Output "size: ${W}x${H}"
$bands = 30
for ($b = 0; $b -lt $bands; $b++) {
  $y0 = [int]($b * $H / $bands); $y1 = [int](($b + 1) * $H / $bands)
  $crop = $src.Clone([System.Drawing.Rectangle]::new(0, $y0, $W, $y1 - $y0), $src.PixelFormat)
  $big = New-Object System.Drawing.Bitmap ($W * 6), (($y1 - $y0) * 6)
  $g = [System.Drawing.Graphics]::FromImage($big)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.DrawImage($crop, 0, 0, $big.Width, $big.Height)
  $g.Dispose()
  $tmp = "C:\Users\Anmol Bajpai\dev\Suab\.tmp-band-now.png"
  $big.Save($tmp, [System.Drawing.Imaging.ImageFormat]::Png)
  $big.Dispose(); $crop.Dispose()
  $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($tmp)) ([Windows.Storage.StorageFile])
  $stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
  $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Storage.Streams.IRandomAccessStream])
  $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  $result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
  $text = ($result.Lines | ForEach-Object { $_.Text }) -join " / "
  if ($text) { Write-Output ("band {0,2} (y {1}-{2}): {3}" -f $b, $y0, $y1, $text) }
  $stream.Dispose(); $bitmap.Dispose()
}
$src.Dispose()
