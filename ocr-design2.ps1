# ocr-design2.ps1 — OCR with word-level boxes; upscale 3x first for accuracy.
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

# --- upscale the source 3x with high-quality interpolation ---
$src = [System.Drawing.Bitmap]::FromFile("C:\Users\Anmol Bajpai\.jiva\uploads\image.png")
$big = New-Object System.Drawing.Bitmap ($src.Width * 3), ($src.Height * 3)
$g = [System.Drawing.Graphics]::FromImage($big)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.DrawImage($src, 0, 0, $big.Width, $big.Height)
$g.Dispose()
$tmp = "C:\Users\Anmol Bajpai\dev\Suab\.tmp-design-3x.png"
$big.Save($tmp, [System.Drawing.Imaging.ImageFormat]::Png)
$big.Dispose(); $src.Dispose()

$file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($tmp)) ([Windows.Storage.StorageFile])
$stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
$decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
$bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])

$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new("en-US"))
if (-not $engine) { $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages() }
$result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])

$W = $bitmap.PixelWidth; $H = $bitmap.PixelHeight
Write-Output ("UPSCALED: {0} x {1}" -f $W, $H)
foreach ($line in $result.Lines) {
  $r = $line.BoundingRect
  Write-Output ("LINE y={0:N1}-{1:N1}% x={2:N1}-{3:N1}%  | {4}" -f (100*$r.Y/$H), (100*($r.Y+$r.Height)/$H), (100*$r.X/$W), (100*($r.X+$r.Width)/$W), $line.Text)
  foreach ($w in $line.Words) {
    $wr = $w.BoundingRect
    Write-Output ("   word y={0:N1}-{1:N1}% x={2:N1}-{3:N1}%  | {4}" -f (100*$wr.Y/$H), (100*($wr.Y+$wr.Height)/$H), (100*$wr.X/$W), (100*($wr.X+$wr.Width)/$W), $w.Text)
  }
}
