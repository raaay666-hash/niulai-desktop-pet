package art.niulai.android;

import android.app.*;
import android.content.*;
import android.net.Uri;
import android.os.*;
import org.json.*;
import java.net.*;
import java.io.*;
import java.time.Instant;

/** Only announces a published, newer stable release from the official HTTPS site. */
final class UpdateChecker {
    static final String SITE = "https://niulai.raaay.art";
    static final String DOWNLOAD = SITE + "/download/#versions";
    private final Context app; private final android.content.SharedPreferences prefs;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Runnable changed; private volatile JSONObject status = new JSONObject();
    private volatile boolean busy, closed; private long checkedAt;
    UpdateChecker(Context context, Runnable listener) { app=context.getApplicationContext(); prefs=app.getSharedPreferences("updates",0); changed=listener; }
    String current() { try { return app.getPackageManager().getPackageInfo(app.getPackageName(),0).versionName; } catch(Exception e) { return "0.0.0"; } }
    String status() {
        try { JSONObject value=new JSONObject(status.toString()); value.put("current",current());value.put("checking",busy);value.put("enabled",prefs.getBoolean("enabled",true));value.put("permission",app.getSystemService(NotificationManager.class).areNotificationsEnabled());return value.toString(); }
        catch(Exception e){return "{}";}
    }
    void enabled(boolean enabled) { prefs.edit().putBoolean("enabled",enabled).apply(); changed.run(); }
    static int compare(String a,String b) {
        if(!a.matches("\\d{1,4}\\.\\d{1,4}\\.\\d{1,4}")||!b.matches("\\d{1,4}\\.\\d{1,4}\\.\\d{1,4}"))throw new IllegalArgumentException("version");
        String[] x=a.split("\\."),y=b.split("\\.");for(int i=0;i<3;i++){int delta=Integer.compare(Integer.parseInt(x[i]),Integer.parseInt(y[i]));if(delta!=0)return delta;}return 0;
    }
    void check(boolean manual) {
        if (closed || busy || !manual && checkedAt>0 && System.currentTimeMillis()-checkedAt<21600000) return;
        busy=true; changed.run();
        new Thread(()->{
            JSONObject result=new JSONObject(); HttpURLConnection connection=null;
            try {
                connection=(HttpURLConnection)new URL(SITE+"/updates.json").openConnection();
                connection.setConnectTimeout(12000);connection.setReadTimeout(12000);connection.setInstanceFollowRedirects(false);connection.setRequestProperty("Cache-Control","no-cache");
                if(connection.getResponseCode()!=200)throw new IOException("status");
                ByteArrayOutputStream bytes=new ByteArrayOutputStream();try(InputStream stream=connection.getInputStream()){byte[] buffer=new byte[4096];int count;while((count=stream.read(buffer))!=-1){if(bytes.size()+count>65536)throw new IOException("size");bytes.write(buffer,0,count);}}
                JSONObject manifest=new JSONObject(bytes.toString("UTF-8"));if(manifest.getInt("schema")!=1)throw new IOException("schema");
                JSONObject entry=manifest.getJSONObject("releases").getJSONObject("android");
                if(!entry.getString("status").equals("published")||Instant.parse(entry.getString("publishedAt")).toEpochMilli()>System.currentTimeMillis()||!entry.getString("url").equals(DOWNLOAD))throw new IOException("release");
                JSONArray notes=entry.getJSONArray("notes");if(notes.length()>8)throw new IOException("notes");for(int i=0;i<notes.length();i++)if(!(notes.get(i) instanceof String)||notes.getString(i).length()>160)throw new IOException("note");
                result=entry;result.put("available",compare(entry.getString("version"),current())>0);result.put("checkedAt",System.currentTimeMillis());
            } catch(Exception e){try{result=new JSONObject(status.toString());result.put("error","暂时无法检查更新，请稍后重试");}catch(Exception ignored){}}
            finally{if(connection!=null)connection.disconnect();}
            final JSONObject ready=result;
            main.post(()->{if(closed)return;busy=false;checkedAt=System.currentTimeMillis();status=ready;changed.run();if(!manual&&!ready.has("error"))notifyRelease(ready);});
        },"Niulai-update").start();
    }
    private void notifyRelease(JSONObject info) {
        String version=info.optString("version");NotificationManager manager=app.getSystemService(NotificationManager.class);
        if(!info.optBoolean("available")||!prefs.getBoolean("enabled",true)||version.equals(prefs.getString("notified",""))||!manager.areNotificationsEnabled())return;
        manager.createNotificationChannel(new NotificationChannel("updates","版本更新",NotificationManager.IMPORTANCE_DEFAULT));
        if(manager.getNotificationChannel("updates").getImportance()==NotificationManager.IMPORTANCE_NONE)return;
        PendingIntent open=PendingIntent.getActivity(app,1600,new Intent(Intent.ACTION_VIEW,Uri.parse(DOWNLOAD)),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        Notification notification=new Notification.Builder(app,"updates").setSmallIcon(app.getResources().getIdentifier("icon","drawable",app.getPackageName())).setContentTitle("牛来盯盘 "+version+" 已发布").setContentText(info.optJSONArray("notes").optString(0)).setContentIntent(open).setAutoCancel(true).build();
        try {manager.notify(1600,notification);prefs.edit().putString("notified",version).apply();}catch(SecurityException ignored){}
    }
    void close(){closed=true;main.removeCallbacksAndMessages(null);}
}
