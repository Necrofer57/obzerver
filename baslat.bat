@echo off
chcp 65001 >nul
echo Obzerver yerel sunucusu başlatılıyor: http://localhost:8080
start "" "http://localhost:8080"
powershell -ExecutionPolicy Bypass -File "%~dp0server.ps1"
