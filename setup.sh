#!/bin/bash
echo "======================================"
echo "      AnonChat Bot - Setup Script     "
echo "======================================"

echo "[1/4] Menginstall atau memperbarui Node.js (v20)..."
if command -v apt-get >/dev/null; then
    export DEBIAN_FRONTEND=noninteractive
    sudo -E apt-get update
    sudo -E apt-get install -y curl
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo -E apt-get install -y nodejs
else
    echo "Peringatan: Script ini menggunakan 'apt-get' yang mungkin tidak tersedia di OS ini."
fi

echo "[2/4] Menarik update terbaru dari repository..."
git pull

echo "[3/4] Auto install/update dependensi (node_modules)..."
if [ ! -d "node_modules" ]; then
    echo "Folder node_modules tidak ditemukan. Melakukan instalasi awal..."
    npm install
else
    echo "Mengecek dan memperbarui dependensi npm..."
    npm install
fi

echo "[4/4] Menjalankan Bot..."
node src/bot.js
