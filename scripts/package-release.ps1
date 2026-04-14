param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("x64", "arm64")]
  [string]$Arch,

  [Parameter(Mandatory = $true)]
  [string]$BinaryPath
)

$ErrorActionPreference = "Stop"

$RootDir = Resolve-Path (Join-Path $PSScriptRoot "..")
$ResolvedBinary = Join-Path $RootDir $BinaryPath

if (-not (Test-Path $ResolvedBinary)) {
  throw "binary not found: $BinaryPath"
}

$OutputDir = Join-Path $RootDir "dist/release"
$PackageName = "Nexus_windows_$Arch"
$StageDir = Join-Path ([System.IO.Path]::GetTempPath()) ([System.Guid]::NewGuid().ToString())
$PackageDir = Join-Path $StageDir $PackageName
$ZipPath = Join-Path $OutputDir "$PackageName.zip"

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
New-Item -ItemType Directory -Force -Path $PackageDir | Out-Null

try {
  Copy-Item $ResolvedBinary (Join-Path $PackageDir "nexus.exe")
  Set-Content -Path (Join-Path $PackageDir "README.txt") -Value @(
    "Nexus package for Windows $Arch",
    "",
    "Extract this archive and run nexus.exe."
  )

  if (Test-Path $ZipPath) {
    Remove-Item $ZipPath -Force
  }

  Compress-Archive -Path (Join-Path $StageDir $PackageName) -DestinationPath $ZipPath
  Write-Host "created $ZipPath"
}
finally {
  if (Test-Path $StageDir) {
    Remove-Item $StageDir -Recurse -Force
  }
}
