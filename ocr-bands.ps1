# ocr-bands.ps1 — OCR the design in horizontal bands to locate each text's
# vertical position (WinRT BoundingRect is unreliable from PowerShell).
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

$src = [System.Drawing.Bitmap]::FromFile("C:\Users\Anmol Bajpai\.jiva\uploads\image.png")
$W = $src.Width; $H = $src.Height
$bands = 60
for ($b = 0; $b -lt $bands; $b++) {
  $y0 = [int]($b * $H / $bands); $y1 = [int](($b + 1) * $H / $bands)
  $crop = $src.Clone([System.Drawing.Rectangle]::new(0, $y0, $W, $y1 - $y0), $src.PixelFormat)
  # upscale 4x for OCR quality
  $big = New-Object System.Drawing.Bitmap ($W * 4), (($y1 - $y0) * 4)
  $g = [System.Drawing.Graphics]::FromImage($big)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.DrawImage($crop, 0, 0, $big.Width, $big.Height)
  $g.Dispose()
  $tmp = "C:\Users\Anmol Bajpai\dev\Suab\.tmp-band.png"
  $big.Save($tmp, [System.Drawing.Imaging.ImageFormat]::Png)
  $big.Dispose(); $crop.Dispose()

  $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($tmp)) ([Windows.Storage.StorageFile])
  $stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
  $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  $result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
  $text = ($result.Lines | ForEach-Object { $_.Text }) -join " / "
  if ($text) { Write-Output ("band {0,2}  y={1,3}-{2,3}px ({3,4:N1}%-{4,4:N1}%)  | {5}" -f $b, $y0, $y1, (100*$y0/$H), (100*$y1/$H), $text) }
}
$src.Dispose()
