param(
  [string]$Url = "https://keyprint-two.vercel.app/home"
)

$candidates = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles}\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
)

$browser = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1

if ($browser) {
  Start-Process -FilePath $browser -ArgumentList "--app=$Url", "--window-size=1280,860"
  Write-Host "Launched Keyprint standalone desktop app window ($Url)"
} else {
  Start-Process $Url
  Write-Host "Opened Keyprint in default browser ($Url)"
}
