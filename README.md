# bullgem.js — CLI Bullgem (gem.bullshot.io)

```
┌──────────────────────────────────────────────┐
│  B U L L G E M   mining companion            │
│  project  Bullshot · gem.bullshot.io         │
│  author   19Seniman                          │
│  build    v1.1.0                             │
└──────────────────────────────────────────────┘
```

## Instalasi

```bash
git clone https://github.com/19seniman/bullgem-cli.git
cd bullgem-cli
npm install
nano .env 
```

## Login (JWT)

1. Buka `https://gem.bullshot.io` dan login seperti biasa
2. **F12** → **Application** → **Local Storage** → `https://gem.bullshot.io`
3. Copy nilai key **`rg_jwt_token`** (string `eyJ...`)
4. Ambil juga cookie Cloudflare: **Network** → filter `gemapi` → klik satu request → **Request Headers** → copy baris **`cookie:`**
5. Isi `.env`:

```ini
JWT=eyJhbGciOi...
```

Cek koneksi:

```bash
node bullgem.js debug     # harapan: HTTP 200 · application/json
node bullgem.js status
```

Kalau `debug` membalas **401**, JWT kedaluwarsa — ambil ulang. Kalau **403**, cookie Cloudflare kedaluwarsa (±30 menit) — ambil ulang. Ambil keduanya sekaligus supaya tidak bolak-balik.

## Auto upgrade

Upgrade dibeli otomatis dari gems sebelum memilih cave berikutnya.

```bash
node bullgem.js upgrades          # daftar + harga
node bullgem.js upgrade           # beli satu yang terbaik & terjangkau
node bullgem.js upgrade --id X    # beli yang tertentu
```

Aturan pemilihan: urut `UPGRADE_PRIORITY` (default `energyCapacity,miningPower,miningSpeed`), hanya yang harganya ≤ `gems − GEM_RESERVE`, lalu harga termurah di antara stat yang sama.

```ini
AUTO_UPGRADE=1
GEM_RESERVE=0
UPGRADE_PRIORITY=energyCapacity,miningPower,miningSpeed
```

Set `AUTO_UPGRADE=0` kalau mau mengumpulkan gems dulu. Endpoint: `GET /upgrades`, `POST /upgrades/{id}`.

## Output

Semua daftar tampil sebagai tabel, bukan JSON mentah:

```
┌─────────────────────────┬───────────────────┬────┬────────┬─────┬───────┐
│ ID                      │ CAVE              │ EP │ DURASI │ LVL │ POWER │
├─────────────────────────┼───────────────────┼────┼────────┼─────┼───────┤
│ greenstone-quarry-83129 │ Greenstone Quarry │ 10 │    10m │   1 │     0 │
│ crystal-cavern-99213    │ Crystal Cavern    │ 20 │    30m │   6 │     8 │
└─────────────────────────┴───────────────────┴────┴────────┴─────┴───────┘

┌──────────────────────────────┬─────────┬───────────┬───────────────┬──────┐
│ QUEST                        │ PERIODE │ STATUS    │        REWARD │ SISA │
├──────────────────────────────┼─────────┼───────────┼───────────────┼──────┤
│ Daily Miner Sign-in          │ daily   │ claimed   │  75 G · 45 XP │    - │
│ Like, Retweet & Comment on X │ daily   │ available │ 105 G · 60 XP │    - │
└──────────────────────────────┴─────────┴───────────┴───────────────┴──────┘
```

Perintah yang memakai tabel: `status`, `locations`, `spots`, `positions`, `quests`.

## Menjalankan script

```bash
node bullgem.js auto               # quest otomatis + loop mining
```

Hentikan dengan `Ctrl+C`.

## Alur mining

1. `GET /user/me` → `level`, `miningPower`, `energy`, `energyCapacity`
2. `GET /mining/locations` → saring `levelRequired`, `miningPowerRequired`, **`energyCost <= energy`**
3. pilih cave dengan `durationSeconds` terpanjang di antara yang terjangkau
4. **Enter mine** → `GET /mining/locations/{id}/spots` → pilih spot terbaik yang terjangkau
5. **Start digging** → `POST /mining/positions {locationId, spotId, strategy}`
6. tunggu `endsAt` → **collect** → ulangi

## Anti-bot / keamanan akun

| Mekanisme | Default |
|---|---|
| Jeda acak antar request | 700–2200 ms |
| Interval loop diacak | poll ±35% |
| Retry 429/5xx | maks 3×, backoff eksponensial |
| Berhenti saat 401 | minta JWT baru, tidak mengulang |
| Berhenti setelah 5 error berturut | tidak terlihat seperti bot |
| Batas putaran | `MAX_ROUNDS` (0 = tanpa batas) |

```ini
HUMAN_MIN_MS=700
HUMAN_MAX_MS=2200
MAX_RETRY=3
MAX_ROUNDS=0
NO_PACING=0
```

Jeda manusiawi menurunkan risiko deteksi, bukan menghilangkannya. Satu akun per IP, jangan 24/7 tanpa jeda, dan `Ctrl+C` kalau server mulai membalas 429 berulang.

## Kalau kena 403 Cloudflare

`gemapi.bullshot.io` dilindungi Cloudflare, jadi `fetch` Node tanpa cookie browser selalu ditolak.

**A. Cookie untuk CLI (dipakai di atas)** — isi `CF_COOKIES` dari DevTools, berlaku ±30 menit dan terikat IP + User-Agent.

**B. Userscript di browser** — `bullgem.user.js` berjalan di dalam halaman, memakai sesi web sendiri, tidak pernah kena Cloudflare. Install Tampermonkey → tempel isi file → buka `gem.bullshot.io` → panel kanan bawah → **start**.

## API yang dipakai

Base: `https://gemapi.bullshot.io/api`

| Fitur | Method | Path | Body |
|---|---|---|---|
| Profil | GET | `/user/me` | — |
| Saldo | GET | `/user/balance` | — |
| Tambang | GET | `/mining/locations` | — |
| Spot | GET | `/mining/locations/{id}/spots` | — |
| Posisi | GET | `/mining/positions` | — |
| Start digging | POST | `/mining/positions` | `{locationId, spotId?, strategy?}` |
| Collect | POST | `/mining/positions/{id}/claim` | — |
| Quest list | GET | `/quests` | — |
| Quest mulai | POST | `/quests/start` | `{questId}` |
| Quest klaim | POST | `/quests/claim` | `{questId, tweetUrl}` |
| Chest | GET/POST | `/chests`, `/chests/{id}/open` | — |

## Catatan

- Token JWT disimpan di `.tokens.json` (mode 600) dan tidak pernah di-commit.
- Quest Twitter/X butuh `--tweet-url`; quest lain diklaim langsung.
- Cek aturan Bullgem soal otomasi sebelum dipakai jangka panjang.
