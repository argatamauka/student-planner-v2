STUDENT PLANNER + SUPABASE

Backend Supabase sudah dibuat:
- Project: student-planner
- Region: ap-southeast-1
- RLS aktif
- Realtime aktif
- Storage bucket private: profile-photos
- Tabel: profiles, courses, schedules, tasks, wallets, transactions, savings

CARA PASANG
1. Replace file:
   - index.html
   - script.js
   - matakuliah.html
   - matakuliah.js
   - profil.html
   - profil.js
2. Tambahkan file baru:
   - supabase-config.js
3. CSS lama tetap dipakai dan tidak perlu diganti.
4. Buka index.html lewat web server / Vercel, bukan file:// jika browser memblokir request.
5. Tekan DAFTAR, masukkan email + password (minimal 6 karakter).
6. Jika Supabase meminta verifikasi email, buka email dan konfirmasi.
7. Login dengan akun yang sama di HP dan laptop.

CATATAN
- Publishable key pada supabase-config.js memang aman berada di frontend karena database dilindungi RLS.
- Jangan pernah memasukkan service_role key ke frontend.
- Data localStorage lama akan dicoba dimigrasikan otomatis ke Supabase saat akun cloud masih kosong.
