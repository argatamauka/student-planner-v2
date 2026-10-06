package com.argatamauka.studentplanner;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.os.Build;
import android.provider.Settings;
import org.json.JSONArray;
import org.json.JSONObject;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

public final class ReminderScheduler {
    private static final String PREFS = "student_planner_reminders";
    private static final String PAYLOAD_KEY = "payload";
    private static final String CODES_KEY = "request_codes";
    public static final String CHANNEL_SCHEDULE = "schedule_reminders_v2";
    public static final String CHANNEL_TASKS = "task_reminders_v2";

    private ReminderScheduler() {}

    public static void createNotificationChannels(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;

        AudioAttributes soundAttributes = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();

        NotificationChannel schedule = new NotificationChannel(
            CHANNEL_SCHEDULE,
            "Jadwal Kuliah",
            NotificationManager.IMPORTANCE_HIGH
        );
        schedule.setDescription("Pengingat sebelum jadwal kuliah dimulai");
        schedule.setSound(Settings.System.DEFAULT_NOTIFICATION_URI, soundAttributes);

        NotificationChannel tasks = new NotificationChannel(
            CHANNEL_TASKS,
            "Deadline Tugas",
            NotificationManager.IMPORTANCE_HIGH
        );
        tasks.setDescription("Pengingat deadline tugas");
        tasks.setSound(Settings.System.DEFAULT_NOTIFICATION_URI, soundAttributes);

        manager.createNotificationChannel(schedule);
        manager.createNotificationChannel(tasks);
    }

    public static void sync(Context context, String payload) {
        try {
            JSONObject root = new JSONObject(payload);
            clearAlarmsOnly(context);
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString(PAYLOAD_KEY, payload)
                .apply();

            Set<String> codes = new HashSet<>();
            if (root.optBoolean("scheduleEnabled", true)) {
                scheduleClasses(context, root, codes);
            }
            if (root.optBoolean("taskEnabled", true)) {
                scheduleTasks(context, root, codes);
            }
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putStringSet(CODES_KEY, codes)
                .apply();
        } catch (Exception ignored) {}
    }

    public static void clear(Context context) {
        clearAlarmsOnly(context);
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .remove(PAYLOAD_KEY)
            .remove(CODES_KEY)
            .apply();
    }

    public static void restore(Context context) {
        String payload = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(PAYLOAD_KEY, null);
        if (payload != null && !payload.isEmpty()) sync(context, payload);
    }

    public static void rescheduleWeekly(Context context, Intent firedIntent) {
        if (!firedIntent.getBooleanExtra("repeat_weekly", false)) return;

        int code = firedIntent.getIntExtra("notification_id", 0);
        int day = firedIntent.getIntExtra("repeat_day", -1);
        int hour = firedIntent.getIntExtra("repeat_hour", -1);
        int minute = firedIntent.getIntExtra("repeat_minute", -1);
        int before = firedIntent.getIntExtra("repeat_before", 0);
        String title = firedIntent.getStringExtra("title");
        String body = firedIntent.getStringExtra("body");
        String channel = firedIntent.getStringExtra("channel");

        if (code <= 0 || day == -1 || hour < 0 || minute < 0) return;
        Calendar next = nextWeekly(day, hour, minute, before);
        scheduleExact(
            context,
            code,
            next.getTimeInMillis(),
            title,
            body,
            channel,
            true,
            day,
            hour,
            minute,
            before
        );
    }

    private static void clearAlarmsOnly(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        Set<String> saved = prefs.getStringSet(CODES_KEY, new HashSet<>());
        AlarmManager alarm = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarm == null) return;

        for (String value : new HashSet<>(saved)) {
            try {
                int code = Integer.parseInt(value);
                PendingIntent pi = PendingIntent.getBroadcast(
                    context,
                    code,
                    new Intent(context, ReminderReceiver.class),
                    PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE
                );
                if (pi != null) {
                    alarm.cancel(pi);
                    pi.cancel();
                }
            } catch (Exception ignored) {}
        }
        prefs.edit().remove(CODES_KEY).apply();
    }

    private static void scheduleClasses(Context context, JSONObject root, Set<String> codes) {
        JSONArray list = root.optJSONArray("schedules");
        if (list == null) return;
        int before = Math.max(0, root.optInt("scheduleMinutes", 30));
        String userId = root.optString("userId", "");

        for (int i = 0; i < list.length(); i++) {
            JSONObject item = list.optJSONObject(i);
            if (item == null) continue;

            int hour = item.optInt("hour", -1);
            int minute = item.optInt("minute", -1);
            int day = dayOfWeek(item.optString("day", ""));
            if (hour < 0 || minute < 0 || day == -1) continue;

            Calendar trigger = nextWeekly(day, hour, minute, before);
            String title = "Kuliah " + before + " menit lagi";
            StringBuilder body = new StringBuilder(item.optString("course", "Jadwal kuliah"));
            String time = item.optString("time", "");
            String room = item.optString("room", "");
            if (!time.isEmpty()) body.append(" • ").append(time);
            if (!room.isEmpty()) body.append(" • ").append(room);

            int code = stableCode(userId + ":schedule:" + item.optString("id", String.valueOf(i)));
            scheduleExact(
                context,
                code,
                trigger.getTimeInMillis(),
                title,
                body.toString(),
                CHANNEL_SCHEDULE,
                true,
                day,
                hour,
                minute,
                before
            );
            codes.add(String.valueOf(code));
        }
    }

    private static void scheduleTasks(Context context, JSONObject root, Set<String> codes) {
        JSONArray list = root.optJSONArray("tasks");
        if (list == null) return;
        int daysBefore = Math.max(1, root.optInt("taskDays", 1));
        int reminderHour = Math.min(23, Math.max(0, root.optInt("taskHour", 19)));
        String userId = root.optString("userId", "");
        long now = System.currentTimeMillis();

        for (int i = 0; i < list.length(); i++) {
            JSONObject item = list.optJSONObject(i);
            if (item == null) continue;
            String deadline = item.optString("deadline", "");
            if (deadline.isEmpty()) continue;

            try {
                SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
                sdf.setLenient(false);
                Date date = sdf.parse(deadline);
                if (date == null) continue;

                Calendar early = Calendar.getInstance();
                early.setTime(date);
                early.set(Calendar.HOUR_OF_DAY, reminderHour);
                early.set(Calendar.MINUTE, 0);
                early.set(Calendar.SECOND, 0);
                early.set(Calendar.MILLISECOND, 0);
                early.add(Calendar.DAY_OF_YEAR, -daysBefore);

                String taskName = item.optString("name", "Tugas");
                String course = item.optString("course", "");
                String earlyTitle = daysBefore == 1 ? "Deadline besok" : "Deadline " + daysBefore + " hari lagi";
                String body = course.isEmpty() ? taskName : taskName + " • " + course;

                if (early.getTimeInMillis() > now) {
                    int code = stableCode(userId + ":task:early:" + item.optString("id", String.valueOf(i)));
                    scheduleExact(
                        context,
                        code,
                        early.getTimeInMillis(),
                        earlyTitle,
                        body,
                        CHANNEL_TASKS,
                        false,
                        -1,
                        -1,
                        -1,
                        0
                    );
                    codes.add(String.valueOf(code));
                }

                Calendar due = Calendar.getInstance();
                due.setTime(date);
                due.set(Calendar.HOUR_OF_DAY, 8);
                due.set(Calendar.MINUTE, 0);
                due.set(Calendar.SECOND, 0);
                due.set(Calendar.MILLISECOND, 0);

                if (due.getTimeInMillis() > now) {
                    int code = stableCode(userId + ":task:due:" + item.optString("id", String.valueOf(i)));
                    scheduleExact(
                        context,
                        code,
                        due.getTimeInMillis(),
                        "Deadline hari ini",
                        body,
                        CHANNEL_TASKS,
                        false,
                        -1,
                        -1,
                        -1,
                        0
                    );
                    codes.add(String.valueOf(code));
                }
            } catch (Exception ignored) {}
        }
    }

    private static Calendar nextWeekly(int dayOfWeek, int hour, int minute, int minutesBefore) {
        Calendar now = Calendar.getInstance();
        Calendar event = Calendar.getInstance();
        event.set(Calendar.SECOND, 0);
        event.set(Calendar.MILLISECOND, 0);
        event.set(Calendar.HOUR_OF_DAY, hour);
        event.set(Calendar.MINUTE, minute);

        int delta = (dayOfWeek - event.get(Calendar.DAY_OF_WEEK) + 7) % 7;
        event.add(Calendar.DAY_OF_YEAR, delta);
        event.add(Calendar.MINUTE, -minutesBefore);
        if (!event.after(now)) event.add(Calendar.DAY_OF_YEAR, 7);
        return event;
    }

    private static int dayOfWeek(String day) {
        switch (day.toLowerCase(Locale.ROOT)) {
            case "minggu": return Calendar.SUNDAY;
            case "senin": return Calendar.MONDAY;
            case "selasa": return Calendar.TUESDAY;
            case "rabu": return Calendar.WEDNESDAY;
            case "kamis": return Calendar.THURSDAY;
            case "jumat":
            case "jum'at": return Calendar.FRIDAY;
            case "sabtu": return Calendar.SATURDAY;
            default: return -1;
        }
    }

    private static void scheduleExact(
        Context context,
        int code,
        long triggerAt,
        String title,
        String body,
        String channel,
        boolean repeatWeekly,
        int repeatDay,
        int repeatHour,
        int repeatMinute,
        int repeatBefore
    ) {
        AlarmManager alarm = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarm == null) return;

        PendingIntent pi = reminderIntent(
            context,
            code,
            title,
            body,
            channel,
            repeatWeekly,
            repeatDay,
            repeatHour,
            repeatMinute,
            repeatBefore
        );

        boolean exactAllowed = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarm.canScheduleExactAlarms();
        if (exactAllowed) {
            alarm.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi);
        } else {
            alarm.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi);
        }
    }

    private static PendingIntent reminderIntent(
        Context context,
        int code,
        String title,
        String body,
        String channel,
        boolean repeatWeekly,
        int repeatDay,
        int repeatHour,
        int repeatMinute,
        int repeatBefore
    ) {
        Intent intent = new Intent(context, ReminderReceiver.class);
        intent.putExtra("notification_id", code);
        intent.putExtra("title", title);
        intent.putExtra("body", body);
        intent.putExtra("channel", channel);
        intent.putExtra("repeat_weekly", repeatWeekly);
        if (repeatWeekly) {
            intent.putExtra("repeat_day", repeatDay);
            intent.putExtra("repeat_hour", repeatHour);
            intent.putExtra("repeat_minute", repeatMinute);
            intent.putExtra("repeat_before", repeatBefore);
        }
        return PendingIntent.getBroadcast(
            context,
            code,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private static int stableCode(String key) {
        return key.hashCode() & 0x7fffffff;
    }
}
