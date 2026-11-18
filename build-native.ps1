$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$target = Join-Path $root 'build\editor-ime-host.exe'
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
& "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe" /nologo /target:exe /optimize+ /platform:x64 "/out:$target" (Join-Path $root 'native\EditorImeHost.cs')
if ($LASTEXITCODE -ne 0) { throw 'Windows IME helper compilation failed' }
Write-Output $target
