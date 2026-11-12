package art.niulai.android;
import android.app.Application;
import android.content.*;
import android.content.res.Configuration;
public class NiulaiApplication extends Application {
    @Override public void onCreate(){super.onCreate();IntentFilter filter=new IntentFilter();filter.addAction(Intent.ACTION_DATE_CHANGED);filter.addAction(Intent.ACTION_TIMEZONE_CHANGED);AndroidCompat.receiver(this,new BroadcastReceiver(){@Override public void onReceive(Context context,Intent intent){MuyuStore.read(context);context.sendBroadcast(new Intent(MuyuStore.CHANGED).setPackage(context.getPackageName()));StackWidgetProvider.refreshAll(context);}},filter);}
    @Override public void onConfigurationChanged(Configuration configuration){super.onConfigurationChanged(configuration);StackWidgetProvider.refreshAll(this);}
}
