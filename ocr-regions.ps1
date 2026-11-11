# ocr-regions.ps1 — OCR specific bands of the design with 8x upscale +
# contrast boost, to read the small labels.
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

# name, y0, y1, x0, x1
$regions = @(
  @("logo-row",    14,  62, 40, 240),
  @("welcome",     70,  95, 60, 220),
  @("name",        93, 112, 90, 190),
  @("tabs",       118, 168,  5, 275),
  @("label1",     178, 200, 15, 270),
  @("field1",     198, 232, 10, 272),
  @("label2",     228, 252, 15, 270),
  @("field2",     250, 268, 10, 272),
  @("demo-chip",  264, 296, 80, 200),
  @("button",     298, 355, 10, 272),
  @("fingerprint",362, 392, 100, 180),
  @("mid-link",   402, 422, 90, 190),
  @("footer",     438, 460, 10, 272)
)

foreach ($r in $regions) {
  $name = $r[0]; $y0 = [int]$r[1]; $y1 = [int]$r[2]; $x0 = [int]$r[3]; $x1 = [int]$r[4]
  $w = $x1 - $x0; $h = $y1 - $y0
  $crop = $src.Clone([System.Drawing.Rectangle]::new($x0, $y0, $w, $h), $src.PixelFormat)
  $scale = 8
  $big = New-Object System.Drawing.Bitmap ($w * $scale), ($h * $scale)
  $g = [System.Drawing.Graphics]::FromImage($big)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.DrawImage($crop, 0, 0, $big.Width, $big.Height)
  $g.Dispose()
  # contrast boost: map lum<128 -> 0, lum>200 -> 255
  $bmpData = $big.LockBits([System.Drawing.Rectangle]::new(0,0,$big.Width,$big.Height), [System.Drawing.Imaging.ImageLockMode]::ReadWrite, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $ptr = $bmpData.Scan0
  $len = $big.Width * $big.Height * 4
  $buf = New-Object byte[] $len
  [System.Runtime.InteropServices.Marshal]::Copy($ptr, $buf, 0, $len)
  for ($i = 0; $i -lt $len; $i += 4) {
    for ($ch = 0; $ch -lt 3; $ch++) {
      $v = $buf[$i + $ch]
      if ($v -lt 100) { $buf[$i + $ch] = 0 }
      elseif ($v -gt 190) { $buf[$i + $ch] = 255 }
      else { $buf[$i + $ch] = [byte](255 * ($v - 100) / 90) }
    }
  }
  [System.Runtime.InteropServices.Marshal]::Copy($buf, 0, $ptr, $len)
  $big.UnlockBits($bmpData)
  $tmp = "C:\Users\Anmol Bajpai\dev\Suab\.tmp-region.png"
  $big.Save($tmp, [System.Drawing.Imaging.ImageFormat]::Png)
  $big.Dispose(); $crop.Dispose()

  $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($tmp)) ([Windows.Storage.StorageFile])
  $stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
  $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  $result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
  $text = ($result.Lines | ForEach-Object { $_.Text }) -join " | "
  Write-Output ("{0,-12} y{1}-{2} x{3}-{4} => {5}" -f $name, $y0, $y1, $x0, $x1, $(if ($text) { $text } else { "(nothing)" }))
}
$src.Dispose()
