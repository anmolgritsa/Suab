# .tmp-resave.ps1 - re-save a PNG via GDI+ so the WinRT decoder accepts it
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Bitmap]::FromFile('C:\Users\Anmol Bajpai\dev\Suab\.tmp-image-flat.png')
$img.Save('C:\Users\Anmol Bajpai\dev\Suab\.tmp-image-gdi.png', [System.Drawing.Imaging.ImageFormat]::Png)
$img.Dispose()
Write-Output 'resaved ok'
