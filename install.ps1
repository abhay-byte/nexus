$ErrorActionPreference = "Stop"

$ReleaseBase = "https://github.com/abhay-byte/nexus/releases/latest/download"
$InstallDir = Join-Path $env:LOCALAPPDATA "Programs\Nexus"
$TempDir = Join-Path ([System.IO.Path]::GetTempPath()) ([System.Guid]::NewGuid().ToString())

function Get-Arch {
  switch ([System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture) {
    "X64" { return "x64" }
    "Arm64" { return "arm64" }
    default { throw "Unsupported Windows architecture: $([System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture)" }
  }
}

function Add-UserPath([string]$PathEntry) {
  $Current = [Environment]::GetEnvironmentVariable("Path", "User")
  $Parts = @()

  if ($Current) {
    $Parts = $Current.Split(";") | Where-Object { $_ }
  }

  if ($Parts -contains $PathEntry) {
    return
  }

  $Updated = ($Parts + $PathEntry) -join ";"
  [Environment]::SetEnvironmentVariable("Path", $Updated, "User")
}

try {
  $Arch = Get-Arch
  $Asset = "Nexus_windows_$Arch.zip"
  $ArchivePath = Join-Path $TempDir $Asset

  New-Item -ItemType Directory -Force -Path $TempDir | Out-Null
  New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

  Write-Host "Downloading $Asset from the latest release..."
  Invoke-WebRequest -Uri "$ReleaseBase/$Asset" -OutFile $ArchivePath

  Write-Host "Extracting package..."
  Get-ChildItem -Path $InstallDir -Force | Remove-Item -Recurse -Force
  Expand-Archive -Path $ArchivePath -DestinationPath $InstallDir -Force

  $PackageDir = Join-Path $InstallDir "Nexus_windows_$Arch"
  if (-not (Test-Path (Join-Path $PackageDir "nexus.exe"))) {
    throw "Package is missing nexus.exe"
  }

  Add-UserPath $PackageDir

  Write-Host ""
  Write-Host "Nexus installed to $PackageDir"
  Write-Host "Run nexus.exe from a new terminal session."
}
finally {
  if (Test-Path $TempDir) {
    Remove-Item $TempDir -Recurse -Force
  }
}
