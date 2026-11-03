param([string]$WindowsSdk = '')
$ErrorActionPreference = 'Stop'
$repository = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$destination = Join-Path $repository '.tools/publication'
New-Item -ItemType Directory -Force $destination | Out-Null
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
$installation = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (!$installation) { throw 'Publication helper requires MSVC x64 build tools; no compiler is installed automatically.' }
$vcvars = Join-Path $installation 'VC/Auxiliary/Build/vcvars64.bat'
if (!$WindowsSdk) { $WindowsSdk = 'default' }
& (Join-Path $PSScriptRoot 'build-publication.cmd') $vcvars $destination $WindowsSdk
if ($LASTEXITCODE -ne 0) { throw "Publication helper build failed: $LASTEXITCODE" }
