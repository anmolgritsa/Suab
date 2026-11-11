# ocr-ref5.ps1 - targeted region OCR of the reference image.
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

# name, x, y, w, h  (left phone spans x~90-680, right phone x~830-1420 by the colour grid)
$regions = @(
  @{n='L-title';    x=90;  y=40;  w=590; h=140},
  @{n='L-chips';    x=90;  y=180; w=590; h=200},
  @{n='L-question'; x=90;  y=380; w=590; h=140},
  @{n='L-mid';      x=90;  y=520; w=590; h=220},
  @{n='L-red';      x=90;  y=680; w=590; h=140},
  @{n='L-media';    x=90;  y=800; w=590; h=110},
  @{n='L-button';   x=90;  y=900; w=590; h=110},
  @{n='R-title';    x=830; y=40;  w=590; h=140},
  @{n='R-chips';    x=830; y=180; w=590; h=200},
  @{n='R-question'; x=830; y=380; w=590; h=140},
  @{n='R-mid';      x=830; y=520; w=590; h=180},
  @{n='R-media';    x=830; y=740; w=590; h=110},
  @{n='R-button';   x=830; y=840; w=590; h=120}
)
foreach ($r in $regions) {
  $crop = $src.Clone([System.Drawing.Rectangle]::new($r.x, $r.y, $r.w, $r.h), $src.PixelFormat)
  $big = New-Object System.Drawing.Bitmap ($r.w * 4), ($r.h * 4)
  $g = [System.Drawing.Graphics]::FromImage($big)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.DrawImage($crop, 0, 0, $big.Width, $big.Height)
  $g.Dispose()
  $tmp = "C:\Users\Anmol Bajpai\dev\Suab\.tmp-refregion.png"
  $big.Save($tmp, [System.Drawing.Imaging.ImageFormat]::Png)
  $big.Dispose(); $crop.Dispose()
  $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($tmp)) ([Windows.Storage.StorageFile])
  $stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
  $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  $result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
  $text = ($result.Lines | ForEach-Object { $_.Text }) -join " / "
  Write-Output ("{0}: {1}" -f $r.n, $(if ($text) { $text } else { '(nothing)' }))
  $stream.Dispose(); $bitmap.Dispose()
}
$src.Dispose()
