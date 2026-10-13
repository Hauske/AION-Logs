# Builds the installer and what a release carries beside it, into .\release:
#
#   AION-Logs_<version>_x64.msi   the installer
#   latest.json                   what installed copies read to find a newer
#                                 version (see UPDATE_REPO in src-tauri/src/app.rs)
#
#   .\release.ps1                          build the current version
#   .\release.ps1 -Version 1.0.1           set the version first, then build
#   .\release.ps1 -Version 1.0.1 -Publish  and publish it as a GitHub release
#
# Publishing needs the GitHub CLI signed in (gh auth login). Commit and push
# the version change as well, so the tag the release makes holds it.
param(
    [string]$Version,
    [switch]$Publish
)
$ErrorActionPreference = "Stop"
$repo = "Hauske/AION-Logs"
$root = $PSScriptRoot
$utf8 = New-Object System.Text.UTF8Encoding $false

function Set-VersionIn($path, $pattern, $replacement) {
    $text = [IO.File]::ReadAllText($path)
    $regex = New-Object System.Text.RegularExpressions.Regex $pattern, "Multiline"
    if (-not $regex.IsMatch($text)) { throw "no version found in $path" }
    [IO.File]::WriteAllText($path, $regex.Replace($text, $replacement, 1), $utf8)
}

if ($Version) {
    if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw "a version looks like 1.0.1" }
    # The version is written in three places; the first match in each is the app's own.
    Set-VersionIn "$root\src-tauri\tauri.conf.json" '^(\s*"version":\s*")[^"]+(")' "`${1}$Version`${2}"
    Set-VersionIn "$root\package.json" '^(\s*"version":\s*")[^"]+(")' "`${1}$Version`${2}"
    Set-VersionIn "$root\src-tauri\Cargo.toml" '^(version\s*=\s*")[^"]+(")' "`${1}$Version`${2}"
}
$Version = ([IO.File]::ReadAllText("$root\src-tauri\tauri.conf.json") | ConvertFrom-Json).version

Push-Location $root
try {
    $ErrorActionPreference = "Continue"
    npm run tauri build
    $built = $LASTEXITCODE
    $ErrorActionPreference = "Stop"
    if ($built -ne 0) { throw "the build failed" }
} finally {
    Pop-Location
}

$out = "$root\release"
New-Item -ItemType Directory -Force $out | Out-Null
$name = "AION-Logs_${Version}_x64.msi"
Copy-Item "$root\src-tauri\target\release\bundle\msi\AION Logs_${Version}_x64_en-US.msi" "$out\$name" -Force
$manifest = [ordered]@{
    version   = $Version
    msiUrl    = "https://github.com/$repo/releases/download/v$Version/$name"
    msiSha256 = (Get-FileHash "$out\$name" -Algorithm SHA256).Hash.ToLower()
}
[IO.File]::WriteAllText("$out\latest.json", ($manifest | ConvertTo-Json), $utf8)
"Built $out\$name"

if ($Publish) {
    gh release create "v$Version" "$out\$name" "$out\latest.json" --repo $repo --title "AION Logs $Version" --generate-notes
    if ($LASTEXITCODE -ne 0) { throw "the release was not published" }
}
