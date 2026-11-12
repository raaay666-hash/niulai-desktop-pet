package art.niulai.android;

import android.app.*;
import android.content.*;
import android.os.*;
import android.provider.Settings;
import android.view.WindowManager;
import java.util.regex.*;

/** All version-dependent platform decisions live here. */
final class AndroidCompat {
    static boolean overlays(Context c) { return Settings.canDrawOverlays(c); }
    static int overlayType() { return WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY; }
    static int immutableFlag() { return PendingIntent.FLAG_IMMUTABLE; }
    static void startPet(Context c) { c.startForegroundService(new Intent(c,PetService.class)); }
    static void vibrate(Context c) {
        Vibrator v=(Vibrator)c.getSystemService(Context.VIBRATOR_SERVICE);if(v==null||!v.hasVibrator())return;
        v.vibrate(VibrationEffect.createOneShot(18,VibrationEffect.DEFAULT_AMPLITUDE));
    }
    static int webMajor(String userAgent) { Matcher m=Pattern.compile("(?:Chrome|Chromium)/(\\d+)").matcher(userAgent==null?"":userAgent);return m.find()?Integer.parseInt(m.group(1)):0; }
    static void receiver(Context c,BroadcastReceiver receiver,IntentFilter filter){if(Build.VERSION.SDK_INT>=33)c.registerReceiver(receiver,filter,Context.RECEIVER_NOT_EXPORTED);else c.registerReceiver(receiver,filter);}
    static Notification notification(Context c){
        NotificationManager manager=(NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE);
        if(Build.VERSION.SDK_INT>=26){NotificationChannel channel=new NotificationChannel("pet","牛来桌宠",NotificationManager.IMPORTANCE_LOW);channel.setDescription("桌宠、灵动岛运行与关闭控制");channel.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);manager.createNotificationChannel(channel);}
        PendingIntent open=PendingIntent.getActivity(c,0,new Intent(c,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),PendingIntent.FLAG_UPDATE_CURRENT|immutableFlag());
        PendingIntent stop=PendingIntent.getService(c,1,new Intent(c,PetService.class).setAction(PetService.STOP),PendingIntent.FLAG_UPDATE_CURRENT|immutableFlag());
        Notification.Builder b=Build.VERSION.SDK_INT>=26?new Notification.Builder(c,"pet"):new Notification.Builder(c);
        return b.setSmallIcon(c.getResources().getIdentifier("pet_notification","drawable",c.getPackageName())).setContentTitle("牛来悬浮功能运行中").setContentText("桌宠和灵动岛可分别在设置中关闭").setContentIntent(open).setOngoing(true).setVisibility(Notification.VISIBILITY_PRIVATE).setPriority(Notification.PRIORITY_LOW).addAction(new Notification.Action.Builder(android.R.drawable.ic_menu_close_clear_cancel,"关闭全部",stop).build()).build();
    }
}
