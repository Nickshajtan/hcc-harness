param([string]$WindowsSdk = '')
$ErrorActionPreference = 'Stop'
$repository = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$destination = Join-Path $repository '.test-state/b1-bootstrap'
New-Item -ItemType Directory -Force $destination | Out-Null
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
$installation = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (!$installation) { throw 'B1 prototype requires Visual C++ x64 build tools; no compiler is installed automatically.' }
$vcvars = Join-Path $installation 'VC/Auxiliary/Build/vcvars64.bat'
& (Join-Path $PSScriptRoot 'build-bootstrap.cmd') $vcvars $destination $WindowsSdk
if ($LASTEXITCODE -ne 0) { throw "B1 native prototype build failed: $LASTEXITCODE" }
Write-Output (Join-Path $destination 'arch-bootstrap.exe')
