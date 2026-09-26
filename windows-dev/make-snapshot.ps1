# make-snapshot.ps1 - poori repo ka zip (node_modules chor kar) %TEMP% mein
# Recovery point ke liye: .git history included hoti hai.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$stamp = Get-Date -Format 'yyyyMMdd-HHmm'
$work = Join-Path $env:TEMP ("ws-snap-work-" + $stamp)
$zip  = Join-Path $env:TEMP ("ws-snap-" + $stamp + ".zip")

if (Test-Path $zip) { Remove-Item $zip -Force }
New-Item -ItemType Directory -Path $work | Out-Null

# node_modules skip (npm install se wapis ban jata hai), baqi sab including .git
Get-ChildItem -Force $root | Where-Object { $_.Name -ne 'node_modules' } | ForEach-Object {
    Copy-Item -Path $_.FullName -Destination $work -Recurse -Force -ErrorAction SilentlyContinue
}

Compress-Archive -Force -Path (Join-Path $work '*') -DestinationPath $zip
Remove-Item $work -Recurse -Force
$s = Get-Item $zip
Write-Host ("SNAP OK: " + $s.FullName + " (" + [math]::Round($s.Length/1MB,1) + " MB)")
