package art.niulai.android;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;

enum AlertChannel {
    NEWS("stock_news", "关注股票的新闻"),
    UPDATES("updates", "版本更新");

    private final String previousId;
    private final String name;

    AlertChannel(String previousId, String name) {
        this.previousId = previousId;
        this.name = name;
    }

    static boolean hasPermission(Context context) {
        return Build.VERSION.SDK_INT < 33 || context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
            == PackageManager.PERMISSION_GRANTED;
    }

    static boolean appEnabled(Context context) {
        return hasPermission(context) && context.getSystemService(NotificationManager.class).areNotificationsEnabled();
    }

    NotificationChannel get(Context context) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        NotificationChannel previous = manager.getNotificationChannel(previousId);
        // Android keeps channel importance once created. Preserve user-managed channels on upgrade.
        if (previous != null && (Build.VERSION.SDK_INT < 29
                || previous.getImportance() != NotificationManager.IMPORTANCE_DEFAULT
                || previous.hasUserSetImportance() || previous.getSound() == null
                || (Build.VERSION.SDK_INT >= 30 && previous.hasUserSetSound()))) {
            return previous;
        }
        String id = previousId + "_alerts";
        NotificationChannel channel = manager.getNotificationChannel(id);
        if (channel != null) return channel;
        channel = new NotificationChannel(id, name, NotificationManager.IMPORTANCE_HIGH);
        manager.createNotificationChannel(channel);
        return manager.getNotificationChannel(id);
    }

    boolean enabled(Context context) {
        if (!appEnabled(context)) return false;
        NotificationChannel channel = get(context);
        return channel != null && channel.getImportance() != NotificationManager.IMPORTANCE_NONE;
    }
}
