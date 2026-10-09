@echo off
cd /d "%~dp0"
start "" http://localhost:3434
node servidor.js
pause
