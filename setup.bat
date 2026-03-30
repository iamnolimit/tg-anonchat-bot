@echo off
echo ======================================
echo       AnonChat Bot - Setup Script     
echo ======================================

echo [1/3] Menarik update terbaru dari repository...
git pull

echo [2/3] Menginstall dependencies npm...
call npm install

echo [3/3] Menjalankan Bot...
node src/bot.js
pause
