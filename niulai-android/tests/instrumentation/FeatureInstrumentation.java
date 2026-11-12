package art.niulai.qa;

import android.app.Instrumentation;
import android.content.*;
import android.os.*;
import android.webkit.WebView;

/** Installed only on the dedicated QA device, signed with the target application's test distribution key. */
public class FeatureInstrumentation extends Instrumentation {
    @Override public void onCreate(Bundle arguments) { super.onCreate(arguments); start(); }

    @Override public void onStart() {
        runOnMainSync(() -> WebView.setWebContentsDebuggingEnabled(true));
        BroadcastReceiver done = new BroadcastReceiver() {
            @Override public void onReceive(Context context, Intent intent) {
                WebView.setWebContentsDebuggingEnabled(false);
                context.unregisterReceiver(this);
                finish(-1, new Bundle());
            }
        };
        IntentFilter filter = new IntentFilter("art.niulai.qa.DONE");
        if (Build.VERSION.SDK_INT >= 33) getTargetContext().registerReceiver(done, filter, Context.RECEIVER_EXPORTED);
        else getTargetContext().registerReceiver(done, filter);
        Intent launch = getTargetContext().getPackageManager().getLaunchIntentForPackage("art.niulai.android");
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        startActivitySync(launch);
    }
}
