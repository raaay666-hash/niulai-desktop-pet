param([string]$SdkRoot = '', [string]$KeyStore = '', [string]$KeyAlias = 'niulai')
$ErrorActionPreference = 'Stop'
$project = Split-Path $PSScriptRoot -Parent
$repo = Split-Path $project -Parent
$version=(Get-Content -LiteralPath (Join-Path $project 'package.json') -Raw -Encoding UTF8|ConvertFrom-Json).version
if (-not $SdkRoot) {
    if ($env:ANDROID_HOME) { $SdkRoot = $env:ANDROID_HOME }
    elseif ($env:ANDROID_SDK_ROOT) { $SdkRoot = $env:ANDROID_SDK_ROOT }
    else { $SdkRoot = Join-Path $repo '.tools/android-sdk' }
}
$sdk = (Resolve-Path -LiteralPath $SdkRoot).Path
$platform = Join-Path $sdk 'platforms/android-35/android.jar'
$toolsDir = Get-ChildItem -LiteralPath (Join-Path $sdk 'build-tools') -Directory | Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'aapt2.exe') } | Sort-Object Name -Descending | Select-Object -First 1
if (-not $toolsDir -or -not (Test-Path -LiteralPath $platform)) { throw 'Install Android SDK platform 35 and build-tools 35 first.' }
$tools = $toolsDir.FullName
$java = Split-Path (Get-Command javac.exe -ErrorAction Stop).Source -Parent
$buildDir = Join-Path $env:LOCALAPPDATA 'NiulaiAndroidBuild'
$classes = Join-Path $buildDir 'classes'
$dex = Join-Path $buildDir 'dex'
$res = Join-Path $buildDir 'res/drawable'
$stage = Join-Path $buildDir 'apk-stage'
New-Item -ItemType Directory -Force $classes,$dex,$res,$stage | Out-Null
foreach($target in @($classes,$dex,$res,$stage,(Join-Path $buildDir 'web'),(Join-Path $buildDir 'assets'))){
    $absolute=[IO.Path]::GetFullPath($target);$allowed=[IO.Path]::GetFullPath($buildDir)+[IO.Path]::DirectorySeparatorChar
    if(-not $absolute.StartsWith($allowed,[StringComparison]::OrdinalIgnoreCase)){throw 'Build cleanup target escaped the staging directory'}
    if(Test-Path -LiteralPath $absolute){Remove-Item -LiteralPath $absolute -Recurse -Force}
}
New-Item -ItemType Directory -Force $classes,$dex,$res,$stage | Out-Null
Copy-Item -LiteralPath $platform -Destination (Join-Path $buildDir 'android.jar') -Force
$platform = Join-Path $buildDir 'android.jar'
function Check([string]$Step) { if ($LASTEXITCODE -ne 0) { throw "$Step failed ($LASTEXITCODE)" } }
Push-Location $repo
try { & node.exe (Join-Path $PSScriptRoot 'prepare.mjs'); Check 'Web build' } finally { Pop-Location }
Copy-Item -LiteralPath (Join-Path $project 'build/web') -Destination $buildDir -Recurse -Force
Copy-Item -LiteralPath (Join-Path $project 'app/src/main/AndroidManifest.xml') -Destination (Join-Path $buildDir 'AndroidManifest.xml') -Force
Copy-Item -LiteralPath (Join-Path $project 'app/src/main/res') -Destination $buildDir -Recurse -Force
Copy-Item -LiteralPath (Join-Path $repo 'build/icon.png') -Destination (Join-Path $res 'icon.png') -Force
& (Join-Path $tools 'aapt2.exe') compile --dir (Join-Path $buildDir 'res') -o (Join-Path $buildDir 'resources.zip'); Check 'Resource compile'
$unsigned = Join-Path $buildDir 'unsigned.apk'
$assets = Join-Path $buildDir 'assets'
New-Item -ItemType Directory -Force $assets | Out-Null
Copy-Item -LiteralPath (Join-Path $buildDir 'web') -Destination $assets -Recurse -Force
& (Join-Path $tools 'aapt2.exe') link -o $unsigned -I $platform --manifest (Join-Path $buildDir 'AndroidManifest.xml') --min-sdk-version 26 --target-sdk-version 35 (Join-Path $buildDir 'resources.zip'); Check 'APK resource link'
$sources = @(Get-ChildItem -LiteralPath (Join-Path $project 'app/src/main/java') -Recurse -Filter '*.java' | ForEach-Object FullName)
& (Join-Path $java 'javac.exe') -encoding UTF-8 --release 8 -classpath $platform -d $classes @sources; Check 'Java compile'
$classFiles = @(Get-ChildItem -LiteralPath $classes -Recurse -Filter '*.class' | ForEach-Object FullName)
# Invoke d8 via Java directly to preserve Chinese paths and spaces.
& (Join-Path $java 'java.exe') -cp (Join-Path $tools 'lib/d8.jar') com.android.tools.r8.D8 --release --min-api 26 --lib $platform --output $dex @classFiles; Check 'DEX compile'
Copy-Item -LiteralPath (Join-Path $dex 'classes.dex') -Destination $stage -Force
Push-Location $stage
try {
    # jar normalizes ZIP separators; Windows aapt2 -A can emit backslashes that Android cannot open.
    & (Join-Path $java 'jar.exe') u0f $unsigned classes.dex -C $buildDir assets; Check 'DEX and asset package'
} finally { Pop-Location }
$entries = & (Join-Path $java 'jar.exe') tf $unsigned
if ($entries -notcontains 'assets/web/index.html' -or ($entries | Where-Object { $_.Contains('\') -or $_ -match '\.glb$|three' })) { throw 'Invalid APK asset paths or unexpected 3D assets.' }
$aligned = Join-Path $buildDir 'aligned.apk'
& (Join-Path $tools 'zipalign.exe') -f -p 4 $unsigned $aligned; Check 'Zip alignment'
if (-not $KeyStore) {
    $signing = Join-Path $project '.signing'
    New-Item -ItemType Directory -Force $signing | Out-Null
    $KeyStore = Join-Path $signing 'niulai-local.p12'
    # This persistent local distribution key is excluded from source control and delivery ZIPs.
    $env:NIULAI_KEY_PASSWORD = 'niulai-local-install'
    if (-not (Test-Path -LiteralPath $KeyStore)) {
        & (Join-Path $java 'keytool.exe') -genkeypair -keystore $KeyStore -storetype PKCS12 -storepass:env NIULAI_KEY_PASSWORD -alias $KeyAlias -keyalg RSA -keysize 3072 -validity 10000 -dname 'CN=Niulai Android Local, O=Niulai, C=CN'; Check 'Signing key creation'
    }
}
if (-not $env:NIULAI_KEY_PASSWORD) { throw 'Set NIULAI_KEY_PASSWORD for the supplied keystore.' }
$release = Join-Path $repo 'release/android'
New-Item -ItemType Directory -Force $release | Out-Null
$apk = Join-Path $release "Niulai-Android-$version.apk"
& (Join-Path $java 'java.exe') -jar (Join-Path $tools 'lib/apksigner.jar') sign --ks $KeyStore --ks-key-alias $KeyAlias --ks-pass env:NIULAI_KEY_PASSWORD --out $apk $aligned; Check 'APK signing'
& (Join-Path $java 'java.exe') -jar (Join-Path $tools 'lib/apksigner.jar') verify --verbose --print-certs $apk; Check 'Signature verification'
& (Join-Path $tools 'zipalign.exe') -c -p 4 $apk; Check 'Final alignment'
$hash = (Get-FileHash -LiteralPath $apk -Algorithm SHA256).Hash.ToLowerInvariant()
Set-Content -LiteralPath (Join-Path $release "Niulai-Android-$version.apk.sha256") -Value "$hash  Niulai-Android-$version.apk" -Encoding ascii
Write-Output "APK ready: $apk"
Write-Output "SHA256: $hash"
