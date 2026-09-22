param(
    [string]$DistIndex = "dist/index.html",
    [string]$AndroidIndex = "android/app/src/main/assets/public/index.html"
)

$ErrorActionPreference = "Stop"

function Get-AssetRefs {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        throw "Dosya bulunamadi: $Path"
    }

    $raw = Get-Content -LiteralPath $Path -Raw
    $js = [regex]::Match($raw, 'src="/assets/([^"]+\.js)"')
    $css = [regex]::Match($raw, 'href="/assets/([^"]+\.css)"')

    if (-not $js.Success) {
        throw "JS asset bulunamadi: $Path"
    }
    if (-not $css.Success) {
        throw "CSS asset bulunamadi: $Path"
    }

    return [pscustomobject]@{
        Js = $js.Groups[1].Value
        Css = $css.Groups[1].Value
    }
}

$dist = Get-AssetRefs -Path $DistIndex
$android = Get-AssetRefs -Path $AndroidIndex

Write-Host "[verify] dist js=$($dist.Js) css=$($dist.Css)"
Write-Host "[verify] android js=$($android.Js) css=$($android.Css)"

if ($dist.Js -ne $android.Js -or $dist.Css -ne $android.Css) {
    throw "Android asset mismatch. once npm run mobile:prepare:android calistirin."
}

Write-Host "[verify] Android web assets guncel."
