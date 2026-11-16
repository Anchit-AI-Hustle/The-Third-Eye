# Installs the listener on this PC: starts at sign-in, runs in the background,
# listens for "Hey JARVIS" and, given the token from Settings, logs the day.
# Usage: & ([scriptblock]::Create((irm <site>/wake/install-windows.ps1))) <token>
param([string]$Token = "", [switch]$EnableLifeLog)
# Remove it: delete "Third Eye wake.lnk" from shell:startup and the folder %LOCALAPPDATA%\ThirdEyeWake.
$ErrorActionPreference = "Stop"
$Site = if ($env:THIRD_EYE_URL) { $env:THIRD_EYE_URL } else { "https://the-third-eye.anchit-tandon.com" }
$Dir = Join-Path $env:LOCALAPPDATA "ThirdEyeWake"
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
  Write-Host "Python 3 is needed. Install it from https://www.python.org/downloads/ (tick 'Add to PATH') and run this again."
  return
}
New-Item -ItemType Directory -Force $Dir | Out-Null
Write-Host "Installing into $Dir ..."
python -m venv (Join-Path $Dir "venv")
& (Join-Path $Dir "venv\Scripts\pip.exe") install -q --upgrade pip vosk sounddevice
Invoke-WebRequest "$Site/wake/wake.py" -OutFile (Join-Path $Dir "wake.py")
if ($EnableLifeLog -and -not $Token) { throw "A Life Log token is required for this explicit mode." }
if ($Token -and -not $EnableLifeLog) { throw "Use -EnableLifeLog only if you want ambient recording. No token is needed for wake-only." }
if ($EnableLifeLog) { Set-Content -NoNewline -Path (Join-Path $Dir "token") -Value $Token }
$LogMode = if ($EnableLifeLog) { "1" } else { "0" }
[Environment]::SetEnvironmentVariable("THIRD_EYE_LIFELOG", $LogMode, "User")
$env:THIRD_EYE_LIFELOG = $LogMode
if (-not (Test-Path (Join-Path $Dir "model"))) {
  Write-Host "Downloading the offline voice model (36 MB, once) ..."
  $zip = Join-Path $Dir "model.zip"
  Invoke-WebRequest "https://alphacephei.com/vosk/models/vosk-model-small-en-in-0.4.zip" -OutFile $zip
  Expand-Archive $zip -DestinationPath $Dir -Force
  Remove-Item $zip
  Rename-Item (Join-Path $Dir "vosk-model-small-en-in-0.4") "model"
}
[Environment]::SetEnvironmentVariable("THIRD_EYE_URL", $Site, "User")
$pyw = Join-Path $Dir "venv\Scripts\pythonw.exe"
$script = Join-Path $Dir "wake.py"
$link = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path ([Environment]::GetFolderPath("Startup")) "Third Eye wake.lnk"))
$link.TargetPath = $pyw
$link.Arguments = "`"$script`""
$link.Save()
Start-Process $pyw "`"$script`""
Write-Host "Done. Say ""Hey JARVIS"" any time."

if (-not $EnableLifeLog) { Write-Host "Wake-only mode. No ambient audio is uploaded or filed to Life Log." }
