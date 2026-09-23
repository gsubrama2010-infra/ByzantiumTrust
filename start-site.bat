@echo off
rem Starts the Byzantium Trust site on 127.0.0.1:8088 and the Cloudflare tunnel (joethn.shop) in the background.
cd /d "%~dp0"
powershell.exe -NoProfile -Command ^
  "if (-not (Get-NetTCPConnection -LocalPort 8088 -State Listen -ErrorAction SilentlyContinue)) { Start-Process node -ArgumentList 'server.js' -WorkingDirectory '%~dp0' -WindowStyle Hidden };" ^
  "$t = Get-CimInstance Win32_Process -Filter \"Name = 'cloudflared.exe'\" | Where-Object { $_.CommandLine -match 'tunnel\s+run\s+mm-suite' };" ^
  "if (-not $t) { Start-Process cloudflared.exe -ArgumentList 'tunnel','run','mm-suite' -WindowStyle Hidden }"
echo Site: http://127.0.0.1:8088  ^|  Public: https://joethn.shop
