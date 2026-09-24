param([Parameter(Mandatory=$true)][string]$InputPath,[Parameter(Mandatory=$true)][string]$OutputPath)
Add-Type -AssemblyName System.Drawing
$source=[System.Drawing.Bitmap]::FromFile((Resolve-Path -LiteralPath $InputPath).Path)
$bitmap=[System.Drawing.Bitmap]::new($source.Width,$source.Height,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics=[System.Drawing.Graphics]::FromImage($bitmap)
$graphics.DrawImageUnscaled($source,0,0)
$graphics.Dispose(); $source.Dispose()
$rect=[System.Drawing.Rectangle]::new(0,0,$bitmap.Width,$bitmap.Height)
$data=$bitmap.LockBits($rect,[System.Drawing.Imaging.ImageLockMode]::ReadWrite,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$pixels=[byte[]]::new($data.Stride*$bitmap.Height)
[System.Runtime.InteropServices.Marshal]::Copy($data.Scan0,$pixels,0,$pixels.Length)
$cellWidth=$bitmap.Width/10.0
for($y=0;$y-lt$bitmap.Height;$y++){$row=$y*$data.Stride;for($x=0;$x-lt$bitmap.Width;$x++){$p=$row+$x*4;$b=$pixels[$p];$g=$pixels[$p+1];$r=$pixels[$p+2];$local=$x%$cellWidth;if(($r-gt170-and$g-gt180-and$b-gt165-and$g-ge($r-3)-and$g-ge($b+2))-or$local-lt14-or$local-gt($cellWidth-5)){$pixels[$p+3]=0}}}
[System.Runtime.InteropServices.Marshal]::Copy($pixels,0,$data.Scan0,$pixels.Length)
$bitmap.UnlockBits($data)
$bitmap.Save($OutputPath,[System.Drawing.Imaging.ImageFormat]::Png)
$bitmap.Dispose()
