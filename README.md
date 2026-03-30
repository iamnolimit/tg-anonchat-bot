# 🤖 Telegram AnonChat Bot

Bot obrolan anonim Telegram mirip [@chatbot](https://t.me/chatbot) dengan sistem pairing, langganan VIP/Premium via Telegram Stars, panel admin, dan database lokal SQLite.

---

## 🚀 Cara Menjalankan

### 1. Clone & Install

```bash
cd tg-anonchat-bot
npm install
```

### 2. Konfigurasi

```bash
cp .env.example .env
```

Edit `.env`:

```env
BOT_TOKEN=token_dari_botfather
BOT_USERNAME=username_bot_kamu
ADMIN_IDS=123456789
LOG_GROUP_ID=-100xxxxxxxxxx
PAYSUPPORT_LINK=https://t.me/yoursupport
```

> **Catatan**: Bot harus menjadi admin di `LOG_GROUP_ID` untuk bisa mengirim log.

### 3. Jalankan

```bash
npm start
# atau untuk development (auto-restart):
npm run dev
```

---

## 📋 Daftar Perintah

| Perintah | Deskripsi |
|---|---|
| `/start` | Mulai bot & cari pasangan |
| `/search` | Cari pasangan baru |
| `/next` | Ganti pasangan |
| `/stop` | Hentikan percakapan |
| `/link` | Bagikan profil Telegram ke pasangan |
| `/settings` | Atur usia, gender, bahasa |
| `/pay` | Berlangganan Premium (300 Stars / 3 bulan) |
| `/vip` | Berlangganan VIP (1000 Stars / 12 bulan) |
| `/paysupport` | Hubungi support pembayaran |
| `/help` | Panduan penggunaan |
| `/rules` | Peraturan bot |
| `/terms` | Syarat & Ketentuan |
| `/admin` | Panel admin (hanya admin) |

---

## 💎 Tier Langganan

| Tier | Harga | Durasi | Fitur |
|---|---|---|---|
| **Free** | Gratis | — | Chat anonim dasar, ada iklan |
| **Premium** | 300 ⭐ Stars | 3 bulan | Filter gender, tanpa iklan, prioritas pencarian, badge |
| **VIP** | 1000 ⭐ Stars | 12 bulan | Semua Premium + badge VIP terlihat pasangan, prioritas tertinggi |

---

## 🛡 Panel Admin (`/admin`)

- 📊 **Statistik** — total user, chat aktif, antrian, sesi hari ini
- 📡 **Kelola FSUB** — tambah/hapus channel wajib join, aktifkan/nonaktifkan
- 📤 **Media Log** — toggle forward media ke log grup
- 💾 **Backup DB** — backup manual database SQLite
- 📣 **Broadcast** — kirim pesan ke semua pengguna
- 🔨 **Ban/Unban** — blokir/aktifkan kembali user
- 🔧 **Maintenance** — mode pemeliharaan (non-admin tidak bisa pakai bot)

---

## 🚨 Sistem Laporan

Setelah percakapan berakhir, pengguna dapat melaporkan pasangannya. Kategori:
- 🚫 Spam | 📢 Iklan | 🛒 Berjualan | 👶 Kekerasan Anak
- 🙏 Mengemis | 💢 Menghina | ⚔️ Kekerasan | ☠️ Propaganda Bunuh Diri | 🔞 Vulgar

Laporan dikirim ke `LOG_GROUP_ID` dengan tombol **Ban User**.

---

## 💾 Database

- SQLite lokal di `db/data.db`
- Auto-backup setiap hari pukul **00:00 WIB** → `db/backups/`
- Backup manual tersedia di panel `/admin`

---

## 📁 Struktur Proyek

```
tg-anonchat-bot/
├── src/
│   ├── bot.js           ← Entry point utama
│   ├── matching.js      ← Engine pairing
│   ├── relay.js         ← Relay pesan antar pasangan
│   ├── middleware.js     ← Ban, FSUB, rate limit
│   └── utils.js         ← Helper & l10n
├── commands/
│   ├── start.js         ← /start, /search
│   ├── chat.js          ← /next, /stop, /link
│   ├── settings.js      ← /settings
│   ├── pay.js           ← /pay, /vip, /paysupport
│   ├── info.js          ← /help, /rules, /terms
│   ├── report.js        ← Sistem laporan
│   └── admin.js         ← /admin panel
├── db/
│   ├── database.js      ← CRUD helpers SQLite
│   └── backups/         ← Folder backup otomatis
├── locales/
│   ├── id.json          ← Teks Indonesia
│   └── en.json          ← Teks English
├── config.js
├── .env.example
└── package.json
```

---

## ⚠️ Catatan Penting

1. **Telegram Stars** hanya dapat diuji di bot production (bukan test bot)
2. Bot harus menjadi **admin** di log grup dan channel FSUB
3. Untuk `/link` bekerja, username bot harus diset di `.env`
4. **Node.js 18+** diperlukan
