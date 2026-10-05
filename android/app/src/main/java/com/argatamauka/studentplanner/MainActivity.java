package com.argatamauka.studentplanner;

import android.Manifest;
import android.app.Activity;
import android.app.DownloadManager;
import android.app.Dialog;
import android.content.Intent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
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
    private static final String UPDATE_VERSION = "version";

    private WebView webView;
    private ValueCallback<Uri[]> fileCallback;
    private BroadcastReceiver updateDownloadReceiver;
    private boolean updateSettingsRequested = false;
    private final Handler updateHandler = new Handler(Looper.getMainLooper());
    private Runnable updateProgressRunnable;
    private Dialog updateDialog;
    private ProgressBar updateProgressBar;
    private TextView updateProgressText;
    private Button updateInstallButton;

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
        settings.setUserAgentString(settings.getUserAgentString() + " StudentPlannerAndroid/2.2.8");

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
        public boolean supportsStagedInAppUpdate() {
            return true;
        }

        @JavascriptInterface
        public void downloadAndInstallUpdate(String url, String version) {
            runOnUiThread(() -> beginUpdateDownload(url, version));
        }

        @JavascriptInterface
        public void installDownloadedUpdate() {
            runOnUiThread(() -> installPendingUpdate());
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
                notifyUpdateProgress("failed", 0);
                Toast.makeText(this, "Link update tidak valid.", Toast.LENGTH_LONG).show();
                return;
            }

            String safeVersion = String.valueOf(version).replaceAll("[^0-9A-Za-z._-]", "");
            File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
            if (dir == null) {
                notifyUpdateProgress("failed", 0);
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

            showNativeUpdateDialog(safeVersion);

            long id = manager.enqueue(request);
            getSharedPreferences(UPDATE_PREFS, MODE_PRIVATE)
                .edit()
                .putLong(UPDATE_DOWNLOAD_ID, id)
                .putString(UPDATE_VERSION, safeVersion)
                .apply();

            notifyUpdateProgress("downloading", 0);
            startUpdateProgressPolling();
        } catch (Exception e) {
            notifyUpdateProgress("failed", 0);
            Toast.makeText(this, "Gagal mengunduh update.", Toast.LENGTH_LONG).show();
        }
    }

    private void startUpdateProgressPolling() {
        if (updateProgressRunnable != null) updateHandler.removeCallbacks(updateProgressRunnable);

        updateProgressRunnable = new Runnable() {
            @Override
            public void run() {
                boolean keepPolling = checkPendingUpdateDownload();
                if (keepPolling) updateHandler.postDelayed(this, 500);
            }
        };
        updateHandler.post(updateProgressRunnable);
    }

    private boolean checkPendingUpdateDownload() {
        long id = getSharedPreferences(UPDATE_PREFS, MODE_PRIVATE).getLong(UPDATE_DOWNLOAD_ID, -1);
        if (id == -1) return false;

        DownloadManager manager = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
        if (manager == null) return false;

        DownloadManager.Query query = new DownloadManager.Query().setFilterById(id);
        try (android.database.Cursor cursor = manager.query(query)) {
            if (cursor == null || !cursor.moveToFirst()) return false;

            int statusIndex = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS);
            int downloadedIndex = cursor.getColumnIndex(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR);
            int totalIndex = cursor.getColumnIndex(DownloadManager.COLUMN_TOTAL_SIZE_BYTES);
            if (statusIndex < 0) return false;

            int status = cursor.getInt(statusIndex);
            long downloaded = downloadedIndex >= 0 ? cursor.getLong(downloadedIndex) : 0;
            long total = totalIndex >= 0 ? cursor.getLong(totalIndex) : 0;
            int progress = total > 0 ? (int) Math.min(100, (downloaded * 100L) / total) : 0;

            if (status == DownloadManager.STATUS_SUCCESSFUL) {
                notifyUpdateProgress("ready", 100);
                return false;
            }

            if (status == DownloadManager.STATUS_FAILED) {
                getSharedPreferences(UPDATE_PREFS, MODE_PRIVATE).edit().remove(UPDATE_DOWNLOAD_ID).apply();
                notifyUpdateProgress("failed", progress);
                return false;
            }

            notifyUpdateProgress("downloading", progress);
            return true;
        } catch (Exception ignored) {
            return false;
        }
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private void showNativeUpdateDialog(String version) {
        if (isFinishing() || isDestroyed()) return;

        if (updateDialog == null) {
            updateDialog = new Dialog(this);
            LinearLayout root = new LinearLayout(this);
            root.setOrientation(LinearLayout.VERTICAL);
            root.setPadding(dp(20), dp(20), dp(20), dp(20));

            TextView title = new TextView(this);
            title.setText("UPDATE STUDENT PLANNER");
            title.setTextSize(18);
            title.setTypeface(null, android.graphics.Typeface.BOLD);
            root.addView(title, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            ));

            updateProgressText = new TextView(this);
            updateProgressText.setText("Menyiapkan download...");
            updateProgressText.setTextSize(14);
            LinearLayout.LayoutParams textParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            );
            textParams.topMargin = dp(14);
            root.addView(updateProgressText, textParams);

            updateProgressBar = new ProgressBar(
                this,
                null,
                android.R.attr.progressBarStyleHorizontal
            );
            updateProgressBar.setMax(100);
            updateProgressBar.setProgress(0);
            LinearLayout.LayoutParams progressParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(18)
            );
            progressParams.topMargin = dp(12);
            root.addView(updateProgressBar, progressParams);

            updateInstallButton = new Button(this);
            updateInstallButton.setText("INSTAL UPDATE");
            updateInstallButton.setVisibility(View.GONE);
            updateInstallButton.setOnClickListener(v -> installPendingUpdate());
            LinearLayout.LayoutParams buttonParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            );
            buttonParams.topMargin = dp(16);
            root.addView(updateInstallButton, buttonParams);

            updateDialog.setContentView(root);
            updateDialog.setCancelable(false);
        }

        if (!updateDialog.isShowing()) {
            updateDialog.show();
            Window window = updateDialog.getWindow();
            if (window != null) {
                window.setLayout(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
                );
            }
        }

        if (updateProgressText != null) {
            updateProgressText.setText("Mengunduh Student Planner v" + version + "... 0%");
        }
        if (updateProgressBar != null) updateProgressBar.setProgress(0);
        if (updateInstallButton != null) updateInstallButton.setVisibility(View.GONE);
        updateDialog.setCancelable(false);
    }

    private void updateNativeUpdateUi(String state, int progress) {
        String version = getSharedPreferences(UPDATE_PREFS, MODE_PRIVATE)
            .getString(UPDATE_VERSION, "");

        if (updateDialog == null || !updateDialog.isShowing()) {
            showNativeUpdateDialog(version.isEmpty() ? "terbaru" : version);
        }

        if (updateProgressBar != null) updateProgressBar.setProgress(progress);

        if ("downloading".equals(state)) {
            if (updateProgressText != null) {
                updateProgressText.setText("Mengunduh update... " + progress + "%");
            }
            if (updateInstallButton != null) updateInstallButton.setVisibility(View.GONE);
            if (updateDialog != null) updateDialog.setCancelable(false);
        } else if ("ready".equals(state)) {
            if (updateProgressText != null) {
                updateProgressText.setText("Download selesai ✅");
            }
            if (updateProgressBar != null) updateProgressBar.setProgress(100);
            if (updateInstallButton != null) {
                updateInstallButton.setText("INSTAL UPDATE");
                updateInstallButton.setVisibility(View.VISIBLE);
                updateInstallButton.setOnClickListener(v -> installPendingUpdate());
            }
            if (updateDialog != null) updateDialog.setCancelable(true);
        } else if ("failed".equals(state)) {
            if (updateProgressText != null) {
                updateProgressText.setText("Download update gagal.");
            }
            if (updateInstallButton != null) {
                updateInstallButton.setText("TUTUP");
                updateInstallButton.setVisibility(View.VISIBLE);
                updateInstallButton.setOnClickListener(v -> {
                    if (updateDialog != null) updateDialog.dismiss();
                });
            }
            if (updateDialog != null) updateDialog.setCancelable(true);
        }
    }

    private void notifyUpdateProgress(String state, int progress) {
        int safeProgress = Math.max(0, Math.min(100, progress));
        runOnUiThread(() -> updateNativeUpdateUi(state, safeProgress));

        if (webView == null) return;
        String js = "window.onNativeUpdateProgress&&window.onNativeUpdateProgress('" +
            state + "'," + safeProgress + ");";
        webView.post(() -> webView.evaluateJavascript(js, null));
    }

    private void installPendingUpdate() {
        long id = getSharedPreferences(UPDATE_PREFS, MODE_PRIVATE).getLong(UPDATE_DOWNLOAD_ID, -1);
        if (id == -1) {
            Toast.makeText(this, "File update belum siap.", Toast.LENGTH_LONG).show();
            return;
        }

        DownloadManager manager = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
        if (manager == null) return;

        DownloadManager.Query query = new DownloadManager.Query().setFilterById(id);
        try (android.database.Cursor cursor = manager.query(query)) {
            if (cursor == null || !cursor.moveToFirst()) {
                Toast.makeText(this, "File update tidak ditemukan.", Toast.LENGTH_LONG).show();
                return;
            }

            int statusIndex = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS);
            if (statusIndex < 0 || cursor.getInt(statusIndex) != DownloadManager.STATUS_SUCCESSFUL) {
                Toast.makeText(this, "Download update belum selesai.", Toast.LENGTH_LONG).show();
                return;
            }

            Uri apkUri = manager.getUriForDownloadedFile(id);
            if (apkUri != null) installDownloadedUpdate(id, apkUri);
        } catch (Exception e) {
            Toast.makeText(this, "Tidak bisa membuka update.", Toast.LENGTH_LONG).show();
        }
    }

    private void installDownloadedUpdate(long id, Uri apkUri) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            !getPackageManager().canRequestPackageInstalls()) {
            updateSettingsRequested = true;
            Toast.makeText(this, "Izinkan Student Planner memasang update satu kali.", Toast.LENGTH_LONG).show();
            Intent settingsIntent = new Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + getPackageName())
            );
            startActivity(settingsIntent);
            return;
        }

        updateSettingsRequested = false;

        Intent install = new Intent(Intent.ACTION_VIEW);
        install.setDataAndType(apkUri, "application/vnd.android.package-archive");
        install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            startActivity(install);
            getSharedPreferences(UPDATE_PREFS, MODE_PRIVATE).edit().remove(UPDATE_DOWNLOAD_ID).apply();
        } catch (Exception e) {
            Toast.makeText(this, "Tidak bisa membuka pemasang update.", Toast.LENGTH_LONG).show();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (updateSettingsRequested &&
            (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || getPackageManager().canRequestPackageInstalls())) {
            installPendingUpdate();
            return;
        }
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
        if (updateProgressRunnable != null) updateHandler.removeCallbacks(updateProgressRunnable);
        if (updateDialog != null) {
            try { updateDialog.dismiss(); } catch (Exception ignored) {}
        }
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
