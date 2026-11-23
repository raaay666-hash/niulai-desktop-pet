package art.niulai.android;
import android.app.*;
import android.appwidget.AppWidgetManager;
import android.content.*;
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
    private static final String OPEN_FROM_COVER = "art.niulai.OPEN_FROM_COVER";
    static final String OPEN_WIDGET_STOCK = "art.niulai.OPEN_WIDGET_STOCK";
    private static final int REQUEST_NOTIFICATIONS = 77;
    private static final String NOTIFICATION_PROMPTED = "system_notification_prompted";
    private WebView web;
    private FoldFeatures foldFeatures;
    private String lastFoldLayout = "";
    private QuoteGateway gateway;
    private UpdateChecker updates;
    private Feedback feedback;
    void showFeedback() { feedback.show(); }
    private boolean nativeUpdateRequested;
    private void publishUpdate(){
        js("window.__niulaiUpdate && window.__niulaiUpdate("+updates.status()+")");
        if(nativeUpdateRequested)try{JSONObject info=new JSONObject(updates.status());if(!info.optBoolean("checking")){
            nativeUpdateRequested=false;
            new AlertDialog.Builder(this).setTitle(info.optBoolean("available")?"新版本 "+info.optString("version"):"版本更新")
                .setMessage(info.has("error")?info.optString("error"):info.optBoolean("available")?info.optJSONArray("notes").join("\n").replace("\"",""):"当前已是最新版本 "+info.optString("current"))
                .setPositiveButton("查看官网",(d,w)->startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(UpdateChecker.DOWNLOAD)))).setNegativeButton("关闭",null).show();
        }}catch(Exception ignored){}
    }
    void checkUpdatesNative(){nativeUpdateRequested=true;updates.check(true);}
    String appVersion() { return updates.current(); }
    void updatePermission() { requestAlertSettings(AlertChannel.UPDATES); }

    private boolean requestNotificationPermission(boolean automatic) {
        if (requestingNotifications) return true;
        if (AlertChannel.hasPermission(this)) return false;
        String permission = android.Manifest.permission.POST_NOTIFICATIONS;
        SharedPreferences prefs = PetConfig.prefs(this);
        boolean prompted = prefs.getBoolean(NOTIFICATION_PROMPTED, false);
        boolean canAskAgain = shouldShowRequestPermissionRationale(permission);
        if (automatic ? prompted || canAskAgain : prompted && !canAskAgain) return false;
        prefs.edit().putBoolean(NOTIFICATION_PROMPTED, true).apply();
        requestingNotifications = true;
        requestPermissions(new String[]{permission}, REQUEST_NOTIFICATIONS);
        return true;
    }

    private void requestAlertSettings(AlertChannel alert) {
        if (!requestNotificationPermission(false)) openNotificationSettings(alert);
    }

    private void openNotificationSettings(AlertChannel alert) {
        NotificationChannel channel = AlertChannel.appEnabled(this) ? alert.get(this) : null;
        Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
        if (channel != null) {
            intent.setAction(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS);
            intent.putExtra(Settings.EXTRA_CHANNEL_ID, channel.getId());
        }
        try { startActivity(intent.putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName())); }
        catch (RuntimeException error) { supportSettingsNative("app"); }
    }

    @Override public void onWindowFocusChanged(boolean focused) {
        super.onWindowFocusChanged(focused);
        if (!focused || coverMode() || updates == null || isFinishing() || AlertChannel.hasPermission(this)) return;
        JSONObject news = AppState.load(this).optJSONObject("news");
        if (updates.enabled() || (news != null && news.optBoolean("notifications"))) {
            requestNotificationPermission(true);
        }
    }

    private void refreshNotificationState() {
        updates.refreshNotification();
        publishUpdate();
        js("window.__niulaiNotificationsChanged && window.__niulaiNotificationsChanged()");
    }
    private CompatPanel panel;private int webMajor;private boolean receiverRegistered;
    private FrameLayout host;
    private int background=Color.rgb(244,243,238);
    private final Handler main=new Handler(Looper.getMainLooper());
    private boolean pendingPet = false;
    private boolean requestingNotifications, launchPetAfterPermission, testNewsAfterPermission;
    private String requestedFeature = "pet";
    private final BroadcastReceiver petChanged = new BroadcastReceiver() {
        @Override public void onReceive(Context c, Intent i) {
            if (i.getBooleanExtra(PetService.ISLAND_STATUS_ONLY, false)) notifyIslandState();
            else notifyPetState();
        }
    };
    protected boolean coverMode() { return false; }
    private void js(String script) { runOnUiThread(() -> { if (web != null && !isFinishing()) web.evaluateJavascript(script, null); }); }
    private void notifyIslandState() { js("window.__niulaiIslandChanged && window.__niulaiIslandChanged()"); }
    private void notifyPetState() {
        if (panel != null) panel.updatePetState();
        else js("window.__niulaiPetChanged && window.__niulaiPetChanged();window.__niulaiSettingsChanged && window.__niulaiSettingsChanged();window.__niulaiIslandChanged && window.__niulaiIslandChanged()");
    }
    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        selectWidgetStock(getIntent());
        updates = new UpdateChecker(this, this::publishUpdate);
        feedback = new Feedback(this);
        if(Build.VERSION.SDK_INT>=30)getWindow().setDecorFitsSystemWindows(false);
        if (coverMode()) applyAppearance(true);
        int surface = background;
        getWindow().setStatusBarColor(surface); getWindow().setNavigationBarColor(surface);
        if (!coverMode()) getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        if (Build.VERSION.SDK_INT >= 28) { WindowManager.LayoutParams p = getWindow().getAttributes(); p.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_NEVER; getWindow().setAttributes(p); }
        if (saved != null) {
            pendingPet = saved.getBoolean("pendingPet");
            requestedFeature = saved.getString("feature", "pet");
            requestingNotifications = saved.getBoolean("requestingNotifications");
            launchPetAfterPermission = saved.getBoolean("launchPetAfterPermission");
            testNewsAfterPermission = saved.getBoolean("testNewsAfterPermission");
        }
        try{
            if(coverMode() || !PetConfig.prefs(this).getBoolean("force_native",false)){
                web=new WebView(this);webMajor=AndroidCompat.webMajor(web.getSettings().getUserAgentString());
                if(webMajor<58){web.destroy();web=null;}
                // Older Chromium compositors can leave black tiles around fixed/animated layers.
                else if(webMajor<80)web.setLayerType(View.LAYER_TYPE_SOFTWARE,null);
            }
        }catch(Exception|LinkageError e){android.util.Log.w("NiulaiCompat","Using native compatibility screen",e);web=null;}
        if(web!=null){web.setBackgroundColor(surface);LocalAssets.configure(web);web.setWebViewClient(new LocalAssets(this){
            @Override public void onPageFinished(WebView view,String url){
                lastFoldLayout = "";
                publishFoldLayout();
                main.postDelayed(()->{if(web==view&&!isFinishing())view.evaluateJavascript("window.__niulaiReady === true",ready->{if(web!=view)return;if(!"true".equals(ready))showCompatibilityUI();else android.util.Log.i("NiulaiCompat","web_ready;chrome="+webMajor);});},1500);
            }
            @Override public boolean onRenderProcessGone(WebView view,RenderProcessGoneDetail detail){if(web==view)showCompatibilityUI();return true;}
        });gateway=new QuoteGateway(script->js(script));web.addJavascriptInterface(new MarketBridge(),"NiulaiNative");installContent(web);
            foldFeatures = new FoldFeatures(this, this::publishFoldLayout);
            web.addOnLayoutChangeListener((view, l, t, r, b, oldL, oldT, oldR, oldB) -> publishFoldLayout());
        }
        else showCompatibilityUI();
        if (Build.VERSION.SDK_INT >= 33) getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, () -> handleBack());
        IntentFilter f = new IntentFilter(PetService.CHANGED);AndroidCompat.receiver(this,petChanged,f);receiverRegistered=true;
        if(web!=null)web.loadUrl(LocalAssets.ORIGIN + "/index.html" + (coverMode() ? "#cover" : ""));
    }
    private void installContent(View child){
        host=new FrameLayout(this);host.setBackgroundColor(background);host.addView(child,new FrameLayout.LayoutParams(-1,-1));setContentView(host);
        host.setOnApplyWindowInsetsListener((v,insets)->{
            if (Build.VERSION.SDK_INT < 30) return insets;
            int types = WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime();
            android.graphics.Insets safe = insets.getInsets(types);
            FrameLayout.LayoutParams params = (FrameLayout.LayoutParams) child.getLayoutParams();
            if (params.leftMargin != safe.left || params.topMargin != safe.top
                    || params.rightMargin != safe.right || params.bottomMargin != safe.bottom) {
                params.setMargins(safe.left, safe.top, safe.right, safe.bottom);
                child.setLayoutParams(params);
            }
            return new WindowInsets.Builder(insets).setInsets(types, android.graphics.Insets.NONE).build();
        });host.requestApplyInsets();
    }
    private void publishFoldLayout() {
        if (web == null || foldFeatures == null || web.getWidth() < 1) return;
        String layout = foldFeatures.inView(web);
        if (lastFoldLayout.equals(layout)) return;
        lastFoldLayout = layout;
        js("window.__niulaiFolds && window.__niulaiFolds(" + layout + ")");
    }
    private void openMainFromCover() {
        if (!coverMode()) return;
        startActivity(new Intent(this, MainActivity.class).setAction(OPEN_FROM_COVER).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        finish();
    }
    private void showCompatibilityUI(){
        android.util.Log.i("NiulaiCompat","native_ui");
        if(panel!=null)return;if(web!=null){web.removeJavascriptInterface("NiulaiNative");if(web.getParent() instanceof android.view.ViewGroup)((android.view.ViewGroup)web.getParent()).removeView(web);web.destroy();web=null;}if(gateway!=null){gateway.close();gateway=null;}
        if (coverMode()) {
            android.widget.Button open = new android.widget.Button(this);
            open.setText("打开牛来盯盘");
            open.setOnClickListener(view -> openMainFromCover());
            installContent(open);
        } else {
            panel=new CompatPanel(this);installContent(panel);panel.resume();
        }
    }
    void startPetWithPermission() { requestFeature("pet"); }
    void setOverlayEnabledNative(String feature, boolean enabled) {
        boolean island = "island".equals(feature);
        if (enabled) requestFeature(island ? "island" : "pet");
        else {
            if (requestedFeature.equals(island ? "island" : "pet")) {
                pendingPet = false;
                launchPetAfterPermission = false;
            }
            AppState.feature(this, island ? "islandEnabled" : "petEnabled", false);
            if (PetService.running) startService(new Intent(this, PetService.class).setAction(island ? PetService.CLOSE_ISLAND : PetService.CLOSE_PET));
            notifyPetState();
        }
    }
    private void requestFeature(String feature) {
        requestedFeature="island".equals(feature)?"island":"pet";
        boolean systemIsland = requestedFeature.equals("island") && SystemIsland.use(this, AppState.load(this));
        if (!systemIsland && !AndroidCompat.overlays(this)) {
            pendingPet = true;
            try { startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,Uri.parse("package:"+getPackageName()))); }
            catch (Exception e) { pendingPet=false; Toast.makeText(this,"请在应用设置中允许牛来显示悬浮窗",Toast.LENGTH_LONG).show(); }
            return;
        }
        pendingPet=false;
        if (requestNotificationPermission(false)) {
            launchPetAfterPermission = true;
            return;
        }
        launchPet();
    }
    private void launchPet() {
        boolean island = requestedFeature.equals("island");
        String key = island ? "islandEnabled" : "petEnabled";
        try {
            AppState.feature(this, key, true);
            AndroidCompat.startPet(this);
        } catch (RuntimeException error) {
            AppState.feature(this, key, island ? PetService.islandShowing || PetService.systemIslandActive : PetService.petShowing);
            Toast.makeText(this, (island ? "灵动岛" : "桌宠") + "未能启动，请检查权限后重试", Toast.LENGTH_LONG).show();
        }
        notifyPetState();
    }

    private void openIslandNotificationSettings() {
        if (!AlertChannel.hasPermission(this) && requestNotificationPermission(false)) return;
        Intent settings = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName());
        if (AlertChannel.appEnabled(this)) {
            NotificationChannel channel = getSystemService(NotificationManager.class).getNotificationChannel(SystemIsland.CHANNEL);
            if (channel != null && channel.getImportance() == NotificationManager.IMPORTANCE_NONE) {
                settings = new Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS)
                    .putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName()).putExtra(Settings.EXTRA_CHANNEL_ID, SystemIsland.CHANNEL);
            } else if (Build.VERSION.SDK_INT >= 36) {
                Intent promotion = new Intent("android.settings.APP_NOTIFICATION_PROMOTION_SETTINGS")
                    .putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName());
                if (promotion.resolveActivity(getPackageManager()) != null) settings = promotion;
            }
        }
        try { startActivity(settings); } catch (RuntimeException error) { supportSettingsNative("app"); }
    }
    @Override public void onRequestPermissionsResult(int code,String[] permissions,int[] grants) {
        super.onRequestPermissionsResult(code,permissions,grants);
        if (code != REQUEST_NOTIFICATIONS) return;
        requestingNotifications = false;
        if (launchPetAfterPermission) {
            launchPetAfterPermission = false;
            boolean systemIsland = requestedFeature.equals("island") && SystemIsland.use(this, AppState.load(this));
            if (systemIsland || Settings.canDrawOverlays(this)) launchPet();
        }
        if (testNewsAfterPermission) {
            testNewsAfterPermission = false;
            if (AlertChannel.NEWS.enabled(this)) sendNewsTest();
            else Toast.makeText(this, "请在通知设置中允许新闻通知", Toast.LENGTH_SHORT).show();
        }
        refreshNotificationState();
    }
    public class MarketBridge {
        @JavascriptInterface public String updateStatus(){return updates.status();}
        @JavascriptInterface public void checkUpdates(){runOnUiThread(()->updates.check(true));}
        @JavascriptInterface public void updateNotifications(boolean enabled){runOnUiThread(()->{
            updates.enabled(enabled);
            if (enabled && !AlertChannel.UPDATES.enabled(MainActivity.this)) updatePermission();
            refreshNotificationState();
        });}
        @JavascriptInterface public void updatePermission(){runOnUiThread(()->MainActivity.this.updatePermission());}
        @JavascriptInterface public boolean newsPermission(){return AlertChannel.NEWS.enabled(MainActivity.this);}
        @JavascriptInterface public void newsSettings(){runOnUiThread(()->requestAlertSettings(AlertChannel.NEWS));}
        @JavascriptInterface public void testNewsNotification(){runOnUiThread(()->{
            if (AlertChannel.NEWS.enabled(MainActivity.this)) sendNewsTest();
            else if (requestNotificationPermission(false)) testNewsAfterPermission = true;
            else openNotificationSettings(AlertChannel.NEWS);
        });}
        @JavascriptInterface public boolean showStockNews(String code, String title, String text){return postNews(code,title,text);}
        @JavascriptInterface public String newsTarget(){
            Intent current = getIntent();
            String code = current == null ? null : current.getStringExtra("news_stock");
            if (current != null) current.removeExtra("news_stock");
            return code != null && NativeMarket.valid(code) ? code : "";
        }
        @JavascriptInterface public boolean openNewsArticle(String value){
            if(value==null||value.length()>4000)return false;
            try {
                java.net.URI link=java.net.URI.create(value);
                String host=link.getHost();
                if(!"https".equals(link.getScheme())||link.getUserInfo()!=null||link.getPort()!=-1||host==null
                    ||!host.matches("(?i).+\\.(?:[a-z]{2,}|xn--[a-z0-9-]+)")||host.matches("(?i).+\\.(?:local|localhost|internal|test|invalid)"))return false;
                runOnUiThread(()->{
                    try {startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(value)).addCategory(Intent.CATEGORY_BROWSABLE));}
                    catch(ActivityNotFoundException error){Toast.makeText(MainActivity.this,"请先安装浏览器",Toast.LENGTH_SHORT).show();}
                });
                return true;
            } catch(IllegalArgumentException error){return false;}
        }
        @JavascriptInterface public void openUpdates(boolean history){runOnUiThread(()->startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(history?UpdateChecker.SITE+"/download/updates/":UpdateChecker.DOWNLOAD))));}
        @JavascriptInterface public void request(String id,String kind,String value) {
            if (id == null || !id.matches("[0-9]{1,10}")) return;
            if ("feedback".equals(kind)) runOnUiThread(() -> feedback.submit(value, (receipt, error) -> js("window.__niulaiResult(" + JSONObject.quote(id) + "," + (receipt == null ? "null" : JSONObject.quote(receipt)) + "," + (error == null ? "null" : JSONObject.quote(error)) + ")")));
            else if(gateway!=null)gateway.request(id,kind,value);
        }
        @JavascriptInterface public String restoreAppState(){return AppState.existing(MainActivity.this);}
        @JavascriptInterface public String coverQuote(String code){
            return NativeMarket.valid(code)?PetConfig.snapshot(MainActivity.this,code).toString():"{}";
        }
        @JavascriptInterface public boolean selectCoverStock(String code){return coverMode()&&AppState.select(MainActivity.this,code);}
        @JavascriptInterface public void openMain(){runOnUiThread(()->openMainFromCover());}
        @JavascriptInterface public void storeAppState(String raw){AppState.save(MainActivity.this,raw);}
        @JavascriptInterface public void compatibilityUI(){runOnUiThread(()->{PetConfig.prefs(MainActivity.this).edit().putBoolean("force_native",true).apply();showCompatibilityUI();});}
        @JavascriptInterface public void haptic() { Vibrator v=(Vibrator)getSystemService(VIBRATOR_SERVICE); if(v!=null && v.hasVibrator()) v.vibrate(VibrationEffect.createOneShot(18,VibrationEffect.DEFAULT_AMPLITUDE)); }
        @JavascriptInterface public void appearance(boolean dark) {runOnUiThread(()->applyAppearance(dark));}
        @JavascriptInterface public void configurePet(String raw) { if(PetConfig.configure(MainActivity.this,raw)) runOnUiThread(()->{ if(PetService.running) startService(new Intent(MainActivity.this,PetService.class).setAction(PetService.CONFIG)); StackWidgetProvider.refreshAll(MainActivity.this); }); }
        @JavascriptInterface public void publishQuote(String raw) { PetConfig.cache(MainActivity.this,raw); }
        @JavascriptInterface public void publishWatchQuotes(String raw){PetConfig.cacheWatch(MainActivity.this,raw);}
        @JavascriptInterface public String petStatus() { return PetService.petShowing?"running":Settings.canDrawOverlays(MainActivity.this)?"ready":"permission"; }
        @JavascriptInterface public void startPet() { runOnUiThread(()->startPetWithPermission()); }
        @JavascriptInterface public void previewPet(String id){runOnUiThread(()->{if(PetService.running)startService(new Intent(MainActivity.this,PetService.class).setAction("art.niulai.PREVIEW").putExtra("motion",id));else Toast.makeText(MainActivity.this,"请先开启桌宠",Toast.LENGTH_SHORT).show();});}
        @JavascriptInterface public void stopPet() { setOverlayEnabled("pet",false); }
        @JavascriptInterface public void setOverlayEnabled(String feature,boolean enabled){runOnUiThread(()->setOverlayEnabledNative(feature,enabled));}
        @JavascriptInterface public boolean systemDark(){return Appearance.systemDark(MainActivity.this);}
        @JavascriptInterface public boolean cameraInteractionReady(){return FrontCameraService.connected != null;}
        @JavascriptInterface public String islandStatus(){return SystemIsland.status(MainActivity.this).toString();}
        @JavascriptInterface public void islandOverlaySettings(){runOnUiThread(()->{
            try { startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getPackageName()))); }
            catch (RuntimeException error) { supportSettingsNative("app"); }
        });}
        @JavascriptInterface public void islandSettings(){runOnUiThread(MainActivity.this::openIslandNotificationSettings);}
        @JavascriptInterface public void cameraInteractionSettings(){runOnUiThread(()->{
            try { Intent settings = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS); startActivity(settings); }
            catch (RuntimeException error) { Toast.makeText(MainActivity.this,"请在系统无障碍设置中开启牛来前摄交互",Toast.LENGTH_LONG).show(); }
        });}
        @JavascriptInterface public String muyuCounts(){return MuyuStore.read(MainActivity.this).toString();}
        @JavascriptInterface public String tapMuyu(){return MuyuStore.tap(MainActivity.this).toString();}
        @JavascriptInterface public String newMuyuRound(){return MuyuStore.newRound(MainActivity.this).toString();}
        @JavascriptInterface public void previewIsland(){runOnUiThread(()->{if(PetService.islandShowing || PetService.systemIslandActive)startService(new Intent(MainActivity.this,PetService.class).setAction("art.niulai.ISLAND_PREVIEW"));else Toast.makeText(MainActivity.this,"请先开启灵动岛",Toast.LENGTH_SHORT).show();});}
        @JavascriptInterface public void goHome() { runOnUiThread(()->startActivity(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK))); }
        @JavascriptInterface public void pinWidget() {runOnUiThread(()->pinWidgetNative());}
        @JavascriptInterface public String deviceInfo() { try { JSONObject o=new JSONObject(); o.put("brand",Build.MANUFACTURER); o.put("model",Build.MODEL); o.put("sdk",Build.VERSION.SDK_INT);o.put("android",Build.VERSION.RELEASE); o.put("overlay",Settings.canDrawOverlays(MainActivity.this)); return o.toString(); }catch(Exception e){return "{}";} }
        @JavascriptInterface public void supportSettings(String kind) {runOnUiThread(()->supportSettingsNative(kind));}
    }
    private void sendNewsTest() {
        boolean sent = postNews("", "牛来盯盘 · 新闻通知", "关注的股票出现新消息时会在这里提醒。");
        Toast.makeText(this, sent ? "已发送测试通知" : "请在通知设置中允许新闻通知", Toast.LENGTH_SHORT).show();
    }
    private boolean postNews(String code, String title, String text){
        if(code==null||!code.isEmpty()&&!NativeMarket.valid(code)||title==null||text==null||!AlertChannel.NEWS.enabled(this))return false;
        NotificationManager manager=getSystemService(NotificationManager.class);
        NotificationChannel channel = AlertChannel.NEWS.get(this);
        if (channel == null) return false;
        Intent target=new Intent(this,MainActivity.class).putExtra("news_stock",code).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int id=0x4e000000 | (code.hashCode()&0xffffff);
        PendingIntent content=PendingIntent.getActivity(this,id,target,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        String headline=text.substring(0,Math.min(320,text.length()));
        int icon=getResources().getIdentifier("pet_notification","drawable",getPackageName());
        Notification notification=new Notification.Builder(this,channel.getId()).setSmallIcon(icon)
            .setContentTitle(title.substring(0,Math.min(100,title.length()))).setContentText(headline)
            .setStyle(new Notification.BigTextStyle().bigText(headline)).setContentIntent(content).setAutoCancel(true).build();
        try {manager.notify(id,notification);return true;} catch(SecurityException error){return false;}
    }
    void goHomeNative(){startActivity(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK));}
    void applyAppearance(boolean dark) {
        if (coverMode()) dark = true;
        background = dark ? 0xff141b18 : 0xfff4f3ee;
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
    @Override protected void onResume() {
        super.onResume();
        if (updates != null) {
            updates.check(false);
            refreshNotificationState();
        }
        JSONObject resumeState = AppState.load(this);
        PetService.appVisible = true;
        if (!pendingPet && !PetService.running
                && (AndroidCompat.overlays(this) || resumeState.optBoolean("islandEnabled") && SystemIsland.use(this, resumeState))
                && (resumeState.optBoolean("petEnabled") || resumeState.optBoolean("islandEnabled"))) {
            try { AndroidCompat.startPet(this); }
            catch (RuntimeException error) { android.util.Log.w("NiulaiPet", "Cannot restore floating features", error); }
        }
        sendBroadcast(new Intent(PetService.APP_VISIBLE).setPackage(getPackageName()));
        StackWidgetProvider.refreshAll(this);
        js("window.__niulaiSystemTheme && window.__niulaiSystemTheme()");
        if (panel != null) panel.resume();
        if (gateway != null) gateway.setActive(true);
        if (web != null) {
            web.onResume();
            js("window.__niulaiLifecycle && window.__niulaiLifecycle(true)");
        }
        notifyPetState();
        if (pendingPet) {
            pendingPet = false;
            if (AndroidCompat.overlays(this)) requestFeature(requestedFeature);
            else {
                AppState.feature(this, requestedFeature.equals("island") ? "islandEnabled" : "petEnabled", false);
                notifyPetState();
            }
        }
    }
    private boolean selectWidgetStock(Intent intent){
        return intent!=null&&OPEN_WIDGET_STOCK.equals(intent.getAction())&&AppState.select(this,intent.getStringExtra("widget_stock"));
    }
    @Override protected void onNewIntent(Intent intent){
        super.onNewIntent(intent);setIntent(intent);
        if(selectWidgetStock(intent)||OPEN_FROM_COVER.equals(intent.getAction()))js("window.__niulaiOpenMain && window.__niulaiOpenMain()");
        js("if(window.__niulaiNewsTarget) window.__niulaiNewsTarget(window.NiulaiNative.newsTarget())");
        if(pendingPet&&AndroidCompat.overlays(this)){pendingPet=false;requestFeature(requestedFeature);}
    }
    @Override protected void onPause() {PetService.appVisible=false;sendBroadcast(new Intent(PetService.APP_VISIBLE).setPackage(getPackageName()));if(panel!=null)panel.pause();if(gateway!=null)gateway.setActive(false);if(web!=null){js("window.__niulaiLifecycle && window.__niulaiLifecycle(false)");web.onPause();}super.onPause(); }
    @Override public void onConfigurationChanged(android.content.res.Configuration configuration){super.onConfigurationChanged(configuration);JSONObject state=AppState.load(this);applyAppearance(Appearance.dark(this,state.optString("theme","system")));if(panel!=null)panel.refreshAppearance();js("window.__niulaiSystemTheme && window.__niulaiSystemTheme()");StackWidgetProvider.refreshAll(this);}
    @Override public void onBackPressed(){handleBack();}
    private void handleBack(){if(web==null){moveTaskToBack(true);return;}web.evaluateJavascript("window.__niulaiBack && window.__niulaiBack()",value->{if(!"true".equals(value))moveTaskToBack(true);});}
    @Override protected void onSaveInstanceState(Bundle out) {
        out.putBoolean("pendingPet", pendingPet);
        out.putString("feature", requestedFeature);
        out.putBoolean("requestingNotifications", requestingNotifications);
        out.putBoolean("launchPetAfterPermission", launchPetAfterPermission);
        out.putBoolean("testNewsAfterPermission", testNewsAfterPermission);
        super.onSaveInstanceState(out);
    }
    @Override protected void onDestroy(){main.removeCallbacksAndMessages(null);if(foldFeatures!=null)foldFeatures.close();if(updates!=null)updates.close();if(feedback!=null)feedback.close();if(receiverRegistered)unregisterReceiver(petChanged);if(panel!=null)panel.close();if(gateway!=null)gateway.close();if(web!=null){web.removeJavascriptInterface("NiulaiNative");web.destroy();web=null;}super.onDestroy();}
}
