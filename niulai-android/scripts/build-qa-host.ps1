$ErrorActionPreference='Stop'
$repo=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$project=Join-Path $repo 'niulai-android'
$sdk=Join-Path $repo '.tools/android-sdk'
$android=Join-Path $sdk 'platforms/android-35/android.jar'
$toolsDir=Get-ChildItem (Join-Path $sdk 'build-tools') -Directory|Sort-Object Name -Descending|Select-Object -First 1
$java=Split-Path (Get-Command javac.exe).Source -Parent
$build=Join-Path $env:LOCALAPPDATA 'NiulaiAndroidQaHost'
New-Item -ItemType Directory -Force $build,(Join-Path $build 'classes'),(Join-Path $build 'dex')|Out-Null
function Check($step){if($LASTEXITCODE -ne 0){throw "$step failed"}}
Copy-Item -LiteralPath $android -Destination (Join-Path $build 'android.jar') -Force
$android=Join-Path $build 'android.jar'
Copy-Item -LiteralPath (Join-Path $project 'tests/instrumentation/AndroidManifest.xml') -Destination (Join-Path $build 'AndroidManifest.xml') -Force
Copy-Item -LiteralPath (Join-Path $project 'tests/instrumentation/FeatureInstrumentation.java') -Destination (Join-Path $build 'FeatureInstrumentation.java') -Force
& (Join-Path $java 'javac.exe') --release 8 -classpath $android -d (Join-Path $build 'classes') (Join-Path $build 'FeatureInstrumentation.java');Check 'Compile QA host'
$classes=@(Get-ChildItem (Join-Path $build 'classes') -Filter '*.class' -Recurse|ForEach-Object FullName)
& (Join-Path $java 'java.exe') -cp (Join-Path $toolsDir.FullName 'lib/d8.jar') com.android.tools.r8.D8 --release --min-api 26 --lib $android --output (Join-Path $build 'dex') @classes;Check 'Dex QA host'
$unsigned=Join-Path $build 'unsigned.apk'
& (Join-Path $toolsDir.FullName 'aapt2.exe') link -o $unsigned -I $android --manifest (Join-Path $build 'AndroidManifest.xml');Check 'Package QA host'
Push-Location (Join-Path $build 'dex')
try{& (Join-Path $java 'jar.exe') u0f $unsigned classes.dex;Check 'Add QA dex'}finally{Pop-Location}
$aligned=Join-Path $build 'aligned.apk'
& (Join-Path $toolsDir.FullName 'zipalign.exe') -f -p 4 $unsigned $aligned;Check 'Align QA host'
$out=Join-Path $repo 'outputs/android/compat-1.3.0/qa-host.apk'
$env:NIULAI_KEY_PASSWORD='niulai-local-install'
& (Join-Path $java 'java.exe') -jar (Join-Path $toolsDir.FullName 'lib/apksigner.jar') sign --ks (Join-Path $project '.signing/niulai-local.p12') --ks-key-alias niulai --ks-pass env:NIULAI_KEY_PASSWORD --out $out $aligned;Check 'Sign QA host'
Write-Output $out
