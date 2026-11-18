$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$target = Join-Path $root 'build\native-ime-probe.exe'
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
& "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe" /nologo /target:exe /main:NativeImeProbe /reference:System.Windows.Forms.dll /reference:System.Drawing.dll "/out:$target" (Join-Path $root 'native\EditorImeHost.cs') (Join-Path $root 'test\NativeImeProbe.cs')
if ($LASTEXITCODE -ne 0) { throw 'Native IME probe compilation failed' }
& $target
if ($LASTEXITCODE -ne 0) { throw 'Native IME probe failed' }
