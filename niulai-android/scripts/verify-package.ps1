$ErrorActionPreference='Stop'
$repo=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$version=(Get-Content (Join-Path $repo 'niulai-android/package.json') -Raw -Encoding UTF8|ConvertFrom-Json).version
Add-Type -AssemblyName System.IO.Compression.FileSystem
$apk=Join-Path $repo "release/android/Niulai-Android-$version.apk"
$zip=[IO.Compression.ZipFile]::OpenRead($apk)
$checks=@()
function HashBytes([byte[]]$bytes){$sha=[Security.Cryptography.SHA256]::Create();try{return ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}}
try{
    $files=@($zip.Entries|Where-Object{-not $_.FullName.EndsWith('/')})
    if($files|Where-Object{$_.FullName.Contains('\') -or $_.FullName -match '\.glb$|node_modules|three|\.p12$|\.jks$|\.java$'}){throw 'Unexpected asset, path, model or signing material in APK'}
    $checks+='Normalized ZIP paths; no 3D models, Three.js, source code or keystore'
    foreach($file in Get-ChildItem -LiteralPath (Join-Path $repo 'niulai-android/build/web') -File -Recurse){
        $base=(Join-Path $repo 'niulai-android/build/web')
        $relative=$file.FullName.Substring($base.Length+1).Replace('\','/')
        $entry=$zip.GetEntry('assets/web/'+$relative)
        if(-not $entry){throw "Missing APK asset: $relative"}
        $stream=$entry.Open();$memory=[IO.MemoryStream]::new();try{$stream.CopyTo($memory);$hash=HashBytes $memory.ToArray()}finally{$stream.Dispose();$memory.Dispose()}
        if($hash -ne (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()){throw "Asset mismatch: $relative"}
    }
    $checks+='All APK web assets match the tested build output'
    if((Get-FileHash (Join-Path $repo 'build/icon.png')).Hash -ne (Get-FileHash (Join-Path $repo 'niulai-android/build/web/assets/icon.png')).Hash){throw 'Windows icon mismatch'}
    $checks+='Exact Windows PNG icon reused by the app and Android build'
    $expected=((Get-Content (Join-Path $repo "release/android/Niulai-Android-$version.apk.sha256") -Raw).Trim() -split '\s+')[0]
    $actual=(Get-FileHash -LiteralPath $apk -Algorithm SHA256).Hash.ToLowerInvariant()
    if($expected -ne $actual){throw 'Published SHA-256 mismatch'}
    $checks+='APK SHA-256 matches delivery checksum'
    [ordered]@{checkedAt=[DateTime]::UtcNow.ToString('o');apk=$apk;bytes=(Get-Item $apk).Length;sha256=$actual;checks=$checks;assetCount=@($files|Where-Object FullName -Like 'assets/web/*').Count}|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $repo "outputs/android/compat-$version/package-verification.json") -Encoding UTF8
    $checks|ForEach-Object{Write-Output "PASS $_"}
}finally{$zip.Dispose()}
