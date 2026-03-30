#!/bin/bash
echo "======================================"
echo "      AnonChat Bot - Start Script     "
echo "======================================"

while true; do
    echo "Menjalankan Bot..."
    node src/bot.js
    
    echo "--------------------------------------------------------"
    echo "Bot berhenti/direstart. Menghidupkan ulang dalam 2 detik..."
    echo "--------------------------------------------------------"
    sleep 2
done
