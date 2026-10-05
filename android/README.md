# Student Planner v2 Android

Folder ini berisi wrapper Android untuk Student Planner v2.

- Package: `com.argatamauka.studentplanner`
- Minimum Android: 7.0 (API 24)
- Version: `2.1.0`
- Website production: `https://studentplannerarga.vercel.app/`
- Login, data Supabase, jadwal, tugas, keuangan, tabungan, profil, dan sinkronisasi tetap memakai backend yang sama.
- Pemilihan foto profil didukung melalui Android file picker.

## Build testing

Workflow `Build Android APK` menghasilkan APK debug untuk testing.

## Build release yang bisa di-update

Workflow `Build Signed Release APK` sudah disiapkan. Agar bisa dipakai, repository perlu 4 GitHub Actions secrets:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

Keystore release harus disimpan permanen dan jangan pernah dimasukkan ke repository publik. Semua APK release berikutnya harus ditandatangani dengan keystore yang sama agar Android dapat melakukan update tanpa uninstall aplikasi.
