# ocr-image-v3.ps1 - banded OCR with alpha flattened to white + Bgra8 conversion
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($winRtTask, $type) {
  $netTask = $asTaskGeneric.MakeGenericMethod($type).Invoke($null, @($winRtTask))
  $netTask.Wait(-1) | Out-Null
  $netTask.Result
}
[Windows.Storage.Streams.IRandomAccessStream, Windows.Storage.Streams, ContentType=WindowsRuntime] | Out-Null
[Windows.Storage.Streams.InMemoryRandomAccessStream, Windows.Storage.Streams, ContentType=WindowsRuntime] | Out-Null
[Windows.Storage.Streams.DataWriter, Windows.Storage.Streams, ContentType=WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType=WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.SoftwareBitmap, Windows.Graphics.Imaging, ContentType=WindowsRuntime] | Out-Null
[Windows.Media.Ocr.OcrEngine, Windows.Media.Ocr, ContentType=WindowsRuntime] | Out-Null
[Windows.Globalization.Language, Windows.Globalization, ContentType=WindowsRuntime] | Out-Null
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new("en-US"))

function Get-OcrText([string]$pngPath) {
  $bytes = [System.IO.File]::ReadAllBytes($pngPath)
  $ras = New-Object Windows.Storage.Streams.InMemoryRandomAccessStream
  $writer = New-Object Windows.Storage.Streams.DataWriter($ras.GetOutputStreamAt(0))
  $writer.WriteBytes($bytes)
  $null = Await ($writer.StoreAsync()) ([System.UInt32])
  $null = Await ($writer.FlushAsync()) ([System.Boolean])
  $ras.Size = $writer.BytesWritten
  $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($ras)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  if ($bitmap.BitmapPixelFormat -ne [Windows.Graphics.Imaging.BitmapPixelFormat]::Bgra8 -or $bitmap.BitmapAlphaMode -ne [Windows.Graphics.Imaging.BitmapAlphaMode]::PremultipliedAlpha) {
    $fixed = [Windows.Graphics.Imaging.SoftwareBitmap]::Convert($bitmap, [Windows.Graphics.Imaging.BitmapPixelFormat]::Bgra8, [Windows.Graphics.Imaging.BitmapAlphaMode]::PremultipliedAlpha)
    $bitmap.Dispose()
    $bitmap = $fixed
  }
  $result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
  $text = ($result.Lines | ForEach-Object { $_.Text }) -join " / "
  $writer.Dispose(); $ras.Dispose(); $bitmap.Dispose()
  return $text
}

function Save-FlatBand($src, [int]$x, [int]$y, [int]$w, [int]$h, [int]$scale, [string]$out) {
  $crop = $src.Clone([System.Drawing.Rectangle]::new($x, $y, $w, $h), $src.PixelFormat)
  $big = New-Object System.Drawing.Bitmap ($w * $scale), ($h * $scale)
  $g = [System.Drawing.Graphics]::FromImage($big)
  $g.Clear([System.Drawing.Color]::White)   # flatten any alpha onto white
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.DrawImage($crop, 0, 0, $big.Width, $big.Height)
  $g.Dispose()
  $big.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
  $big.Dispose(); $crop.Dispose()
}

$path = "C:\Users\Anmol Bajpai\.jiva\uploads\image.png"
Write-Output "===== $path ====="
$src = [System.Drawing.Bitmap]::FromFile($path)
$W = $src.Width; $H = $src.Height
Write-Output "size: ${W}x${H}"

try { Write-Output ("WHOLE: " + (Get-OcrText $path)) }
catch { Write-Output ("WHOLE failed: " + $_.Exception.InnerException.Message + " || " + $_.Exception.Message) }

$bands = 24
for ($b = 0; $b -lt $bands; $b++) {
  $y0 = [int]($b * $H / $bands); $y1 = [int](($b + 1) * $H / $bands)
  if ($y1 -le $y0) { continue }
  try {
    Save-FlatBand $src 0 $y0 $W ($y1 - $y0) 6 "C:\Users\Anmol Bajpai\dev\Suab\.tmp-band-now.png"
    $text = Get-OcrText "C:\Users\Anmol Bajpai\dev\Suab\.tmp-band-now.png"
    if ($text) { Write-Output ("band {0,2} (y {1}-{2}): {3}" -f $b, $y0, $y1, $text) }
  } catch { Write-Output ("band {0} failed: {1}" -f $b, $_.Exception.InnerException.Message) }
}
$src.Dispose()
