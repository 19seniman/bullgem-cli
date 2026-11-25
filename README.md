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
