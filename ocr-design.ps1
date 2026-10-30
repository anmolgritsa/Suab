# ocr-design.ps1 — OCR the design PNG with the built-in Windows OCR engine.
# Prints every recognised line with its bounding box in % of image size.
Add-Type -AssemblyName System.Drawing
$path = "C:\Users\Anmol Bajpai\.jiva\uploads\image.png"

# WinRT async helpers
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

$file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($path)) ([Windows.Storage.StorageFile])
$stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
$decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
$bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])

$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new("en-US"))
if (-not $engine) { $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages() }
if (-not $engine) { Write-Output "NO-OCR-ENGINE"; exit 1 }

$result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
Write-Output ("IMAGE: {0} x {1}" -f $bitmap.PixelWidth, $bitmap.PixelHeight)
foreach ($line in $result.Lines) {
  $bb = $line.BoundingRect
  $xPct = [math]::Round(100 * $bb.X / $bitmap.PixelWidth, 1)
  $yPct = [math]::Round(100 * $bb.Y / $bitmap.PixelHeight, 1)
  $wPct = [math]::Round(100 * $bb.Width / $bitmap.PixelWidth, 1)
  $hPct = [math]::Round(100 * $bb.Height / $bitmap.PixelHeight, 1)
  Write-Output ("y={0,5}% x={1,5}% w={2,5}% h={3,4}%  | {4}" -f $yPct, $xPct, $wPct, $hPct, $line.Text)
}
