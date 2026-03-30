@echo off
echo ======================================
echo       AnonChat Bot - Start Script     
echo ======================================

:loop
echo Menjalankan Bot...
node src/bot.js

echo --------------------------------------------------------
echo Bot berhenti/direstart. Menghidupkan ulang dalam 2 detik...
echo --------------------------------------------------------
timeout /t 2 /nobreak >nul
goto loop
