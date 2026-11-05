# CSS Draft Lab

Draft simulator pick/ban untuk acara CSS ILKOM UNNES 2025. UI dibuat dengan React, Vite, dan Express; aturan draft berjalan di browser, sedangkan Node menyediakan konfigurasi event dan daftar hero.

## Jalankan lokal

```bash
npm install
npm run dev
```

Buka alamat Vite yang tampil di terminal. Gunakan Node.js 20.19 atau lebih baru. Untuk versi produksi, jalankan `npm run build`, lalu `npm start`.

## Fitur

- Mode Standar, MPL / Pro, Ban Bergilir, dan Bebas.
- Jumlah ban Standar mengikuti rank: Epic 3, Legend 4, Mythic+ 5 per tim.
- Mode Ban Bergilir melakukan tiga ban per tim secara selang-seling, lalu memulai urutan pick.
- Tombol No Ban melewati giliran ban tanpa memilih hero; langkahnya tetap bisa dibatalkan dengan Undo.
- Halaman utama memakai layout latihan draft full-screen dengan scoreboard, hero pool, dan slot pick/ban.
- First pick Blue atau Red, timer 30 detik atau mode santai.
- Cari dan filter hero berdasarkan role, lihat pick/ban, role, dan tipe damage.
- Undo, restart, bagikan ringkasan draft, serta simpan draft otomatis di browser.
- Saat giliran pick, picker bisa diubah ke pemain lain yang belum mendapat hero; setelah 10 hero ter-pick, tim masuk ke fase swap sebelum draft dikunci.
- Mode Bebas mengizinkan pemilihan slot hero secara manual.
- Portrait lokal dipakai untuk pool hero dan ikon ban; splash art dipakai sekali sebagai gambar utama pada kartu pick agar tidak bertumpuk dengan portrait kedua. Sumber asset tercatat di manifest.
- Nama tim, logo, dan lima username/IGN per tim bisa diedit; format seri mendukung Best of atau First to, skor bisa diedit, dan sisi Blue/Red bisa ditukar.
- Overlay OBS di `/obs` memakai layout dari referensi PDD, termasuk ikon ban diagonal; hero pick dan status draft mengikuti state langsung. Orbitron dipakai sebagai font utama aplikasi; BigMacca dipakai sebagai font display overlay dan lisensi/font disertakan di `public/fonts`.

Roster 133 hero awal disimpan di `shared/heroes.json` agar mudah diperbarui oleh panitia.
Untuk menyegarkan data dan aset dari halaman referensi, jalankan `npm run assets:sync`.
Tambahkan alamat aplikasi dengan akhiran `/obs` sebagai Browser Source di OBS dan biarkan source terbuka. Setiap ban, pick, perubahan nama, dan skor dari halaman utama dikirim ke overlay melalui SSE.

## Deploy ke Vercel

`vercel.json` mengatur build Vite, folder output `dist`, fungsi API, dan fallback SPA untuk `/obs` serta route aplikasi lainnya. Gunakan Node.js 22.

Sinkronisasi state draft dan pengaturan fokus gambar memakai Upstash Redis REST agar tetap tersimpan dan tersiar antar-instance Vercel. Buat database Redis, lalu tambahkan `UPSTASH_REDIS_REST_URL` dan `UPSTASH_REDIS_REST_TOKEN` sebagai environment variables server-side di Vercel untuk Production dan Preview. Jangan beri prefix `VITE_` pada token. Contoh nama variabel ada di `.env.example`.

Setelah variabel diisi, hubungkan repository ke Vercel dan deploy dari root proyek. Deploy Preview bisa dipakai untuk mengecek `/`, `/obs`, `/api/config`, dan sinkronisasi OBS sebelum Production.
