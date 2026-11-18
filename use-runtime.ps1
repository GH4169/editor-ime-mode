param([string]$BackupDirectory)
$ErrorActionPreference = 'Stop'
$runtime = Join-Path $env:LOCALAPPDATA 'editor-tools\Code-1.145.2\Code.exe'
$original = Join-Path $env:LOCALAPPDATA 'Programs\Microsoft VS Code\Code.exe'
if (-not (Test-Path -LiteralPath $runtime)) { throw 'Verified user runtime is missing' }
if (-not $BackupDirectory) {
    $BackupDirectory = Join-Path $env:LOCALAPPDATA ('editor-tools\shortcut-backups\' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
}
New-Item -ItemType Directory -Force -Path $BackupDirectory | Out-Null
$shell = New-Object -ComObject WScript.Shell
$roots = @(
    [Environment]::GetFolderPath('Desktop'),
    (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'),
    (Join-Path $env:APPDATA 'Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar')
)
$updated = @()
foreach ($root in $roots) {
    if (-not (Test-Path -LiteralPath $root)) { continue }
    foreach ($file in Get-ChildItem -LiteralPath $root -Filter '*.lnk' -File -Recurse) {
        $link = $shell.CreateShortcut($file.FullName)
        if ($link.TargetPath -ine $original) { continue }
        $backup = Join-Path $BackupDirectory ($updated.Count.ToString() + '.lnk')
        Copy-Item -LiteralPath $file.FullName -Destination $backup
        $link.TargetPath = $runtime
        $link.WorkingDirectory = Split-Path -Parent $runtime
        $link.IconLocation = "$runtime,0"
        $link.Save()
        $updated += [pscustomobject]@{path=$file.FullName; backup=$backup; target=$runtime}
    }
}
$updated | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $BackupDirectory 'manifest.json') -Encoding UTF8
$updated | ConvertTo-Json -Compress
