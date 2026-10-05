package com.argatamauka.studentplanner;

import android.Manifest;
import android.app.Activity;
import android.app.DownloadManager;
import android.content.Intent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.Settings;
import android.widget.Toast;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.File;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

public class MainActivity extends Activity {
    private static final String APP_URL = "https://studentplannerarga.vercel.app/";
    private static final int FILE_CHOOSER_REQUEST = 1001;
    private static final int NOTIFICATION_PERMISSION_REQUEST = 1002;
    private static final String UPDATE_PREFS = "student_planner_updates";
    private static final String UPDATE_DOWNLOAD_ID = "download_id";

    private WebView webView;
    private ValueCallback<Uri[]> fileCallback;
    private BroadcastReceiver updateDownloadReceiver;
    private boolean updateSettingsRequested = false;

    private final Set<String> appHosts = new HashSet<>(Arrays.asList(
        "studentplannerarga.vercel.app",
        "student-planner-roan.vercel.app",
        "student-planner-arga3.vercel.app"
    ));

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        ReminderScheduler.createNotificationChannels(this);
        registerUpdateReceiver();

        webView = new WebView(this);
        setContentView(webView);

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(webView, true);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setUserAgentString(settings.getUserAgentString() + " StudentPlannerAndroid/2.2.4");

        webView.addJavascriptInterface(new NotificationBridge(), "AndroidNotifications");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String host = uri.getHost();
                if (host != null && appHosts.contains(host)) return false;

                Intent intent = new Intent(Intent.ACTION_VIEW, uri);
                try {
                    startActivity(intent);
                } catch (Exception ignored) {}
                return true;
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(
                    WebView webView,
                    ValueCallback<Uri[]> filePathCallback,
                    FileChooserParams fileChooserParams) {

                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = filePathCallback;

                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("image/*");
                intent.putExtra(Intent.EXTRA_MIME_TYPES,
                    new String[]{"image/jpeg", "image/png", "image/webp"});

                startActivityForResult(intent, FILE_CHOOSER_REQUEST);
                return true;
            }
        });

        if (savedInstanceState == null) {
            webView.loadUrl(APP_URL);
        } else {
            webView.restoreState(savedInstanceState);
        }
    }

    public class NotificationBridge {
        @JavascriptInterface
        public boolean isAvailable() {
            return true;
        }

        @JavascriptInterface
        public String getVersionName() {
            try {
                return MainActivity.this.getPackageManager()
                    .getPackageInfo(MainActivity.this.getPackageName(), 0)
                    .versionName;
            } catch (Exception ignored) {
                return "";
            }
        }

        @JavascriptInterface
        public boolean supportsInAppUpdate() {
            return true;
        }

        @JavascriptInterface
        public void downloadAndInstallUpdate(String url, String version) {
            runOnUiThread(() -> beginUpdateDownload(url, version));
        }

        @JavascriptInterface
        public boolean hasPermission() {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return true;
            return checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
        }

        @JavascriptInterface
        public void requestPermission() {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                runOnUiThread(() -> requestPermissions(
                    new String[]{Manifest.permission.POST_NOTIFICATIONS},
                    NOTIFICATION_PERMISSION_REQUEST
                ));
            }
        }

        @JavascriptInterface
        public void syncReminders(String payload) {
            ReminderScheduler.sync(MainActivity.this, payload);
        }

        @JavascriptInterface
        public void clearReminders() {
            ReminderScheduler.clear(MainActivity.this);
        }
    }


    private void registerUpdateReceiver() {
        updateDownloadReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (!DownloadManager.ACTION_DOWNLOAD_COMPLETE.equals(intent.getAction())) return;
                long completedId = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
                long expectedId = getSharedPreferences(UPDATE_PREFS, MODE_PRIVATE)
                    .getLong(UPDATE_DOWNLOAD_ID, -1);
                if (completedId == expectedId && completedId != -1) {
                    checkPendingUpdateDownload();
                }
            }
        };

        IntentFilter filter = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(updateDownloadReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(updateDownloadReceiver, filter);
        }
    }

    private void beginUpdateDownload(String url, String version) {
        try {
            Uri uri = Uri.parse(url);
            if (!"https".equalsIgnoreCase(uri.getScheme()) || !"github.com".equalsIgnoreCase(uri.getHost())) {
                Toast.makeText(this, "Link update tidak valid.", Toast.LENGTH_LONG).show();
                return;
            }

            String safeVersion = String.valueOf(version).replaceAll("[^0-9A-Za-z._-]", "");
            File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
            if (dir == null) {
                Toast.makeText(this, "Penyimpanan tidak tersedia.", Toast.LENGTH_LONG).show();
                return;
            }

            File apk = new File(dir, "Student-Planner-" + safeVersion + ".apk");
            if (apk.exists()) apk.delete();

            DownloadManager.Request request = new DownloadManager.Request(uri)
                .setTitle("Student Planner v" + safeVersion)
                .setDescription("Mengunduh pembaruan aplikasi...")
                .setMimeType("application/vnd.android.package-archive")
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                .setAllowedOverMetered(true)
                .setAllowedOverRoaming(false)
                .setDestinationInExternalFilesDir(this, Environment.DIRECTORY_DOWNLOADS, apk.getName());

            DownloadManager manager = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
            if (manager == null) throw new IllegalStateException("Download Manager tidak tersedia.");

            long id = manager.enqueue(request);
            getSharedPreferences(UPDATE_PREFS, MODE_PRIVATE)
                .edit()
                .putLong(UPDATE_DOWNLOAD_ID, id)
                .apply();

            Toast.makeText(this, "Update sedang diunduh di dalam aplikasi.", Toast.LENGTH_LONG).show();
        } catch (Exception e) {
            Toast.makeText(this, "Gagal mengunduh update.", Toast.LENGTH_LONG).show();
        }
    }

    private void checkPendingUpdateDownload() {
        long id = getSharedPreferences(UPDATE_PREFS, MODE_PRIVATE).getLong(UPDATE_DOWNLOAD_ID, -1);
        if (id == -1) return;

        DownloadManager manager = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
        if (manager == null) return;

        DownloadManager.Query query = new DownloadManager.Query().setFilterById(id);
        try (android.database.Cursor cursor = manager.query(query)) {
            if (cursor == null || !cursor.moveToFirst()) return;

            int statusIndex = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS);
            if (statusIndex < 0) return;
            int status = cursor.getInt(statusIndex);

            if (status == DownloadManager.STATUS_SUCCESSFUL) {
                Uri apkUri = manager.getUriForDownloadedFile(id);
                if (apkUri != null) installDownloadedUpdate(id, apkUri);
            } else if (status == DownloadManager.STATUS_FAILED) {
                getSharedPreferences(UPDATE_PREFS, MODE_PRIVATE).edit().remove(UPDATE_DOWNLOAD_ID).apply();
                Toast.makeText(this, "Download update gagal. Coba lagi.", Toast.LENGTH_LONG).show();
            }
        } catch (Exception ignored) {}
    }

    private void installDownloadedUpdate(long id, Uri apkUri) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            !getPackageManager().canRequestPackageInstalls()) {
            if (!updateSettingsRequested) {
                updateSettingsRequested = true;
                Toast.makeText(this, "Izinkan Student Planner memasang update satu kali.", Toast.LENGTH_LONG).show();
                Intent settingsIntent = new Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getPackageName())
                );
                startActivity(settingsIntent);
            }
            return;
        }

        getSharedPreferences(UPDATE_PREFS, MODE_PRIVATE).edit().remove(UPDATE_DOWNLOAD_ID).apply();
        updateSettingsRequested = false;

        Intent install = new Intent(Intent.ACTION_VIEW);
        install.setDataAndType(apkUri, "application/vnd.android.package-archive");
        install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            startActivity(install);
        } catch (Exception e) {
            Toast.makeText(this, "Tidak bisa membuka pemasang update.", Toast.LENGTH_LONG).show();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        checkPendingUpdateDownload();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == FILE_CHOOSER_REQUEST) {
            Uri[] result = null;
            if (resultCode == RESULT_OK && data != null && data.getData() != null) {
                result = new Uri[]{data.getData()};
            }
            if (fileCallback != null) {
                fileCallback.onReceiveValue(result);
                fileCallback = null;
            }
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (updateDownloadReceiver != null) {
            try { unregisterReceiver(updateDownloadReceiver); } catch (Exception ignored) {}
        }
        if (webView != null) {
            webView.stopLoading();
            webView.destroy();
        }
        super.onDestroy();
    }
}
