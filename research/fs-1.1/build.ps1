param([Parameter(Mandatory=$true)][string]$OutputDirectory, [string]$WindowsSdk = '')
$ErrorActionPreference = 'Stop'
$destination = [IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Force $destination | Out-Null
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
$installation = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (!$installation) { throw 'Install MSVC x64 build tools and a Windows SDK first.' }
if (!$WindowsSdk) { $WindowsSdk = 'default' }
& (Join-Path $PSScriptRoot 'build.cmd') (Join-Path $installation 'VC/Auxiliary/Build/vcvars64.bat') $destination $WindowsSdk
if ($LASTEXITCODE -ne 0) { throw "Prototype build failed: $LASTEXITCODE" }
