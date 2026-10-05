# Student Planner v2 Android

Folder ini berisi wrapper Android untuk Student Planner v2.

- Package: `com.argatamauka.studentplanner`
- Minimum Android: 7.0 (API 24)
- Version: `2.2.1`
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


## Permanent signing certificate

Mulai release 2.2.1, gunakan satu keystore release permanen untuk seluruh versi berikutnya. Jangan mengganti keystore ini.

Certificate SHA-256:
`84:BD:85:1E:94:0C:D5:1D:D0:35:B3:53:75:18:85:57:31:5A:63:97:B7:AE:32:75:1B:55:E7:F9:E4:E9:60:7F`

APK debug yang sudah pernah terpasang tidak dapat di-update langsung oleh APK release pertama karena signing key berbeda. Setelah release permanen pertama terpasang, versi release berikutnya dapat melakukan update normal selama menggunakan keystore yang sama.
