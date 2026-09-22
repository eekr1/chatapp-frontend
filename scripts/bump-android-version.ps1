param(
    [switch]$SkipVersionNamePatch
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$gradlePath = Join-Path $repoRoot "android\app\build.gradle"

if (-not (Test-Path $gradlePath)) {
    throw "android/app/build.gradle bulunamadi: $gradlePath"
}

$content = Get-Content -Path $gradlePath -Raw -Encoding UTF8

$versionCodePattern = '(?m)^(\s*versionCode\s+)(\d+)\s*$'
$versionCodeMatch = [regex]::Match($content, $versionCodePattern)
if (-not $versionCodeMatch.Success) {
    throw "versionCode satiri bulunamadi."
}

$currentVersionCode = [int]$versionCodeMatch.Groups[2].Value
$nextVersionCode = $currentVersionCode + 1

$content = [regex]::Replace(
    $content,
    $versionCodePattern,
    { param($m) "$($m.Groups[1].Value)$nextVersionCode" },
    1
)

$nextVersionName = $null
if (-not $SkipVersionNamePatch) {
    $versionNamePattern = '(?m)^(\s*versionName\s+")([0-9]+(?:\.[0-9]+){0,2})(")\s*$'
    $versionNameMatch = [regex]::Match($content, $versionNamePattern)
    if ($versionNameMatch.Success) {
        $parts = $versionNameMatch.Groups[2].Value.Split('.')
        if ($parts.Count -lt 3) {
            while ($parts.Count -lt 3) { $parts += '0' }
        }

        $major = [int]$parts[0]
        $minor = [int]$parts[1]
        $patch = [int]$parts[2] + 1
        $nextVersionName = "$major.$minor.$patch"

        $content = [regex]::Replace(
            $content,
            $versionNamePattern,
            { param($m) "$($m.Groups[1].Value)$nextVersionName$($m.Groups[3].Value)" },
            1
        )
    }
}

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($gradlePath, $content, $utf8NoBom)

Write-Host "versionCode: $currentVersionCode -> $nextVersionCode"
if ($nextVersionName) {
    Write-Host "versionName: $($versionNameMatch.Groups[2].Value) -> $nextVersionName"
} else {
    Write-Host "versionName degistirilmedi."
}