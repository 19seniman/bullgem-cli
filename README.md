# bullgem.js — CLI Bullgem (gem.bullshot.io)

Login pakai private key (EIP-191) atau email + OTP, lalu otomatis klaim quest dan jalankan mining.

**Butuh:** Node 18+, `npm install` (satu dependency: ethers).

## 1) Setup

```bash
npm install
cp .env.example .env
```

Isi `.env` (pilih salah satu):

```ini
PRIVATE_KEY=0x....        # wallet login, tanda tangan lokal
EMAIL=kamu@mail.com       # alternatif: login email + OTP
REF_CODE=                 # opsional
MINING_LOCATION=          # opsional, lihat: node bullgem.js locations
POLL_SECONDS=30
```

## 2) Pakai

```bash
node bullgem.js login          # wallet: nonce → sign → JWT; email: OTP di terminal
node bullgem.js status         # saldo + profil
node bullgem.js locations      # daftar tambang
node bullgem.js quests         # status quest
node bullgem.js quests --auto  # start & claim semua yang bisa
node bullgem.js mine --once    # klaim yang siap, lalu mulai satu posisi
node bullgem.js mine           # loop: klaim → start → tunggu (poll)
node bullgem.js auto           # quest otomatis + loop mining
```

Token JWT disimpan di `.tokens.json` (mode 600, masuk `.gitignore`).

## 3) API yang dipakai (hasil baca bundle produksi)

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

## 4) Catatan penting

- **Cloudflare**: `gemapi.bullshot.io` dilindungi Cloudflare. Dari VPS/datacenter, request JSON dibalas halaman `Just a moment…` (403). Jalankan dari jaringan rumah; script menampilkan pesan jelas kalau ini terjadi.
- **Private key**: hanya dibaca dari `.env` lokal, dipakai untuk `signMessage` di mesin sendiri. Script tidak pernah mencetak atau mengirimnya. Jangan pakai wallet utama — pakai wallet khusus game.
- **Quest bergantung platform**: klaim quest Twitter/X butuh `--tweet-url`; quest lain bisa diklaim langsung.
- **ToS**: cek aturan Bullgem soal otomasi sebelum dipakai jangka panjang; akun yang dianggap bot bisa dibatasi.
