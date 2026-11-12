package art.niulai.android;
import android.app.*;
import android.appwidget.AppWidgetManager;
import android.content.*;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.*;
import android.provider.Settings;
import android.view.*;
import android.webkit.*;
import android.widget.Toast;
import android.widget.FrameLayout;
import org.json.JSONObject;

public class MainActivity extends Activity {
    private WebView web;
    private QuoteGateway gateway;
    private CompatPanel panel;private int webMajor;private boolean receiverRegistered;
    private FrameLayout host;
    private int background=Color.rgb(245,244,240);
    private final Handler main=new Handler(Looper.getMainLooper());
    private boolean pendingPet = false;
    private String requestedFeature = "pet";
    private final BroadcastReceiver petChanged = new BroadcastReceiver() { @Override public void onReceive(Context c, Intent i) { notifyPetState(); } };
    protected boolean coverMode() { return false; }
    private void js(String script) { runOnUiThread(() -> { if (web != null && !isFinishing()) web.evaluateJavascript(script, null); }); }
    private void notifyPetState() { if(panel!=null)panel.updatePetState();else js("window.__niulaiPetChanged && window.__niulaiPetChanged();window.__niulaiSettingsChanged && window.__niulaiSettingsChanged()"); }
    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        if(Build.VERSION.SDK_INT>=30)getWindow().setDecorFitsSystemWindows(false);
        int cream = background; getWindow().setStatusBarColor(cream); getWindow().setNavigationBarColor(cream);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        if (Build.VERSION.SDK_INT >= 28) { WindowManager.LayoutParams p = getWindow().getAttributes(); p.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_NEVER; getWindow().setAttributes(p); }
        if(saved!=null){pendingPet=saved.getBoolean("pendingPet",false);requestedFeature=saved.getString("feature","pet");}
        try{
            if(!PetConfig.prefs(this).getBoolean("force_native",false)){
                web=new WebView(this);webMajor=AndroidCompat.webMajor(web.getSettings().getUserAgentString());
                if(webMajor<58){web.destroy();web=null;}
                // Older Chromium compositors can leave black tiles around fixed/animated layers.
                else if(webMajor<80)web.setLayerType(View.LAYER_TYPE_SOFTWARE,null);
            }
        }catch(Exception|LinkageError e){android.util.Log.w("NiulaiCompat","Using native compatibility screen",e);web=null;}
        if(web!=null){web.setBackgroundColor(cream);LocalAssets.configure(web);web.setWebViewClient(new LocalAssets(this){
            @Override public void onPageFinished(WebView view,String url){main.postDelayed(()->{if(web==view&&!isFinishing())view.evaluateJavascript("window.__niulaiReady === true",ready->{if(web!=view)return;if(!"true".equals(ready))showCompatibilityUI();else android.util.Log.i("NiulaiCompat","web_ready;chrome="+webMajor);});},1500);}
            @Override public boolean onRenderProcessGone(WebView view,RenderProcessGoneDetail detail){if(web==view)showCompatibilityUI();return true;}
        });gateway=new QuoteGateway(script->js(script));web.addJavascriptInterface(new MarketBridge(),"NiulaiNative");installContent(web);}
        else showCompatibilityUI();
        if (Build.VERSION.SDK_INT >= 33) getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, () -> handleBack());
        IntentFilter f = new IntentFilter(PetService.CHANGED);AndroidCompat.receiver(this,petChanged,f);receiverRegistered=true;
        if(web!=null)web.loadUrl(LocalAssets.ORIGIN + "/index.html" + (coverMode() ? "#cover" : ""));
    }
    private void installContent(View child){
        host=new FrameLayout(this);host.setBackgroundColor(background);host.addView(child,new FrameLayout.LayoutParams(-1,-1));setContentView(host);
        host.setOnApplyWindowInsetsListener((v,insets)->{
            if(Build.VERSION.SDK_INT>=30){android.graphics.Insets bars=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout()|WindowInsets.Type.ime());FrameLayout.LayoutParams p=(FrameLayout.LayoutParams)child.getLayoutParams();if(p.leftMargin!=bars.left||p.topMargin!=bars.top||p.rightMargin!=bars.right||p.bottomMargin!=bars.bottom){p.setMargins(bars.left,bars.top,bars.right,bars.bottom);child.setLayoutParams(p);}return insets;}
            return insets;
        });host.requestApplyInsets();
    }
    private void showCompatibilityUI(){
        android.util.Log.i("NiulaiCompat","native_ui");
        if(panel!=null)return;if(web!=null){web.removeJavascriptInterface("NiulaiNative");if(web.getParent() instanceof android.view.ViewGroup)((android.view.ViewGroup)web.getParent()).removeView(web);web.destroy();web=null;}if(gateway!=null){gateway.close();gateway=null;}
        panel=new CompatPanel(this);installContent(panel);panel.resume();
    }
    void startPetWithPermission() { requestFeature("pet"); }
    void setOverlayEnabledNative(String feature, boolean enabled) {
        boolean island = "island".equals(feature);
        if (enabled) requestFeature(island ? "island" : "pet");
        else {
            AppState.feature(this, island ? "islandEnabled" : "petEnabled", false);
            if (PetService.running) startService(new Intent(this, PetService.class).setAction(island ? PetService.CLOSE_ISLAND : PetService.CLOSE_PET));
            notifyPetState();
        }
    }
    private void requestFeature(String feature) {
        requestedFeature="island".equals(feature)?"island":"pet";
        if (!AndroidCompat.overlays(this)) {
            pendingPet = true;
            try { startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,Uri.parse("package:"+getPackageName()))); }
            catch (Exception e) { pendingPet=false; Toast.makeText(this,"请在应用设置中允许牛来显示悬浮窗",Toast.LENGTH_LONG).show(); }
            return;
        }
        pendingPet=false;
        if (Build.VERSION.SDK_INT>=33 && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED&&!PetConfig.prefs(this).getBoolean("notification_asked",false)) { PetConfig.prefs(this).edit().putBoolean("notification_asked",true).apply();requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS},42); return; }
        launchPet();
    }
    private void launchPet() {
        try { AppState.feature(this,requestedFeature.equals("island")?"islandEnabled":"petEnabled",true);AndroidCompat.startPet(this); notifyPetState(); }
        catch (Exception e) { Toast.makeText(this,"桌宠未能启动，请检查悬浮窗和后台运行权限",Toast.LENGTH_LONG).show(); }
    }
    @Override public void onRequestPermissionsResult(int code,String[] permissions,int[] grants) { super.onRequestPermissionsResult(code,permissions,grants); if(code==42 && Settings.canDrawOverlays(this)) launchPet(); }
    public class MarketBridge {
        @JavascriptInterface public void request(String id,String kind,String value) { if(gateway!=null)gateway.request(id,kind,value); }
        @JavascriptInterface public String restoreAppState(){return AppState.existing(MainActivity.this);}
        @JavascriptInterface public void storeAppState(String raw){AppState.save(MainActivity.this,raw);}
        @JavascriptInterface public void compatibilityUI(){runOnUiThread(()->{PetConfig.prefs(MainActivity.this).edit().putBoolean("force_native",true).apply();showCompatibilityUI();});}
        @JavascriptInterface public void haptic() { Vibrator v=(Vibrator)getSystemService(VIBRATOR_SERVICE); if(v!=null && v.hasVibrator()) v.vibrate(VibrationEffect.createOneShot(18,VibrationEffect.DEFAULT_AMPLITUDE)); }
        @JavascriptInterface public void appearance(boolean dark) {runOnUiThread(()->applyAppearance(dark));}
        @JavascriptInterface public void configurePet(String raw) { if(PetConfig.configure(MainActivity.this,raw)) runOnUiThread(()->{ if(PetService.running) startService(new Intent(MainActivity.this,PetService.class).setAction(PetService.CONFIG)); StackWidgetProvider.refreshAll(MainActivity.this); }); }
        @JavascriptInterface public void publishQuote(String raw) { PetConfig.cache(MainActivity.this,raw); }
        @JavascriptInterface public String petStatus() { return PetService.petShowing?"running":Settings.canDrawOverlays(MainActivity.this)?"ready":"permission"; }
        @JavascriptInterface public void startPet() { runOnUiThread(()->startPetWithPermission()); }
        @JavascriptInterface public void previewPet(String id){runOnUiThread(()->{if(PetService.running)startService(new Intent(MainActivity.this,PetService.class).setAction("art.niulai.PREVIEW").putExtra("motion",id));else Toast.makeText(MainActivity.this,"请先开启桌宠",Toast.LENGTH_SHORT).show();});}
        @JavascriptInterface public void stopPet() { setOverlayEnabled("pet",false); }
        @JavascriptInterface public void setOverlayEnabled(String feature,boolean enabled){runOnUiThread(()->setOverlayEnabledNative(feature,enabled));}
        @JavascriptInterface public boolean systemDark(){return Appearance.systemDark(MainActivity.this);}
        @JavascriptInterface public boolean cameraInteractionReady(){return FrontCameraService.connected != null;}
        @JavascriptInterface public void cameraInteractionSettings(){runOnUiThread(()->{
            try { Intent settings = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS); startActivity(settings); }
            catch (RuntimeException error) { Toast.makeText(MainActivity.this,"请在系统无障碍设置中开启牛来前摄交互",Toast.LENGTH_LONG).show(); }
        });}
        @JavascriptInterface public String muyuCounts(){return MuyuStore.read(MainActivity.this).toString();}
        @JavascriptInterface public String tapMuyu(){return MuyuStore.tap(MainActivity.this).toString();}
        @JavascriptInterface public String newMuyuRound(){return MuyuStore.newRound(MainActivity.this).toString();}
        @JavascriptInterface public void previewIsland(){runOnUiThread(()->{if(PetService.islandShowing)startService(new Intent(MainActivity.this,PetService.class).setAction("art.niulai.ISLAND_PREVIEW"));else Toast.makeText(MainActivity.this,"请先开启灵动岛",Toast.LENGTH_SHORT).show();});}
        @JavascriptInterface public void goHome() { runOnUiThread(()->startActivity(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK))); }
        @JavascriptInterface public void pinWidget() {runOnUiThread(()->pinWidgetNative());}
        @JavascriptInterface public String deviceInfo() { try { JSONObject o=new JSONObject(); o.put("brand",Build.MANUFACTURER); o.put("model",Build.MODEL); o.put("sdk",Build.VERSION.SDK_INT);o.put("android",Build.VERSION.RELEASE); o.put("overlay",Settings.canDrawOverlays(MainActivity.this)); return o.toString(); }catch(Exception e){return "{}";} }
        @JavascriptInterface public void supportSettings(String kind) {runOnUiThread(()->supportSettingsNative(kind));}
    }
    void goHomeNative(){startActivity(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK));}
    void applyAppearance(boolean dark) {
        background = dark ? 0xff151714 : 0xfff5f4f0;
        getWindow().setStatusBarColor(background);
        getWindow().setNavigationBarColor(background);
        if (host != null) host.setBackgroundColor(background);
        if (web != null) web.setBackgroundColor(background);
        getWindow().getDecorView().setSystemUiVisibility(dark ? 0 : View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        if (Build.VERSION.SDK_INT >= 29) getWindow().setNavigationBarContrastEnforced(false);
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController controller = getWindow().getInsetsController();
            int lightBars = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
            if (controller != null) controller.setSystemBarsAppearance(dark ? 0 : lightBars, lightBars);
        }
    }
    void pinWidgetNative(){AppWidgetManager m=getSystemService(AppWidgetManager.class);try{if(m.isRequestPinAppWidgetSupported()){m.requestPinAppWidget(new ComponentName(this,StackWidgetProvider.class),null,null);Toast.makeText(this,"请在系统弹窗中确认添加",Toast.LENGTH_LONG).show();return;}}catch(RuntimeException ignored){}Toast.makeText(this,"请长按桌面空白处，进入小组件，找到牛来盯盘",Toast.LENGTH_LONG).show();}
    void supportSettingsNative(String kind){try{startActivity("battery".equals(kind)?new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS):new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,Uri.parse("package:"+getPackageName())));}catch(Exception e){Toast.makeText(this,"请在系统设置中搜索牛来盯盘",Toast.LENGTH_LONG).show();}}
    @Override protected void onResume() { super.onResume();JSONObject resumeState=AppState.load(this);if(!pendingPet&&!PetService.running&&AndroidCompat.overlays(this)&&(resumeState.optBoolean("petEnabled")||resumeState.optBoolean("islandEnabled")))AndroidCompat.startPet(this);PetService.appVisible=true;sendBroadcast(new Intent(PetService.APP_VISIBLE).setPackage(getPackageName()));StackWidgetProvider.refreshAll(this);js("window.__niulaiSystemTheme && window.__niulaiSystemTheme()");if(panel!=null)panel.resume();if(gateway!=null) gateway.setActive(true); if(web!=null){web.onResume();js("window.__niulaiLifecycle && window.__niulaiLifecycle(true)");}notifyPetState();if(pendingPet){pendingPet=false;if(AndroidCompat.overlays(this))requestFeature(requestedFeature);else{AppState.feature(this,requestedFeature.equals("island")?"islandEnabled":"petEnabled",false);notifyPetState();}} }
    @Override protected void onNewIntent(Intent intent){super.onNewIntent(intent);setIntent(intent);if(pendingPet&&AndroidCompat.overlays(this)){pendingPet=false;requestFeature(requestedFeature);}}
    @Override protected void onPause() {PetService.appVisible=false;sendBroadcast(new Intent(PetService.APP_VISIBLE).setPackage(getPackageName()));if(panel!=null)panel.pause();if(gateway!=null)gateway.setActive(false);if(web!=null){js("window.__niulaiLifecycle && window.__niulaiLifecycle(false)");web.onPause();}super.onPause(); }
    @Override public void onConfigurationChanged(android.content.res.Configuration configuration){super.onConfigurationChanged(configuration);JSONObject state=AppState.load(this);applyAppearance(Appearance.dark(this,state.optString("theme","system")));if(panel!=null)panel.refreshAppearance();js("window.__niulaiSystemTheme && window.__niulaiSystemTheme()");StackWidgetProvider.refreshAll(this);}
    @Override public void onBackPressed(){handleBack();}
    private void handleBack(){if(web==null){moveTaskToBack(true);return;}web.evaluateJavascript("window.__niulaiBack && window.__niulaiBack()",value->{if(!"true".equals(value))moveTaskToBack(true);});}
    @Override protected void onSaveInstanceState(Bundle out){out.putBoolean("pendingPet",pendingPet);out.putString("feature",requestedFeature);super.onSaveInstanceState(out);}
    @Override protected void onDestroy(){main.removeCallbacksAndMessages(null);if(receiverRegistered)unregisterReceiver(petChanged);if(panel!=null)panel.close();if(gateway!=null)gateway.close();if(web!=null){web.removeJavascriptInterface("NiulaiNative");web.destroy();web=null;}super.onDestroy();}
}
