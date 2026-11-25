# bullgem.js — CLI Bullgem (gem.bullshot.io)

Login pakai private key (EIP-191) atau email + OTP, lalu otomatis klaim quest dan jalankan mining.

## Instalasi

```bash
git clone https://github.com/19seniman/bullgem-cli.git
cd bullgem-cli
npm install
cp .env.example .env
```

Buka `.env`, isi salah satu:

```ini
PRIVATE_KEY=0x....        # wallet login (tanda tangan lokal)
EMAIL=kamu@mail.com       # atau login email + OTP
```

Lalu login dan cek akun:

```bash
node bullgem.js login
node bullgem.js status
```

Kalau `login` sukses tapi `status` gagal 401, jalankan `node bullgem.js login` lagi — token JWT disimpan di `.tokens.json` dan berlaku terbatas.

## Menjalankan

```bash
node bullgem.js quests          # lihat daftar quest
node bullgem.js quests --auto   # kerjakan + klaim otomatis
node bullgem.js locations       # daftar tambang
node bullgem.js mine            # loop mining (klaim → mulai → tunggu)
node bullgem.js auto            # quest otomatis + mining sekaligus
```

Hentikan dengan `Ctrl+C`. Interval poll diatur `POLL_SECONDS` (default 30 detik).

## Termux (Android)

```bash
pkg install nodejs git -y
git clone https://github.com/19seniman/bullgem-cli.git
cd bullgem-cli && npm install
cp .env.example .env && nano .env
node bullgem.js login
termux-wake-lock
node bullgem.js auto
```

## Alur "Enter mine" + "Start digging"

`mine` menentukan cave dari kondisi akun, bukan menebak:

1. `GET /user/me` → ambil `level`, `miningPower`, `energy` (script mencoba beberapa nama field: `energy`, `energyPoints`, `stats.energy`, …)
2. `GET /mining/locations` → saring: `levelRequired <= level`, `miningPowerRequired <= power`, **`energyCost <= energy`**
3. pilih yang `durationSeconds` paling panjang di antara yang terjangkau (reward terbaik)
4. **Enter mine** → `GET /mining/locations/{id}/spots`, pilih spot yang tidak terkunci dan cocok level/power
5. **Start digging** → `POST /mining/positions {locationId, spotId, strategy}`
6. tunggu `endsAt` → `POST /mining/positions/{id}/claim` → ulang

Kalau energy tidak cukup untuk cave termurah, loop **tidak** memaksa masuk: dia menghitung kekurangan EP (refill 1 EP / 2 menit) lalu menunggu selama itu.

```bash
node bullgem.js status              # level · energy · power
node bullgem.js locations           # daftar cave + biaya EP
node bullgem.js spots --location X  # daftar spot
node bullgem.js mine --once         # satu siklus
node bullgem.js mine                # loop
```

Override manual: `MINING_LOCATION`, `MINING_SPOT`, `MINING_STRATEGY` di `.env`.

## Login pakai JWT (tanpa private key)

Cara paling ringan: pakai token yang sudah dibuat browser-mu.

1. Login di `https://gem.bullshot.io`
2. **F12** → **Application** → **Local Storage** → `https://gem.bullshot.io` → cari key **`rg_jwt_token`**
3. Copy nilainya (string panjang `eyJ...`)
4. Isi `.env`:

```ini
JWT=eyJhbGciOi...
```

atau sekali lewat CLI:

```bash
node bullgem.js login --jwt eyJhbGciOi...
```

Kalau `JWT` diisi, `PRIVATE_KEY` dan `EMAIL` diabaikan. Token kedaluwarsa sesuai masa berlaku dari server — kalau `status` membalas 401, ambil token baru dari browser.

Kombinasi paling praktis untuk CLI tanpa browser: **`JWT` + `CF_COOKIES`** di `.env`, lalu `node bullgem.js mine`.

## Kalau kena 403 Cloudflare

`gemapi.bullshot.io` dilindungi Cloudflare, jadi `fetch` dari Node (tanpa browser) ditolak walaupun dari jaringan rumah. Dua cara yang sah:

**A. Userscript di browser (disarankan)**

`bullgem.user.js` berjalan **di dalam** halaman gem.bullshot.io, memakai sesi login web-mu, jadi tidak ada Cloudflare yang dilewati.

1. Install ekstensi **Tampermonkey**
2. Buka dashboard Tampermonkey → **+** (script baru) → tempel isi `bullgem.user.js` → **Ctrl+S**
3. Buka `https://gem.bullshot.io`, login seperti biasa
4. Panel kecil di kanan bawah → **start**

Panel itu akan: klaim posisi yang siap → mulai posisi baru kalau kosong → kerjakan quest, tiap 45 detik.

**B. Cookie `cf_clearance` untuk CLI**

Ambil cookie dari browser (DevTools → Application → Cookies → `gemapi.bullshot.io`), lalu isi `.env`:

```ini
CF_CLEARANCE=isi-cookie-di-sini
```

Batasan: berlaku ±30 menit, terikat IP dan User-Agent yang sama. Kalau habis, isi ulang. Ini memakai sesi browser-mu sendiri, bukan menembus proteksi.

## API yang dipakai (hasil baca bundle produksi)

Base: `https://gemapi.bullshot.io/api`

| Fitur | Method | Path | Body |
|---|---|---|---|
| Nonce wallet | POST | `/auth/nonce` | `{walletAddress}` |
| Login wallet | POST | `/auth/login` | `{walletAddress, signature, message, refCode}` |
| Email mulai | POST | `/auth/email/start` | `{email}` |
| Email verifikasi | POST | `/auth/email/verify` | `{email, code}` → `{token, user}` |
| Profil | GET | `/user/me`, `/profile/me` | — |
| Saldo | GET | `/user/balance` | — |
| Tambang | GET | `/mining/locations` | — |
| Spot | GET | `/mining/locations/{id}/spots` | — |
| Posisi | GET | `/mining/positions` | — |
| Mulai mining | POST | `/mining/positions` | `{locationId, spotId?, strategy?, gear?, consumables?}` |
| Klaim hasil | POST | `/mining/positions/{id}/claim` | — |
| Quest list | GET | `/quests` | — |
| Quest mulai | POST | `/quests/start` | `{questId}` |
| Quest klaim | POST | `/quests/claim` | `{questId, tweetUrl}` |

Model auth: JWT Bearer (`rg_jwt_token` di web), plus header `X-Wallet-Address` untuk upload. Pesan tanda tangan: `Sign in to Bull GEM on Base: <nonce>`.

## Catatan penting

- **Cloudflare**: `gemapi.bullshot.io` dilindungi Cloudflare. Dari VPS/datacenter, request JSON dibalas halaman `Just a moment…` (403). Jalankan dari jaringan rumah; script menampilkan pesan jelas kalau ini terjadi.
- **Private key**: hanya dibaca dari `.env` lokal, dipakai untuk `signMessage` di mesin sendiri. Script tidak pernah mencetak atau mengirimnya. Jangan pakai wallet utama — pakai wallet khusus game.
- **Quest bergantung platform**: klaim quest Twitter/X butuh `--tweet-url`; quest lain bisa diklaim langsung.
- **ToS**: cek aturan Bullgem soal otomasi sebelum dipakai jangka panjang; akun yang dianggap bot bisa dibatasi.
