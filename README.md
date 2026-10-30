# CSS Draft Lab

Draft simulator pick/ban untuk acara CSS ILKOM UNNES 2025. UI dibuat dengan React, Vite, dan Express; aturan draft berjalan di browser, sedangkan Node menyediakan konfigurasi event dan daftar hero.

## Jalankan lokal

```bash
npm install
npm run dev
```

Buka alamat Vite yang tampil di terminal. Gunakan Node.js 20.19 atau lebih baru. Untuk versi produksi, jalankan `npm run build`, lalu `npm start`.

## Fitur

- Mode Standar, MPL / Pro, dan Bebas.
- Jumlah ban Standar mengikuti rank: Epic 3, Legend 4, Mythic+ 5 per tim.
- First pick Blue atau Red, timer 30 detik atau mode santai.
- Cari dan filter hero berdasarkan role, lihat pick/ban, role, dan tipe damage.
- Undo, restart, bagikan ringkasan draft, serta simpan draft otomatis di browser.
- Setelah 10 hero ter-pick, masuk ke fase swap untuk menukar hero antar pemain dalam tim yang sama sebelum draft dikunci.
- Mode Bebas mengizinkan pemilihan slot hero secara manual.
- Portrait lokal dipakai untuk pool hero dan ikon ban; splash art dipakai sekali sebagai gambar utama pada kartu pick agar tidak bertumpuk dengan portrait kedua. Sumber asset tercatat di manifest.
- Nama tim, logo, dan lima username/IGN per tim bisa diedit; format seri mendukung Best of atau First to, skor bisa diedit, dan sisi Blue/Red bisa ditukar.
- Overlay OBS di `/obs` memakai susunan draft terinspirasi referensi M7: scoreboard di atas, ban di atas kartu pick, dan kartu hero berpasangan dengan username tanpa foto pemain. Latar chroma key `#00ff00`; draft tersinkron dari halaman utama lewat SSE.

Roster 133 hero awal disimpan di `shared/heroes.json` agar mudah diperbarui oleh panitia.
Untuk menyegarkan data dan aset dari halaman referensi, jalankan `npm run assets:sync`.
Tambahkan alamat aplikasi dengan akhiran `/obs` sebagai Browser Source di OBS; halaman utama mengirim state draft ke overlay melalui server Node.
