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
import android.graphics.Color;
import android.content.res.ColorStateList;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.Gravity;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceError;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.File;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONObject;

public class MainActivity extends Activity {
    private static final String APP_URL = "https://studentplannerarga.vercel.app/";
    private static final int FILE_CHOOSER_REQUEST = 1001;
    private static final int NOTIFICATION_PERMISSION_REQUEST = 1002;
    private static final String UPDATE_PREFS = "student_planner_updates";
    private static final String UPDATE_DOWNLOAD_ID = "download_id";
    private static final String UPDATE_VERSION = "version";

    private WebView webView;
    private FrameLayout appRoot;
    private LinearLayout internetRequiredScreen;
    private ValueCallback<Uri[]> fileCallback;
    private BroadcastReceiver updateDownloadReceiver;
    private boolean updateSettingsRequested = false;
    private final Handler updateHandler = new Handler(Looper.getMainLooper());
    private Runnable updateProgressRunnable;
    private Dialog updateDialog;
    private ProgressBar updateProgressBar;
    private TextView updateProgressText;
    private Button updateInstallButton;

    private Dialog aboutDialog;
    private TextView aboutLatestVersion;
    private TextView aboutStatus;
    private Button aboutCheckButton;
    private Button aboutUpdateButton;
    private String aboutUpdateUrl = null;
    private String aboutUpdateVersion = null;
    private final ExecutorService networkExecutor = Executors.newSingleThreadExecutor();

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
        appRoot = new FrameLayout(this);
        appRoot.addView(webView, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));
        internetRequiredScreen = buildInternetRequiredScreen();
        internetRequiredScreen.setVisibility(View.GONE);
        appRoot.addView(internetRequiredScreen, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));
        setContentView(appRoot);

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
        settings.setUserAgentString(settings.getUserAgentString() + " StudentPlannerAndroid/2.3.3");

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

            @Override
            public void onReceivedError(
                    WebView view,
                    WebResourceRequest request,
                    WebResourceError error) {
                super.onReceivedError(view, request, error);
                if (request.isForMainFrame()) {
                    showInternetRequired();
                }
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                hideInternetRequired();
                injectNativeAboutButton();
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
            if (hasUsableNetwork()) {
                hideInternetRequired();
                webView.loadUrl(APP_URL);
            } else {
                showInternetRequired();
            }
        } else {
            webView.restoreState(savedInstanceState);
            if (!hasUsableNetwork()) showInternetRequired();
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
        public void openAboutApp() {
            runOnUiThread(() -> showNativeAboutDialog());
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


    private boolean hasUsableNetwork() {
        try {
            ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) return false;
            Network network = cm.getActiveNetwork();
            if (network == null) return false;
            NetworkCapabilities caps = cm.getNetworkCapabilities(network);
            return caps != null
                && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
        } catch (Exception ignored) {
            return false;
        }
    }

    private LinearLayout buildInternetRequiredScreen() {
        LinearLayout screen = new LinearLayout(this);
        screen.setOrientation(LinearLayout.VERTICAL);
        screen.setGravity(Gravity.CENTER);
        screen.setPadding(dp(22), dp(22), dp(22), dp(22));
        screen.setBackgroundColor(Color.parseColor("#F4F0E6"));

        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(20), dp(20), dp(20), dp(20));
        card.setBackground(neoBox("#FFFFFF", 4, 12));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) card.setElevation(dp(6));

        TextView badge = new TextView(this);
        badge.setText(" KONEKSI INTERNET ");
        badge.setTextSize(10);
        badge.setTextColor(Color.BLACK);
        badge.setTypeface(null, android.graphics.Typeface.BOLD);
        badge.setGravity(Gravity.CENTER);
        badge.setPadding(dp(8), dp(5), dp(8), dp(5));
        badge.setBackground(neoBox("#FDE047", 2, 999));
        card.addView(badge, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        ));

        TextView title = new TextView(this);
        title.setText("HARAP HUBUNGKAN\nKE INTERNET");
        title.setTextSize(24);
        title.setTextColor(Color.BLACK);
        title.setTypeface(null, android.graphics.Typeface.BOLD);
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        titleParams.topMargin = dp(14);
        card.addView(title, titleParams);

        TextView message = new TextView(this);
        message.setText("Student Planner membutuhkan koneksi internet untuk memuat dan menyinkronkan data.");
        message.setTextSize(12);
        message.setTextColor(Color.DKGRAY);
        LinearLayout.LayoutParams messageParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        messageParams.topMargin = dp(8);
        card.addView(message, messageParams);

        Button refresh = new Button(this);
        refresh.setText("REFRESH");
        styleNeoButton(refresh, "#4ADE80", "#000000");
        refresh.setOnClickListener(v -> retryInternetConnection());
        LinearLayout.LayoutParams refreshParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        refreshParams.topMargin = dp(16);
        card.addView(refresh, refreshParams);

        LinearLayout.LayoutParams cardParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        cardParams.setMargins(dp(4), 0, dp(4), 0);
        screen.addView(card, cardParams);
        return screen;
    }

    private void showInternetRequired() {
        if (internetRequiredScreen != null) internetRequiredScreen.setVisibility(View.VISIBLE);
        if (webView != null) webView.setVisibility(View.INVISIBLE);
    }

    private void hideInternetRequired() {
        if (internetRequiredScreen != null) internetRequiredScreen.setVisibility(View.GONE);
        if (webView != null) webView.setVisibility(View.VISIBLE);
    }

    private void retryInternetConnection() {
        if (!hasUsableNetwork()) {
            Toast.makeText(this, "Belum ada koneksi internet.", Toast.LENGTH_SHORT).show();
            showInternetRequired();
            return;
        }
        hideInternetRequired();
        webView.loadUrl(APP_URL);
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
            root.setPadding(dp(18), dp(18), dp(18), dp(18));
            root.setBackground(neoBox("#FFFFFF", 4, 12));

            TextView badge = new TextView(this);
            badge.setText(" UPDATE APLIKASI ");
            badge.setTextSize(10);
            badge.setTextColor(Color.BLACK);
            badge.setTypeface(null, android.graphics.Typeface.BOLD);
            badge.setGravity(Gravity.CENTER);
            badge.setPadding(dp(8), dp(5), dp(8), dp(5));
            badge.setBackground(neoBox("#FDE047", 2, 999));
            root.addView(badge, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            ));

            TextView title = new TextView(this);
            title.setText("STUDENT PLANNER");
            title.setTextSize(22);
            title.setTextColor(Color.BLACK);
            title.setTypeface(null, android.graphics.Typeface.BOLD);
            LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            );
            titleParams.topMargin = dp(10);
            root.addView(title, titleParams);

            updateProgressText = new TextView(this);
            updateProgressText.setText("Menyiapkan download...");
            updateProgressText.setTextSize(12);
            updateProgressText.setTextColor(Color.DKGRAY);
            updateProgressText.setTypeface(null, android.graphics.Typeface.BOLD);
            LinearLayout.LayoutParams textParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            );
            textParams.topMargin = dp(12);
            root.addView(updateProgressText, textParams);

            updateProgressBar = new ProgressBar(
                this,
                null,
                android.R.attr.progressBarStyleHorizontal
            );
            updateProgressBar.setMax(100);
            updateProgressBar.setProgress(0);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                updateProgressBar.setProgressTintList(ColorStateList.valueOf(Color.BLACK));
                updateProgressBar.setProgressBackgroundTintList(ColorStateList.valueOf(Color.parseColor("#F4F0E6")));
            }
            LinearLayout.LayoutParams progressParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(20)
            );
            progressParams.topMargin = dp(10);
            root.addView(updateProgressBar, progressParams);

            updateInstallButton = new Button(this);
            updateInstallButton.setText("INSTAL UPDATE");
            styleNeoButton(updateInstallButton, "#000000", "#FFFFFF");
            updateInstallButton.setVisibility(View.GONE);
            updateInstallButton.setOnClickListener(v -> installPendingUpdate());
            LinearLayout.LayoutParams buttonParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            );
            buttonParams.topMargin = dp(14);
            root.addView(updateInstallButton, buttonParams);

            updateDialog.setContentView(root);
            updateDialog.setCancelable(false);
            Window window = updateDialog.getWindow();
            if (window != null) window.setBackgroundDrawableResource(android.R.color.transparent);
        }

        if (!updateDialog.isShowing()) updateDialog.show();

        Window window = updateDialog.getWindow();
        if (window != null) {
            int width = Math.min(
                getResources().getDisplayMetrics().widthPixels - dp(28),
                dp(390)
            );
            window.setLayout(width, ViewGroup.LayoutParams.WRAP_CONTENT);
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


    private void injectNativeAboutButton() {
        if (webView == null) return;
        String js = "(function(){"
            + "if(document.getElementById('native-about-app-btn'))return;"
            + "var host=document.querySelector('.app-footer-tools');"
            + "if(!host)return;"
            + "var b=document.createElement('button');"
            + "b.id='native-about-app-btn';"
            + "b.className='check-update-btn';"
            + "b.textContent='TENTANG APP';"
            + "b.setAttribute('aria-label','Tentang Student Planner');"
            + "b.onclick=function(){try{AndroidNotifications.openAboutApp();}catch(e){}};"
            + "host.appendChild(b);"
            + "})();";
        webView.post(() -> webView.evaluateJavascript(js, null));
    }

    private GradientDrawable neoBox(String fill, int strokeDp, int radiusDp) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(Color.parseColor(fill));
        drawable.setStroke(dp(strokeDp), Color.BLACK);
        drawable.setCornerRadius(dp(radiusDp));
        return drawable;
    }

    private void styleNeoButton(Button button, String background, String textColor) {
        button.setBackground(neoBox(background, 3, 7));
        button.setTextColor(Color.parseColor(textColor));
        button.setTextSize(11);
        button.setTypeface(null, android.graphics.Typeface.BOLD);
        button.setAllCaps(false);
        button.setPadding(dp(12), dp(10), dp(12), dp(10));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) button.setElevation(dp(4));
    }

    private String currentVersionName() {
        try {
            return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
        } catch (Exception ignored) {
            return "";
        }
    }

    private void showNativeAboutDialog() {
        if (isFinishing() || isDestroyed()) return;

        aboutDialog = new Dialog(this);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(18), dp(18), dp(18), dp(18));
        root.setBackground(neoBox("#FFFFFF", 4, 12));

        TextView badge = new TextView(this);
        badge.setText(" TENTANG APLIKASI ");
        badge.setTextSize(10);
        badge.setTextColor(Color.BLACK);
        badge.setTypeface(null, android.graphics.Typeface.BOLD);
        badge.setGravity(Gravity.CENTER);
        badge.setPadding(dp(8), dp(5), dp(8), dp(5));
        badge.setBackground(neoBox("#FDE047", 2, 999));
        LinearLayout.LayoutParams badgeParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        root.addView(badge, badgeParams);

        TextView title = new TextView(this);
        title.setText("STUDENT PLANNER");
        title.setTextSize(24);
        title.setTextColor(Color.BLACK);
        title.setTypeface(null, android.graphics.Typeface.BOLD);
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        titleParams.topMargin = dp(10);
        root.addView(title, titleParams);

        TextView subtitle = new TextView(this);
        subtitle.setText("Kuliah, tugas, uang, dan tabungan dalam satu tempat.");
        subtitle.setTextSize(12);
        subtitle.setTextColor(Color.DKGRAY);
        root.addView(subtitle);

        LinearLayout versionRow = new LinearLayout(this);
        versionRow.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout.LayoutParams versionRowParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        versionRowParams.topMargin = dp(14);
        root.addView(versionRow, versionRowParams);

        TextView current = new TextView(this);
        current.setText("VERSI KAMU\n" + currentVersionName());
        current.setTextSize(11);
        current.setTextColor(Color.BLACK);
        current.setTypeface(null, android.graphics.Typeface.BOLD);
        current.setPadding(dp(10), dp(9), dp(10), dp(9));
        current.setBackground(neoBox("#FDE047", 3, 8));
        LinearLayout.LayoutParams currentParams = new LinearLayout.LayoutParams(
            0,
            ViewGroup.LayoutParams.WRAP_CONTENT,
            1f
        );
        currentParams.rightMargin = dp(5);
        versionRow.addView(current, currentParams);

        aboutLatestVersion = new TextView(this);
        aboutLatestVersion.setText("TERBARU\n-");
        aboutLatestVersion.setTextSize(11);
        aboutLatestVersion.setTextColor(Color.BLACK);
        aboutLatestVersion.setTypeface(null, android.graphics.Typeface.BOLD);
        aboutLatestVersion.setPadding(dp(10), dp(9), dp(10), dp(9));
        aboutLatestVersion.setBackground(neoBox("#4ADE80", 3, 8));
        LinearLayout.LayoutParams latestParams = new LinearLayout.LayoutParams(
            0,
            ViewGroup.LayoutParams.WRAP_CONTENT,
            1f
        );
        latestParams.leftMargin = dp(5);
        versionRow.addView(aboutLatestVersion, latestParams);

        LinearLayout developerCard = new LinearLayout(this);
        developerCard.setOrientation(LinearLayout.VERTICAL);
        developerCard.setPadding(dp(11), dp(10), dp(11), dp(10));
        developerCard.setBackground(neoBox("#60A5FA", 3, 8));
        LinearLayout.LayoutParams developerParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        developerParams.topMargin = dp(10);
        root.addView(developerCard, developerParams);

        TextView developerLabel = new TextView(this);
        developerLabel.setText("DEVELOPER");
        developerLabel.setTextSize(9);
        developerLabel.setTextColor(Color.BLACK);
        developerLabel.setTypeface(null, android.graphics.Typeface.BOLD);
        developerCard.addView(developerLabel);

        TextView developer = new TextView(this);
        developer.setText("Arga Setia Tamauka");
        developer.setTextSize(14);
        developer.setTextColor(Color.BLACK);
        developer.setTypeface(null, android.graphics.Typeface.BOLD);
        developerCard.addView(developer);

        TextView role = new TextView(this);
        role.setText("Informatics Student & Web Developer");
        role.setTextSize(10);
        role.setTextColor(Color.DKGRAY);
        developerCard.addView(role);

        aboutStatus = new TextView(this);
        aboutStatus.setText("Tekan CEK UPDATE untuk memeriksa versi terbaru.");
        aboutStatus.setTextSize(11);
        aboutStatus.setTextColor(Color.DKGRAY);
        LinearLayout.LayoutParams statusParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        statusParams.topMargin = dp(11);
        root.addView(aboutStatus, statusParams);

        aboutCheckButton = new Button(this);
        aboutCheckButton.setText("CEK UPDATE");
        styleNeoButton(aboutCheckButton, "#FDE047", "#000000");
        aboutCheckButton.setOnClickListener(v -> checkNativeUpdate());
        LinearLayout.LayoutParams checkParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        checkParams.topMargin = dp(10);
        root.addView(aboutCheckButton, checkParams);

        aboutUpdateButton = new Button(this);
        aboutUpdateButton.setText("UNDUH UPDATE");
        styleNeoButton(aboutUpdateButton, "#000000", "#FFFFFF");
        aboutUpdateButton.setVisibility(View.GONE);
        aboutUpdateButton.setOnClickListener(v -> {
            if (aboutUpdateUrl == null || aboutUpdateVersion == null) return;
            if (aboutDialog != null) aboutDialog.dismiss();
            beginUpdateDownload(aboutUpdateUrl, aboutUpdateVersion);
        });
        LinearLayout.LayoutParams updateParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        updateParams.topMargin = dp(8);
        root.addView(aboutUpdateButton, updateParams);

        LinearLayout changeCard = new LinearLayout(this);
        changeCard.setOrientation(LinearLayout.VERTICAL);
        changeCard.setPadding(dp(11), dp(10), dp(11), dp(10));
        changeCard.setBackground(neoBox("#F4F0E6", 3, 8));
        LinearLayout.LayoutParams changeParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        changeParams.topMargin = dp(12);
        root.addView(changeCard, changeParams);

        TextView changeTitle = new TextView(this);
        changeTitle.setText("YANG BARU");
        changeTitle.setTextSize(9);
        changeTitle.setTextColor(Color.BLACK);
        changeTitle.setTypeface(null, android.graphics.Typeface.BOLD);
        changeCard.addView(changeTitle);

        TextView changelog = new TextView(this);
        changelog.setText("• Koneksi internet wajib untuk menggunakan planner\n• Tampilan khusus saat perangkat offline\n• Tombol REFRESH untuk mencoba kembali");
        changelog.setTextSize(11);
        changelog.setTextColor(Color.BLACK);
        LinearLayout.LayoutParams changelogParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        changelogParams.topMargin = dp(5);
        changeCard.addView(changelog, changelogParams);

        Button reportBug = new Button(this);
        reportBug.setText("LAPORKAN BUG");
        styleNeoButton(reportBug, "#F472B6", "#000000");
        reportBug.setOnClickListener(v -> reportBug());
        LinearLayout.LayoutParams reportParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        reportParams.topMargin = dp(10);
        root.addView(reportBug, reportParams);

        Button close = new Button(this);
        close.setText("TUTUP");
        styleNeoButton(close, "#FFFFFF", "#000000");
        close.setOnClickListener(v -> aboutDialog.dismiss());
        LinearLayout.LayoutParams closeParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        closeParams.topMargin = dp(10);
        root.addView(close, closeParams);

        aboutDialog.setContentView(root);
        aboutDialog.setCancelable(true);
        Window window = aboutDialog.getWindow();
        if (window != null) {
            window.setBackgroundDrawableResource(android.R.color.transparent);
        }
        aboutDialog.show();

        window = aboutDialog.getWindow();
        if (window != null) {
            int width = Math.min(
                getResources().getDisplayMetrics().widthPixels - dp(28),
                dp(390)
            );
            window.setLayout(width, ViewGroup.LayoutParams.WRAP_CONTENT);
        }
    }

    private void reportBug() {
        String body = "Jelaskan masalah yang terjadi:\n\n"
            + "Langkah sebelum masalah muncul:\n1. \n2. \n3. \n\n"
            + "Versi aplikasi: " + currentVersionName() + "\n"
            + "Android: " + Build.VERSION.RELEASE + "\n"
            + "Perangkat: " + Build.MANUFACTURER + " " + Build.MODEL + "\n";

        Uri mail = Uri.parse("mailto:argatamauka@gmail.com")
            .buildUpon()
            .appendQueryParameter("subject", "Bug Student Planner v" + currentVersionName())
            .appendQueryParameter("body", body)
            .build();

        Intent intent = new Intent(Intent.ACTION_SENDTO, mail);
        try {
            startActivity(intent);
        } catch (Exception e) {
            Toast.makeText(this, "Aplikasi email tidak ditemukan.", Toast.LENGTH_LONG).show();
        }
    }

    private void checkNativeUpdate() {
        if (aboutCheckButton == null || aboutStatus == null) return;

        aboutCheckButton.setEnabled(false);
        aboutCheckButton.setText("MEMERIKSA...");
        aboutUpdateButton.setVisibility(View.GONE);
        aboutStatus.setText("Memeriksa update...");
        aboutUpdateUrl = null;
        aboutUpdateVersion = null;

        networkExecutor.execute(() -> {
            HttpURLConnection connection = null;
            try {
                URL url = new URL("https://api.github.com/repos/argatamauka/student-planner-v2/releases/latest");
                connection = (HttpURLConnection) url.openConnection();
                connection.setConnectTimeout(12000);
                connection.setReadTimeout(12000);
                connection.setRequestProperty("Accept", "application/vnd.github+json");
                connection.setRequestProperty("User-Agent", "StudentPlannerAndroid/" + currentVersionName());

                int code = connection.getResponseCode();
                if (code < 200 || code >= 300) throw new Exception("HTTP " + code);

                BufferedReader reader = new BufferedReader(
                    new InputStreamReader(connection.getInputStream())
                );
                StringBuilder body = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) body.append(line);
                reader.close();

                JSONObject release = new JSONObject(body.toString());
                String latest = release.optString("tag_name", "").replaceFirst("^[vV]", "");
                JSONArray assets = release.optJSONArray("assets");
                String apkUrl = null;

                if (assets != null) {
                    for (int i = 0; i < assets.length(); i++) {
                        JSONObject asset = assets.optJSONObject(i);
                        if (asset != null && "Student-Planner-v2.apk".equals(asset.optString("name"))) {
                            apkUrl = asset.optString("browser_download_url", "");
                            break;
                        }
                    }
                }

                if (latest.isEmpty() || apkUrl == null || apkUrl.isEmpty()) {
                    throw new Exception("Release APK tidak ditemukan");
                }

                final String latestFinal = latest;
                final String apkUrlFinal = apkUrl;
                runOnUiThread(() -> {
                    if (aboutLatestVersion != null) aboutLatestVersion.setText("TERBARU\n" + latestFinal);
                    if (compareVersionNames(currentVersionName(), latestFinal) >= 0) {
                        aboutStatus.setText("Student Planner sudah menggunakan versi terbaru ✅");
                        aboutUpdateButton.setVisibility(View.GONE);
                    } else {
                        aboutUpdateVersion = latestFinal;
                        aboutUpdateUrl = apkUrlFinal;
                        aboutStatus.setText("Update v" + latestFinal + " tersedia.");
                        aboutUpdateButton.setText("UNDUH v" + latestFinal);
                        aboutUpdateButton.setVisibility(View.VISIBLE);
                    }
                    aboutCheckButton.setEnabled(true);
                    aboutCheckButton.setText("CEK UPDATE");
                });
            } catch (Exception e) {
                runOnUiThread(() -> {
                    if (aboutStatus != null) aboutStatus.setText("Gagal memeriksa update. Coba lagi saat internet aktif.");
                    if (aboutCheckButton != null) {
                        aboutCheckButton.setEnabled(true);
                        aboutCheckButton.setText("CEK UPDATE");
                    }
                });
            } finally {
                if (connection != null) connection.disconnect();
            }
        });
    }

    private int compareVersionNames(String a, String b) {
        String[] aa = String.valueOf(a).split("\\.");
        String[] bb = String.valueOf(b).split("\\.");
        int len = Math.max(aa.length, bb.length);

        for (int i = 0; i < len; i++) {
            int x = 0;
            int y = 0;
            try { if (i < aa.length) x = Integer.parseInt(aa[i].replaceAll("[^0-9]", "")); } catch (Exception ignored) {}
            try { if (i < bb.length) y = Integer.parseInt(bb[i].replaceAll("[^0-9]", "")); } catch (Exception ignored) {}
            if (x > y) return 1;
            if (x < y) return -1;
        }
        return 0;
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
        if (aboutDialog != null) {
            try { aboutDialog.dismiss(); } catch (Exception ignored) {}
        }
        networkExecutor.shutdownNow();
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
