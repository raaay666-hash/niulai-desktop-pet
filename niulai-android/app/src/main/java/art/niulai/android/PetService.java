package art.niulai.android;

import android.app.*;
import android.content.*;
import android.content.pm.ServiceInfo;
import android.content.res.Configuration;
import android.graphics.*;
import android.os.*;
import android.view.*;
import android.widget.FrameLayout;
import org.json.*;

/** One user-started foreground service owns the independently selectable floating surfaces. */
public class PetService extends Service {
    static final String CONFIG = "art.niulai.CONFIG", CHANGED = "art.niulai.PET_CHANGED", STOP = "art.niulai.STOP";
    static final String APP_VISIBLE = "art.niulai.APP_VISIBLE", CLOSE_PET = "art.niulai.CLOSE_PET", CLOSE_ISLAND = "art.niulai.CLOSE_ISLAND";
    public static volatile boolean running, petShowing, islandShowing, appVisible;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private WindowManager wm;
    private WindowManager islandWm;
    private FrontCameraService cameraHost;
    private View cameraBridge, cutoutProbe;
    private WindowManager.LayoutParams bridgeParams;
    private boolean bridgeShowing;
    private DisplayCutout detectedCutout;
    private IslandGeometry.Layout islandLayout;
    private NativePetView pet;
    private DragFrame root;
    private NativeIslandView island;
    private WindowManager.LayoutParams petParams, islandParams;
    private NativeQuoteFeed feed, islandFeed;
    private NativeMarket.Quote primaryQuote, secondaryQuote;
    private String primaryError, secondaryError;
    private JSONObject config = new JSONObject();
    private String symbol = "s_sh000001", islandSymbol = "s_sh000001";
    private boolean collapsed, receiverRegistered;
    private long previewUntil;
    private MuyuSound woodSound;
    private android.animation.ValueAnimator islandAnimator;
    private final Runnable endPreview = this::syncVisibility;
    private final Runnable collapseIsland = () -> {
        if (island != null && island.expanded() && config.optBoolean("islandAutoCollapse", true)) toggleIsland();
    };
    private final BroadcastReceiver receiver = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            String action = intent.getAction();
            if (MuyuStore.CHANGED.equals(action)) {
                pet.countsChanged();
                island.countsChanged();
            } else if (Intent.ACTION_CONFIGURATION_CHANGED.equals(action)) {
                configure();
                StackWidgetProvider.refreshAll(PetService.this);
            } else syncVisibility();
        }
    };

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }

    @Override public void onCreate() {
        super.onCreate();
        Notification notification = AndroidCompat.notification(this);
        if (Build.VERSION.SDK_INT >= 34) startForeground(100, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        else startForeground(100, notification);
        if (!AndroidCompat.overlays(this)) { stopSelf(); return; }
        running = true;
        wm = (WindowManager)getSystemService(WINDOW_SERVICE);
        islandWm = wm;
        if (Build.VERSION.SDK_INT >= 28 && Build.VERSION.SDK_INT < 30) {
            cutoutProbe = new View(this);
            WindowManager.LayoutParams probe = parameters(-1, -1, "Niulai Camera Geometry");
            probe.flags |= WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS;
            probe.alpha = 0;
            probe.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            cutoutProbe.setOnApplyWindowInsetsListener((view, insets) -> {
                DisplayCutout next = insets.getDisplayCutout();
                if (!java.util.Objects.equals(next, detectedCutout)) {
                    detectedCutout = next;
                    handler.post(() -> { if (island != null) { placeIsland(); updateWindows(); } });
                }
                return insets;
            });
            wm.addView(cutoutProbe, probe);
        }
        woodSound = new MuyuSound(this);
        root = new DragFrame();
        pet = new NativePetView(this, new NativePetView.Actions() {
            public void open() { openApp(); }
            public void collapse() { togglePet(); }
            public void stop() { closeFeature("petEnabled"); }
        });
        root.addView(pet, new FrameLayout.LayoutParams(-1, -1));
        collapsed = PetConfig.prefs(this).getBoolean("collapsed", false);
        pet.collapsed(collapsed);
        petParams = parameters(pet.desiredWidth(), pet.desiredHeight(), "Niulai 2D Pet");
        petParams.x = PetConfig.prefs(this).getInt("x", 0);
        petParams.y = PetConfig.prefs(this).getInt("y", dp(180));
        island = new NativeIslandView(this, new NativeIslandView.Actions() {
            public void expand() { toggleIsland(); }
            public void open() { openApp(); }
            public void previous() { selectIsland(-1); }
            public void next() { selectIsland(1); }
            public void close() { closeFeature("islandEnabled"); }
            public void knock() { knockIsland(); }
        });
        islandParams = parameters(island.desiredWidth(), island.desiredHeight(), "Niulai Quote Island");
        feed = new NativeQuoteFeed((quote, error) -> {
            primaryQuote = quote;
            primaryError = error;
            pet.update(quote, error);
            if (islandSymbol.equals(symbol)) island.update(quote, error);
            if (quote != null && error == null) PetConfig.cache(this, NativeQuoteFeed.json(quote));
        });
        islandFeed = new NativeQuoteFeed((quote, error) -> {
            secondaryQuote = quote;
            secondaryError = error;
            island.update(quote, error);
        });
        IntentFilter filter = new IntentFilter();
        for (String action : new String[]{Intent.ACTION_SCREEN_OFF, Intent.ACTION_SCREEN_ON, Intent.ACTION_USER_PRESENT,
                Intent.ACTION_CONFIGURATION_CHANGED, APP_VISIBLE, MuyuStore.CHANGED}) filter.addAction(action);
        AndroidCompat.receiver(this, receiver, filter);
        receiverRegistered = true;
        configure();
    }

    private WindowManager.LayoutParams parameters(int width, int height, String title) {
        WindowManager.LayoutParams params = new WindowManager.LayoutParams(width, height, AndroidCompat.overlayType(),
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL | WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED, PixelFormat.TRANSLUCENT);
        params.gravity = Gravity.TOP | Gravity.LEFT;
        params.setTitle(title);
        if (Build.VERSION.SDK_INT >= 28) params.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_NEVER;
        return params;
    }

    private void configure() {
        if (feed == null) return;
        try {
            JSONObject state = AppState.load(this);
            JSONArray stocks = state.getJSONArray("stocks");
            JSONObject stock = stocks.getJSONObject(0);
            for (int i = 0; i < stocks.length(); i++) if (stocks.getJSONObject(i).getString("code").equals(state.optString("selected"))) stock = stocks.getJSONObject(i);
            state.put("symbol", stock.getString("code"));
            state.put("name", stock.optString("name"));
            if (!state.optBoolean("private", true)) {
                state.put("cost", stock.optDouble("cost", 0));
                state.put("shares", stock.optDouble("shares", 0));
            }
            PetConfig.configure(this, state.toString());
            config = new JSONObject(PetConfig.json(this));
            refreshIslandHost();
            String nextSymbol = config.optString("symbol", "s_sh000001");
            if (!symbol.equals(nextSymbol)) { primaryQuote = null; primaryError = null; }
            symbol = nextSymbol;
            String pinned = config.optString("islandSymbol");
            String nextIsland = NativeMarket.valid(pinned) ? pinned : symbol;
            if (!islandSymbol.equals(nextIsland)) { secondaryQuote = null; secondaryError = null; }
            islandSymbol = nextIsland;
            pet.configure(config);
            island.configure(config);
            island.update(islandSymbol.equals(symbol) ? primaryQuote : secondaryQuote,
                islandSymbol.equals(symbol) ? primaryError : secondaryError);
            feed.configure(symbol, config.optInt("interval", 10));
            islandFeed.configure(islandSymbol, config.optInt("islandInterval", 5));
            if (islandSymbol.equals(symbol) && config.optBoolean("islandEnabled"))
                feed.configure(symbol, Math.min(config.optInt("interval", 10), config.optInt("islandInterval", 5)));
            attachSurfaces();
            clampPet();
            placeIsland();
            updateWindows();
            syncVisibility();
            sendBroadcast(new Intent(CHANGED).setPackage(getPackageName()));
        } catch (Exception e) { android.util.Log.e("NiulaiPet", "Overlay configuration failed", e); }
    }

    private void attachSurfaces() {
        try {
            if (config.optBoolean("petEnabled") && !petShowing) {
                clampPet(); wm.addView(root, petParams); petShowing = true;
            } else if (!config.optBoolean("petEnabled") && petShowing) {
                wm.removeView(root); petShowing = false;
            }
            if (config.optBoolean("islandEnabled") && !islandShowing) {
                placeIsland(); updateBridge(); islandWm.addView(island, islandParams); islandShowing = true;
            } else if (!config.optBoolean("islandEnabled") && islandShowing) {
                islandWm.removeView(island); islandShowing = false; removeBridge();
            }
        } catch (RuntimeException e) { android.util.Log.w("NiulaiPet", "Floating window unavailable", e); stopSelf(); }
    }

    private Point displaySize() {
        if (Build.VERSION.SDK_INT >= 30) {
            Rect bounds = wm.getCurrentWindowMetrics().getBounds();
            return new Point(bounds.width(), bounds.height());
        }
        android.util.DisplayMetrics metrics = new android.util.DisplayMetrics();
        wm.getDefaultDisplay().getRealMetrics(metrics);
        return new Point(metrics.widthPixels, metrics.heightPixels);
    }

    private void clampPet() {
        Point size = displaySize();
        petParams.width = Math.min(pet.desiredWidth(), Math.max(dp(70), size.x - dp(8)));
        petParams.height = Math.min(pet.desiredHeight(), Math.max(dp(100), size.y - dp(8)));
        petParams.x = Math.max(0, Math.min(petParams.x, size.x - petParams.width));
        petParams.y = Math.max(dp(12), Math.min(petParams.y, size.y - petParams.height - dp(28)));
    }

    private void placeIsland() {
        Point size = displaySize();
        int statusId = getResources().getIdentifier("status_bar_height", "dimen", "android");
        int[] safe = {0, statusId > 0 ? getResources().getDimensionPixelSize(statusId) : dp(24), 0, dp(24)};
        DisplayCutout cutout = detectedCutout;
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsets insets = wm.getCurrentWindowMetrics().getWindowInsets();
            Insets bars = insets.getInsetsIgnoringVisibility(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
            safe = new int[]{bars.left, bars.top, bars.right, bars.bottom};
            cutout = insets.getDisplayCutout();
        }
        int[] hole = null;
        if (Build.VERSION.SDK_INT >= 28 && cutout != null) {
            Rect selected = null;
            for (Rect rect : cutout.getBoundingRects()) {
                if (selected == null) selected = new Rect(rect);
                else if (rect.top < safe[1] && selected.top < safe[1]) selected.union(rect);
            }
            if (selected != null) hole = new int[]{selected.left, selected.top, selected.right, selected.bottom};
        }
        String placement = config.optString("islandPlacement", "auto");
        if (placement.equals("manual")) {
            int width = dp(config.optInt("islandCameraWidth", 24)), height = dp(config.optInt("islandCameraHeight", 28));
            int cx = Math.round(size.x * config.optInt("islandCameraX", 50) / 100f), top = 0;
            hole = new int[]{Math.max(0, cx - width / 2), top, Math.min(size.x, cx + width / 2), top + height};
        }
        islandLayout = IslandGeometry.calculate(size.x, size.y, getResources().getDisplayMetrics().density, safe, hole,
            island.desiredWidth(), island.desiredHeight(), dp(config.optInt("islandOffsetX")), dp(config.optInt("islandOffsetY")), cameraHost != null && !placement.equals("below"));
        islandParams.width = islandLayout.width; islandParams.height = islandLayout.height;
        islandParams.x = islandLayout.x; islandParams.y = islandLayout.y;
        island.cameraLayout(islandLayout);
    }

    private void refreshIslandHost() {
        FrontCameraService next = config.optBoolean("islandCameraInteraction") && !config.optString("islandPlacement", "auto").equals("below") ? FrontCameraService.connected : null;
        if (next != cameraHost) {
            if (islandShowing) { islandWm.removeView(island); islandShowing = false; }
            removeBridge(); cameraHost = next;
        }
        islandWm = next == null ? wm : (WindowManager)next.getSystemService(WINDOW_SERVICE);
        islandParams.type = next == null ? AndroidCompat.overlayType() : WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY;
        islandParams.token = null;
        islandParams.flags |= WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS;
        if (Build.VERSION.SDK_INT >= 30) { islandParams.setFitInsetsTypes(0); islandParams.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS; }
        else if (Build.VERSION.SDK_INT >= 28) islandParams.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
    }

    private void removeBridge() {
        if (bridgeShowing) { try { islandWm.removeView(cameraBridge); } catch (RuntimeException ignored) { } bridgeShowing = false; }
    }

    private void updateBridge() {
        int[] bridge = islandLayout == null ? null : islandLayout.bridge;
        if (bridge == null || !config.optBoolean("islandEnabled")) { removeBridge(); return; }
        if (cameraBridge == null) {
            cameraBridge = new View(this);
            android.graphics.drawable.GradientDrawable background = new android.graphics.drawable.GradientDrawable();
            background.setColor(Color.BLACK); cameraBridge.setBackground(background);
            cameraBridge.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        }
        bridgeParams = new WindowManager.LayoutParams(); bridgeParams.copyFrom(islandParams);
        bridgeParams.width = Math.max(1, bridge[2] - bridge[0]); bridgeParams.height = Math.max(1, bridge[3] - bridge[1]);
        bridgeParams.x = bridge[0]; bridgeParams.y = bridge[1];
        ((android.graphics.drawable.GradientDrawable)cameraBridge.getBackground()).setCornerRadius(Math.min(bridgeParams.width, bridgeParams.height) / 2f);
        bridgeParams.flags |= WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE;
        bridgeParams.setTitle("Niulai Camera Join");
        if (bridgeShowing) islandWm.updateViewLayout(cameraBridge, bridgeParams);
        else {
            if (islandShowing) islandWm.removeView(island);
            islandWm.addView(cameraBridge, bridgeParams); bridgeShowing = true;
            if (islandShowing) islandWm.addView(island, islandParams);
        }
    }

    private void updateWindows() {
        if (!AndroidCompat.overlays(this)) { stopSelf(); return; }
        try {
            if (petShowing) wm.updateViewLayout(root, petParams);
            if (islandShowing) { islandWm.updateViewLayout(island, islandParams); updateBridge(); }
        } catch (RuntimeException e) { stopSelf(); }
    }

    private void syncVisibility() {
        if (feed == null) return;
        boolean screen = ((PowerManager)getSystemService(POWER_SERVICE)).isInteractive()
            && !((KeyguardManager)getSystemService(KEYGUARD_SERVICE)).isKeyguardLocked();
        boolean preview = SystemClock.uptimeMillis() < previewUntil;
        boolean petVisible = screen && petShowing && (!appVisible || !config.optBoolean("petHideInApp", true) || preview);
        boolean islandVisible = screen && islandShowing && (!appVisible || !config.optBoolean("islandHideInApp", true) || preview);
        root.setVisibility(petVisible ? View.VISIBLE : View.INVISIBLE);
        island.setVisibility(islandVisible ? View.VISIBLE : View.INVISIBLE);
        if (cameraBridge != null) cameraBridge.setVisibility(islandVisible ? View.VISIBLE : View.INVISIBLE);
        pet.active(petVisible);
        island.active(islandVisible);
        boolean petMarket = !"muyu".equals(config.optString("petMode"));
        boolean islandMarket = !"muyu".equals(config.optString("islandContent"));
        feed.setActive((petVisible && petMarket) || (islandVisible && islandMarket && islandSymbol.equals(symbol)));
        islandFeed.setActive(islandVisible && islandMarket && !islandSymbol.equals(symbol));
        if (!screen) woodSound.stop();
        android.util.Log.i("NiulaiPet", "visible=" + petVisible + ";island=" + islandVisible);
    }

    private void togglePet() {
        collapsed = !collapsed;
        pet.collapsed(collapsed);
        clampPet(); updateWindows();
        PetConfig.prefs(this).edit().putBoolean("collapsed", collapsed).apply();
    }

    private void toggleIsland() {
        if(islandAnimator!=null)islandAnimator.cancel();
        int oldWidth=islandParams.width,oldHeight=islandParams.height,oldX=islandParams.x,oldY=islandParams.y;
        island.expanded(!island.expanded());
        placeIsland();
        int targetWidth=islandParams.width,targetHeight=islandParams.height,targetX=islandParams.x,targetY=islandParams.y;
        if(config.optBoolean("islandMotion",true)&&config.optBoolean("motion",true)&&islandShowing){
            islandAnimator=android.animation.ValueAnimator.ofFloat(0,1);islandAnimator.setDuration(220);
            islandAnimator.addUpdateListener(animation->{float fraction=(float)animation.getAnimatedValue();islandParams.width=Math.round(oldWidth+(targetWidth-oldWidth)*fraction);islandParams.height=Math.round(oldHeight+(targetHeight-oldHeight)*fraction);islandParams.x=Math.round(oldX+(targetX-oldX)*fraction);islandParams.y=Math.round(oldY+(targetY-oldY)*fraction);island.cameraWindowX(islandParams.x);updateWindows();});islandAnimator.start();
        }else updateWindows();
        handler.removeCallbacks(collapseIsland);
        if (island.expanded() && config.optBoolean("islandAutoCollapse", true)) handler.postDelayed(collapseIsland, 10000);
    }

    private void selectIsland(int direction) {
        try {
            JSONObject state = AppState.load(this);
            JSONArray stocks = state.getJSONArray("stocks");
            int index = 0;
            for (int i = 0; i < stocks.length(); i++) if (stocks.getJSONObject(i).optString("code").equals(islandSymbol)) index = i;
            index = (index + direction + stocks.length()) % stocks.length();
            state.put("islandSymbol", stocks.getJSONObject(index).getString("code"));
            AppState.save(this, state.toString()); configure();
        } catch (Exception ignored) { }
    }

    private void knockIsland() {
        MuyuStore.tap(this);
        if (config.optBoolean("muyuSound")) woodSound.play();
        if (config.optBoolean("haptic", true)) AndroidCompat.vibrate(this);
        island.knocked();
    }

    private void openApp() {
        try { startActivity(new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); }
        catch (RuntimeException e) { android.util.Log.w("NiulaiPet", "Open from the notification", e); }
    }

    private void closeFeature(String key) {
        AppState.feature(this, key, false);
        configure();
        if (!petShowing && !islandShowing) stopSelf();
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? "" : intent.getAction();
        if (STOP.equals(action)) {
            AppState.feature(this, "petEnabled", false); AppState.feature(this, "islandEnabled", false); stopSelf();
        } else if (CLOSE_PET.equals(action)) closeFeature("petEnabled");
        else if (CLOSE_ISLAND.equals(action)) closeFeature("islandEnabled");
        else if ("art.niulai.PREVIEW".equals(action) && pet != null) {
            previewUntil = SystemClock.uptimeMillis() + 6000;
            pet.preview(intent.getStringExtra("motion"));
            syncVisibility(); handler.removeCallbacks(endPreview); handler.postDelayed(endPreview, 6100);
        } else {
            configure();
            if ("art.niulai.ISLAND_PREVIEW".equals(action)) {
                previewUntil = SystemClock.uptimeMillis() + 10000;
                syncVisibility(); handler.removeCallbacks(endPreview); handler.postDelayed(endPreview, 10100);
            }
        }
        return START_NOT_STICKY;
    }

    @Override public void onConfigurationChanged(Configuration configuration) {
        super.onConfigurationChanged(configuration); configure();
    }
    @Override public IBinder onBind(Intent intent) { return null; }

    private final class DragFrame extends FrameLayout {
        private float downX, downY;
        private int startX, startY;
        private boolean dragging;
        DragFrame() { super(PetService.this); }
        @Override public boolean onInterceptTouchEvent(MotionEvent event) {
            if (event.getActionMasked() == MotionEvent.ACTION_DOWN) {
                downX = event.getRawX(); downY = event.getRawY(); startX = petParams.x; startY = petParams.y; dragging = false;
            }
            if (event.getActionMasked() == MotionEvent.ACTION_MOVE && Math.hypot(event.getRawX() - downX, event.getRawY() - downY) > dp(6)) dragging = true;
            return dragging;
        }
        @Override public boolean onTouchEvent(MotionEvent event) {
            if (event.getActionMasked() == MotionEvent.ACTION_MOVE) {
                petParams.x = startX + (int)(event.getRawX() - downX); petParams.y = startY + (int)(event.getRawY() - downY);
                clampPet(); updateWindows();
            }
            if (event.getActionMasked() == MotionEvent.ACTION_UP || event.getActionMasked() == MotionEvent.ACTION_CANCEL) {
                PetConfig.prefs(PetService.this).edit().putInt("x", petParams.x).putInt("y", petParams.y).apply(); dragging = false;
            }
            return true;
        }
    }

    @Override public void onDestroy() {
        running = false;
        if(islandAnimator!=null)islandAnimator.cancel();
        handler.removeCallbacksAndMessages(null);
        if (feed != null) feed.close();
        if (islandFeed != null) islandFeed.close();
        if (pet != null) pet.close();
        if (island != null) island.close();
        if (woodSound != null) woodSound.close();
        if (receiverRegistered) unregisterReceiver(receiver);
        try { if (petShowing) wm.removeView(root); } catch (RuntimeException ignored) { }
        try { if (islandShowing) islandWm.removeView(island); } catch (RuntimeException ignored) { }
        removeBridge();
        try { if (cutoutProbe != null) wm.removeView(cutoutProbe); } catch (RuntimeException ignored) { }
        petShowing = islandShowing = false;
        stopForeground(STOP_FOREGROUND_REMOVE);
        sendBroadcast(new Intent(CHANGED).setPackage(getPackageName()));
        super.onDestroy();
    }
}
