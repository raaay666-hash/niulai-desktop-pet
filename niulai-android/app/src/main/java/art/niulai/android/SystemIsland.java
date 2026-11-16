package art.niulai.android;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.drawable.Icon;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.service.notification.StatusBarNotification;
import java.util.Locale;
import org.json.JSONException;
import org.json.JSONObject;

/** System-owned ongoing notifications, including Android 16 Live Updates and Xiaomi focus data. */
final class SystemIsland {
    static final String CHANNEL = "market_live";
    static final int NOTIFICATION_ID = 100;
    private static final int PROMOTED_FLAG = 0x40000;

    static int focusProtocol(Context context) {
        try { return Settings.System.getInt(context.getContentResolver(), "notification_focus_protocol", 0); }
        catch (RuntimeException error) { return 0; }
    }

    static boolean supported(Context context) {
        return Build.VERSION.SDK_INT >= 36 || focusProtocol(context) >= 3;
    }

    static boolean use(Context context, JSONObject config) {
        String mode = config.optString("islandMode", "auto");
        return "system".equals(mode) || ("auto".equals(mode) && supported(context));
    }

    static String appId(Context context) {
        try {
            Bundle metadata = context.getPackageManager().getApplicationInfo(context.getPackageName(), PackageManager.GET_META_DATA).metaData;
            Object value = metadata == null ? null : metadata.get("com.xiaomi.xms.APP_ID");
            return value == null ? "" : String.valueOf(value);
        } catch (PackageManager.NameNotFoundException error) { return ""; }
    }

    static boolean notifications(Context context) {
        if (Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) return false;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        NotificationChannel channel = manager.getNotificationChannel(CHANNEL);
        return manager.areNotificationsEnabled() && (channel == null || channel.getImportance() != NotificationManager.IMPORTANCE_NONE);
    }

    static JSONObject status(Context context) {
        JSONObject status = new JSONObject();
        try {
            JSONObject state = AppState.load(context);
            boolean system = use(context, state);
            NotificationManager manager = context.getSystemService(NotificationManager.class);
            boolean promoted = false, posted = false, allowed = false;
            if (Build.VERSION.SDK_INT >= 36) {
                try { allowed = (Boolean)NotificationManager.class.getMethod("canPostPromotedNotifications").invoke(manager); }
                catch (ReflectiveOperationException ignored) { }
            }
            for (StatusBarNotification item : manager.getActiveNotifications()) {
                if (item.getId() == NOTIFICATION_ID && CHANNEL.equals(item.getNotification().getChannelId())) {
                    posted = true;
                    promoted = (item.getNotification().flags & PROMOTED_FLAG) != 0;
                }
            }
            status.put("system", system);
            status.put("supported", supported(context));
            status.put("sdk", Build.VERSION.SDK_INT);
            status.put("focusProtocol", focusProtocol(context));
            status.put("xiaomiConfigured", !appId(context).isEmpty());
            status.put("notifications", notifications(context));
            status.put("promotionAllowed", allowed);
            status.put("promoted", promoted);
            status.put("posted", posted);
            status.put("enabled", state.optBoolean("islandEnabled"));
        } catch (RuntimeException | JSONException error) {
            try { status.put("error", "系统状态暂不可用"); } catch (JSONException ignored) { }
        }
        return status;
    }

    static Notification create(Context context, JSONObject config, NativeMarket.Quote quote, String error) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        NotificationChannel channel = new NotificationChannel(CHANNEL, "系统灵动岛行情", NotificationManager.IMPORTANCE_DEFAULT);
        channel.setDescription("用户开启盯盘期间的实时行情与关闭操作");
        channel.setSound(null, null);
        channel.enableVibration(false);
        manager.createNotificationChannel(channel);
        boolean wood = "muyu".equals(config.optString("islandContent"));
        String selected = config.optString("islandSymbol");
        if (!NativeMarket.valid(selected)) selected = config.optString("symbol", "s_sh000001");
        String name = quote == null ? NativeMarket.display(selected) : quote.name;
        String value = quote == null ? "等待行情" : String.format(Locale.US, "%.2f", quote.price);
        String change = quote == null || !Double.isFinite(quote.pct) ? "" : String.format(Locale.US, "%+.2f%%", quote.pct);
        if (!config.optBoolean("islandPrice", true)) value = "盯盘中";
        if (!config.optBoolean("islandPercent", true)) change = "";
        if (wood) {
            name = "牛来木鱼";
            value = config.optBoolean("islandCount", true) ? "本轮 " + MuyuStore.read(context).optLong("session") : "休息中";
            change = "";
        }
        String summary = value + (change.isEmpty() ? "" : "  " + change);
        String source = wood ? "点击通知打开木鱼" : quote == null ? "正在获取公开行情" : ("tencent".equals(quote.source) ? "腾讯" : "新浪") + " · 获取于 " + new java.text.SimpleDateFormat("HH:mm:ss", Locale.CHINA).format(new java.util.Date(quote.received));
        if (error != null) source = "更新失败，保留上次报价";
        int icon = context.getResources().getIdentifier("pet_notification", "drawable", context.getPackageName());
        PendingIntent open = PendingIntent.getActivity(context, 70, new Intent(context, MainActivity.class), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder builder = new Notification.Builder(context, CHANNEL)
            .setSmallIcon(icon)
            .setContentTitle(name)
            .setContentText(summary)
            .setStyle(new Notification.BigTextStyle().bigText(summary + "\n" + source))
            .setContentIntent(open)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setCategory(Notification.CATEGORY_STATUS)
            .setVisibility(Notification.VISIBILITY_PRIVATE)
            .addAction(new Notification.Action.Builder(null, "关闭灵动岛", action(context, PetService.CLOSE_ISLAND, 73)).build());
        if (!wood) {
            builder.addAction(new Notification.Action.Builder(null, "上一只", action(context, "art.niulai.ISLAND_PREVIOUS", 71)).build());
            builder.addAction(new Notification.Action.Builder(null, "下一只", action(context, "art.niulai.ISLAND_NEXT", 72)).build());
        }
        if (Build.VERSION.SDK_INT >= 31) builder.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE);
        if (Build.VERSION.SDK_INT >= 36) {
            try {
                Notification.Builder.class.getMethod("setRequestPromotedOngoing", boolean.class).invoke(builder, true);
                String critical = wood ? "木鱼" : change.isEmpty() ? value : change;
                Notification.Builder.class.getMethod("setShortCriticalText", String.class).invoke(builder, critical);
            } catch (ReflectiveOperationException reflectionError) {
                android.util.Log.w("NiulaiIsland", "Live Update API unavailable", reflectionError);
            }
        }
        Notification notification = builder.build();
        if (focusProtocol(context) >= 3 && !appId(context).isEmpty()) {
            try {
                notification.extras.putString("miui.focus.param", xiaomiPayload(name, summary, change));
                Bundle pictures = new Bundle();
                pictures.putParcelable("miui.focus.pic_niulai", Icon.createWithResource(context, icon));
                notification.extras.putBundle("miui.focus.pics", pictures);
            } catch (JSONException jsonError) { android.util.Log.w("NiulaiIsland", "Focus data unavailable", jsonError); }
        }
        return notification;
    }

    private static PendingIntent action(Context context, String action, int request) {
        return PendingIntent.getService(context, request, new Intent(context, PetService.class).setAction(action), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static String xiaomiPayload(String title, String content, String change) throws JSONException {
        JSONObject picture = new JSONObject().put("type", 1).put("pic", "miui.focus.pic_niulai");
        JSONObject text = new JSONObject().put("title", title).put("content", content);
        JSONObject big = new JSONObject().put("imageTextInfoLeft", new JSONObject().put("type", 1).put("picInfo", picture).put("textInfo", text));
        big.put("textInfo", new JSONObject().put("title", change.isEmpty() ? "盯盘中" : change));
        JSONObject island = new JSONObject().put("islandProperty", 1).put("islandFirstFloat", false)
            .put("bigIslandArea", big).put("smallIslandArea", new JSONObject().put("picInfo", picture));
        JSONObject data = new JSONObject().put("protocol", 1).put("business", "stock_monitor")
            .put("updatable", true).put("enableFloat", false).put("islandFirstFloat", false)
            .put("ticker", title + " " + content).put("aodTitle", title + " " + content)
            .put("param_island", island).put("baseInfo", new JSONObject().put("type", 2).put("title", title).put("content", content));
        return new JSONObject().put("param_v2", data).toString();
    }
}
