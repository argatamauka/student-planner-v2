"use strict";

const byId = (id) => document.getElementById(id);
const safe = (value) => String(value ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const rupiah = (value) => "Rp " + Number(value || 0).toLocaleString("id-ID");
const WEEKDAY = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const MS_DAY = 86400000;

let signedInUser = null;
let preferences = { sabbath: true, finance: true, limit: 5 };
let cache = {};
let realtime = null;
let refreshTimer = null;
let lastRefresh = 0;
let loadId = 0;

function localDayStart(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
function parseDateOnly(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const parsed = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (parsed.getFullYear() !== Number(match[1]) ||
      parsed.getMonth() !== Number(match[2]) - 1 ||
      parsed.getDate() !== Number(match[3])) return null;
  return parsed;
}
function dateDistance(isoDate) {
  const date = parseDateOnly(isoDate);
  return date ? Math.round((date - localDayStart()) / MS_DAY) : null;
}
function friendlyDate(isoDate) {
  const date = parseDateOnly(isoDate);
  return date ? date.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "Tanggal belum ditentukan";
}
function startMinutes(range) {
  const match = String(range || "").match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const h = Number(match[1]), m = Number(match[2]);
  return h <= 23 && m <= 59 ? h * 60 + m : null;
}
function currentMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}
function isSabbath() {
  return preferences.sabbath && new Date().getDay() === 6;
}
function setText(id, value) {
  const element = byId(id);
  if (element) element.textContent = value;
}
function showMessage(text) {
  const el = byId("error-banner");
  el.textContent = text;
  el.classList.remove("hidden");
}
function clearMessage() {
  byId("error-banner").classList.add("hidden");
}
function getPrefsKey() {
  return "studentPlannerAssistantPrefs:" + signedInUser.id;
}
function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(getPrefsKey()) || "{}");
    preferences = {
      sabbath: p.sabbath !== false,
      finance: p.finance !== false,
      limit: [3, 5, 10].includes(Number(p.limit)) ? Number(p.limit) : 5
    };
  } catch {
    preferences = { sabbath: true, finance: true, limit: 5 };
  }
  byId("sabbath-mode").checked = preferences.sabbath;
  byId("finance-visible").checked = preferences.finance;
  byId("task-limit").value = String(preferences.limit);
}
function savePrefs() {
  preferences.sabbath = byId("sabbath-mode").checked;
  preferences.finance = byId("finance-visible").checked;
  preferences.limit = Number(byId("task-limit").value) || 5;
  localStorage.setItem(getPrefsKey(), JSON.stringify(preferences));
  renderAll();
}
function listRow(title, detail, label, chipClass = "") {
  return '<div class="list-row"><div class="list-row-main"><strong>' + safe(title) +
    '</strong><small>' + safe(detail) + '</small></div>' +
    (label ? '<span class="chip ' + safe(chipClass) + '">' + safe(label) + '</span>' : "") +
    '</div>';
}
function emptyItem(text) {
  return '<p class="empty">' + safe(text) + '</p>';
}
function pendingTasks() {
  return Array.isArray(cache.tasks) ? cache.tasks.filter((task) => !task.completed) : [];
}
function taskRank(task) {
  const delta = dateDistance(task.deadline);
  return delta === null ? Number.MAX_SAFE_INTEGER : delta;
}
function deadlineLabel(task) {
  const days = dateDistance(task.deadline);
  if (days === null) return { label: "TANPA TANGGAL", style: "later" };
  if (days < 0) return { label: "TERLAMBAT " + Math.abs(days) + " H", style: "overdue" };
  if (days === 0) return { label: "HARI INI", style: "today" };
  if (days === 1) return { label: "BESOK", style: "soon" };
  if (days <= 3) return { label: days + " HARI LAGI", style: "soon" };
  return { label: days + " HARI LAGI", style: "later" };
}
function sortedTasks() {
  return pendingTasks().slice().sort((a, b) =>
    taskRank(a) - taskRank(b) || String(a.name || "").localeCompare(String(b.name || ""), "id")
  );
}
function todaysSchedules() {
  if (!Array.isArray(cache.schedules)) return [];
  const today = WEEKDAY[new Date().getDay()].toLowerCase();
  return cache.schedules.filter((s) => String(s.day || "").trim().toLowerCase() === today)
    .sort((a, b) => (startMinutes(a.time_range) ?? 9999) - (startMinutes(b.time_range) ?? 9999));
}
function thisWeekStart() {
  const monday = localDayStart();
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return monday;
}
function isoLocalDay(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + d;
}
function weeklyFinance() {
  if (!Array.isArray(cache.transactions)) return null;
  const monday = thisWeekStart();
  const thisWeek = isoLocalDay(monday);
  const nextMon = new Date(monday); nextMon.setDate(monday.getDate() + 7);
  const endThis = isoLocalDay(nextMon);
  const prevMon = new Date(monday); prevMon.setDate(monday.getDate() - 7);
  const prevStart = isoLocalDay(prevMon);
  const rows = cache.transactions;
  const current = rows.filter((row) => row.tx_date >= thisWeek && row.tx_date < endThis);
  const previous = rows.filter((row) => row.tx_date >= prevStart && row.tx_date < thisWeek);
  const total = (items, type) => items.filter((item) => item.type === type)
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const expense = total(current, "keluar");
  const income = total(current, "masuk");
  const prevExpense = total(previous, "keluar");
  const categories = new Map();
  for (const item of current.filter((row) => row.type === "keluar")) {
    const name = String(item.category || "Lainnya");
    categories.set(name, (categories.get(name) || 0) + Number(item.amount || 0));
  }
  const mainCategory = [...categories.entries()].sort((a, b) => b[1] - a[1])[0] || null;
  return { expense, income, prevExpense, count: current.length, mainCategory };
}
function renderHeader() {
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 11 ? "Selamat pagi" : hour < 15 ? "Selamat siang" : hour < 18 ? "Selamat sore" : "Selamat malam";
  const name = String(cache.profile?.name || "").trim().replace(",", " ").split(/\s+/)[0] || "";
  setText("today-date", now.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" }));
  const classes = todaysSchedules();
  const tasks = pendingTasks();
  const note = isSabbath()
    ? "Hari Sabtu untuk ibadah dan pemulihan. Semua ringkasan di bawah berasal dari data yang kamu simpan."
    : "Ada " + classes.length + " kelas tercatat hari ini dan " + tasks.length + " tugas aktif. Ini prioritas yang bisa kamu tinjau.";
  setText("greeting", greeting + (name ? ", " + name : "") + "! " + note);
  byId("day-note").classList.toggle("hidden", !isSabbath());
  setText("count-classes", Array.isArray(cache.schedules) ? String(classes.length) : "—");
  setText("count-tasks", Array.isArray(cache.tasks) ? String(tasks.length) : "—");
  const urgent = tasks.filter((task) => {
    const days = dateDistance(task.deadline);
    return days !== null && days >= 0 && days <= 3;
  });
  setText("count-urgent", Array.isArray(cache.tasks) ? String(urgent.length) : "—");
}
function renderTasks() {
  if (!Array.isArray(cache.tasks)) {
    byId("task-list").innerHTML = emptyItem("Data tugas belum dapat dimuat.");
    return;
  }
  const tasks = sortedTasks().slice(0, preferences.limit);
  byId("task-list").innerHTML = tasks.length ? tasks.map((task) => {
    const badge = deadlineLabel(task);
    const detail = (task.course_name || "Mata kuliah belum dipilih") + " • " + friendlyDate(task.deadline);
    return listRow(task.name || "Tugas tanpa nama", detail, badge.label, badge.style);
  }).join("") : emptyItem("Tidak ada tugas aktif. Semua tugas yang tercatat sudah selesai! 🎉");
}
function renderSchedule() {
  if (!Array.isArray(cache.schedules)) {
    byId("schedule-list").innerHTML = emptyItem("Data jadwal belum dapat dimuat.");
    return;
  }
  const schedules = todaysSchedules();
  const minuteNow = currentMinutes();
  const next = schedules.find((item) => {
    const time = startMinutes(item.time_range);
    return time !== null && time >= minuteNow;
  });
  setText("schedule-note", isSabbath()
    ? "Hari Sabtu diprioritaskan untuk ibadah. Jadwal di bawah hanya menampilkan data yang sudah tersimpan."
    : next ? "Kelas berikutnya: " + (next.course_name || "Mata kuliah") + " • " + (next.time_range || "Waktu belum tersedia")
      : "Urutan jadwal yang tercatat untuk " + WEEKDAY[new Date().getDay()] + ".");
  byId("schedule-list").innerHTML = schedules.length ? schedules.map((item) => {
    const isNext = item === next;
    const detail = (item.time_range || "Waktu belum tersedia") + (item.room ? " • " + item.room : "");
    return listRow(item.course_name || "Mata kuliah", detail, isNext ? "BERIKUTNYA" : "", "next");
  }).join("") : emptyItem("Tidak ada jadwal kuliah tercatat untuk hari ini.");
}
function renderFinance() {
  byId("keuangan").classList.toggle("hidden", !preferences.finance);
  if (!preferences.finance) return;
  const finance = weeklyFinance();
  if (!finance) {
    setText("week-expense", "—");
    setText("week-income", "—");
    setText("finance-note", "Data transaksi belum dapat dimuat.");
  } else {
    setText("week-expense", rupiah(finance.expense));
    setText("week-income", rupiah(finance.income));
    const label = finance.mainCategory
      ? "Pengeluaran terbesar: " + finance.mainCategory[0] + " (" + rupiah(finance.mainCategory[1]) + ")."
      : "Belum ada pengeluaran yang tercatat minggu ini.";
    setText("finance-note", label);
  }
  const savings = cache.savings;
  const target = Number(savings?.target_amount || 0);
  const amount = Number(savings?.amount || 0);
  const percent = target > 0 ? Math.min(100, Math.max(0, (amount / target) * 100)) : 0;
  const hasSavings = Object.prototype.hasOwnProperty.call(cache, "savings");
  setText("saving-percent", !hasSavings ? "—" : target > 0 ? Math.round(percent) + "%" : "BELUM ADA");
  byId("saving-fill").style.width = percent + "%";
  byId("saving-progress").setAttribute("aria-valuenow", String(Math.round(percent)));
  setText("saving-note", !hasSavings ? "Data tabungan belum dapat dimuat."
    : target <= 0 ? "Belum ada target tabungan yang diatur."
      : (savings.target_name || "Target tabungan") + ": " + rupiah(amount) + " dari " + rupiah(target) + ".");
}
function insight(icon, title, body) {
  return '<div class="insight"><span class="insight-icon" aria-hidden="true">' + icon +
    '</span><div><strong>' + safe(title) + '</strong><p>' + safe(body) + '</p></div></div>';
}
function renderInsights() {
  const insights = [];
  const tasks = sortedTasks();
  const today = todaysSchedules();
  const finance = preferences.finance ? weeklyFinance() : null;

  if (isSabbath()) {
    insights.push(insight("🙏", "FOKUS HARI SABTU",
      "Prioritaskan ibadah, istirahat, dan rutinitas asrama. Tidak ada sesi belajar tambahan yang dijadwalkan oleh asisten."));
  } else {
    if (Array.isArray(cache.tasks)) {
      const overdue = tasks.filter((t) => {
        const days = dateDistance(t.deadline);
        return days !== null && days < 0;
      });
      const dueNow = tasks.find((t) => dateDistance(t.deadline) === 0);
      if (overdue.length) insights.push(insight("⚠️", "ADA TUGAS TERLAMBAT",
        overdue.length + " tugas melewati deadline. Periksa status tugas di beranda dan konfirmasi dengan dosen bila perlu."));
      else if (dueNow) insights.push(insight("📌", "DEADLINE HARI INI",
        (dueNow.name || "Salah satu tugas") + " tercatat memiliki deadline hari ini."));
      else if (tasks.length && dateDistance(tasks[0].deadline) !== null && dateDistance(tasks[0].deadline) <= 3)
        insights.push(insight("📝", "KERJAKAN TUGAS TERDEKAT",
          (tasks[0].name || "Tugas") + " memiliki deadline " + friendlyDate(tasks[0].deadline) + "."));
      else if (tasks.length === 0)
        insights.push(insight("✅", "TUGAS TERKENDALI", "Tidak ada tugas aktif yang tercatat. Cek kembali bila ada tugas yang belum dimasukkan."));
    }
    if (Array.isArray(cache.schedules)) {
      const next = today.find((s) => startMinutes(s.time_range) !== null && startMinutes(s.time_range) >= currentMinutes());
      if (next) insights.push(insight("🎓", "KELAS BERIKUTNYA",
        (next.course_name || "Mata kuliah") + " mulai pukul " + String(next.time_range).match(/\d{1,2}:\d{2}/)[0] +
        (next.room ? " di " + next.room : "") + "."));
    }
  }

  if (finance && finance.prevExpense > 0 && finance.expense > finance.prevExpense * 1.25)
    insights.push(insight("💸", "PENGELUARAN MENINGKAT",
      "Pengeluaran minggu ini lebih tinggi dari minggu sebelumnya. Coba periksa transaksi dan kategorinya."));
  else if (finance && finance.count === 0)
    insights.push(insight("💰", "CATAT KEUANGAN", "Belum ada transaksi minggu ini. Catat pengeluaran agar ringkasannya lebih akurat."));

  if (!insights.length && Object.keys(cache).length)
    insights.push(insight("✨", "SIAP JALANI HARI", "Belum ada hal mendesak yang dapat disimpulkan dari data. Tambahkan jadwal dan tugas agar asisten lebih berguna."));
  byId("insight-list").innerHTML = insights.length ? insights.slice(0, 4).join("")
    : emptyItem("Data belum tersedia untuk menyusun saran.");
}
function renderAll() {
  renderHeader();
  renderTasks();
  renderSchedule();
  renderFinance();
  renderInsights();
}

async function refreshData() {
  const thisLoad = ++loadId;
  byId("refresh-btn").disabled = true;
  setText("sync-status", "MENYINKRONKAN...");
  clearMessage();
  const sources = [
    { name: "profile", query: sb.from("profiles").select("name").maybeSingle() },
    { name: "schedules", query: sb.from("schedules").select("id,day,course_name,time_range,room") },
    { name: "tasks", query: sb.from("tasks").select("id,name,course_name,deadline,completed") },
    { name: "transactions", query: sb.from("transactions").select("id,amount,type,tx_date,category") },
    { name: "savings", query: sb.from("savings").select("target_name,target_amount,amount").maybeSingle() }
  ];
  const results = await Promise.all(sources.map(async (entry) => {
    try {
      const response = await entry.query;
      if (response.error) throw response.error;
      return { name: entry.name, data: response.data, success: true };
    } catch {
      return { name: entry.name, success: false };
    }
  }));
  if (thisLoad !== loadId) return;
  const failed = [];
  for (const result of results) {
    if (result.success) cache[result.name] = result.data;
    else {
      delete cache[result.name];
      failed.push(result.name);
    }
  }
  renderAll();
  byId("refresh-btn").disabled = false;
  lastRefresh = Date.now();
  const now = new Date();
  setText("sync-status", failed.length ? "DATA SEBAGIAN" :
    "DIPERBARUI " + String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0"));
  if (failed.length) showMessage("Beberapa data belum berhasil dimuat. Periksa internet lalu tekan PERBARUI RINGKASAN. Bagian yang gagal tidak dihitung sebagai nol.");
}
function startRealtime() {
  if (realtime || !signedInUser) return;
  const refreshLater = () => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => { refreshData().catch(handleUnexpectedError); }, 600);
  };
  realtime = sb.channel("assistant-v1-" + signedInUser.id);
  for (const table of ["profiles", "schedules", "tasks", "wallets", "transactions", "savings"]) {
    realtime.on("postgres_changes", {
      event: "*", schema: "public", table: table, filter: "user_id=eq." + signedInUser.id
    }, refreshLater);
  }
  realtime.subscribe();
}
function handleUnexpectedError(error) {
  byId("refresh-btn").disabled = false;
  setText("sync-status", "GAGAL MEMUAT");
  showMessage("Ringkasan belum dapat diperbarui. Coba cek koneksi internet lalu muat ulang halaman.");
  if (error) console.error("Assistant refresh failed:", error);
}
async function initAssistant() {
  byId("refresh-btn").addEventListener("click", () => refreshData().catch(handleUnexpectedError));
  for (const id of ["sabbath-mode", "finance-visible", "task-limit"])
    byId(id).addEventListener("change", savePrefs);
  try {
    if (typeof sb === "undefined") throw new Error("Supabase client tidak tersedia.");
    const { data, error } = await sb.auth.getSession();
    if (error) throw error;
    if (!data.session?.user) {
      location.replace("index.html");
      return;
    }
    signedInUser = data.session.user;
    loadPrefs();
    await refreshData();
    startRealtime();
    sb.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") location.replace("index.html");
    });
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && Date.now() - lastRefresh > 60000)
        refreshData().catch(handleUnexpectedError);
    });
    window.addEventListener("pagehide", () => {
      clearTimeout(refreshTimer);
      if (realtime) sb.removeChannel(realtime);
    });
  } catch (error) {
    handleUnexpectedError(error);
  }
}
document.addEventListener("DOMContentLoaded", initAssistant);
