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
    static final String ISLAND_STATUS_ONLY = "islandStatusOnly";
    private static final long PROMOTION_GRACE_MS = 3000, PROMOTION_RECHECK_MS = 10000;
    public static volatile boolean running, petShowing, islandShowing, systemIslandActive, appVisible;
    static volatile boolean islandFallback, islandVisible, islandCheckingPromotion, islandOemRoute;
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
    private boolean systemIsland, systemIslandVisible;
    private boolean promotionEligible, promotionConfirmed, oemEligible, usingOemRoute;
    private boolean needsPromotionRecheck;
    private String islandMode = "";
    private String notificationKey = "";
    private long petPreviewUntil, islandPreviewUntil;
    private MuyuSound woodSound;
    private android.animation.ValueAnimator islandAnimator;
    private final Runnable endPetPreview = this::syncVisibility;
    private final Runnable endIslandPreview = this::syncVisibility;
    private final Runnable recoverWindows = this::syncVisibility;
    private final Runnable promotionCheck = this::checkIslandPromotion;
    private final Runnable collapseIsland = () -> {
        if (island != null && island.expanded() && config.optBoolean("islandAutoCollapse", true)) toggleIsland();
    };
    private final BroadcastReceiver receiver = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            String action = intent.getAction();
            if (MuyuStore.CHANGED.equals(action)) {
                pet.countsChanged();
                island.countsChanged();
                updateSystemNotification();
            } else if (Intent.ACTION_CONFIGURATION_CHANGED.equals(action)) {
                configure();
                StackWidgetProvider.refreshAll(PetService.this);
            } else if (APP_VISIBLE.equals(action) && appVisible) {
                configure();
            } else syncVisibility();
        }
    };

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }

    @Override public void onCreate() {
        super.onCreate();
        Notification notification = AndroidCompat.notification(this);
        if (Build.VERSION.SDK_INT >= 34) startForeground(100, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        else startForeground(100, notification);
        JSONObject initialState = AppState.load(this);
        if (!AndroidCompat.overlays(this) && !(initialState.optBoolean("islandEnabled") && SystemIsland.use(this, initialState))) { stopSelf(); return; }
        running = true;
        wm = (WindowManager)getSystemService(WINDOW_SERVICE);
        islandWm = wm;
        if (Build.VERSION.SDK_INT >= 28 && Build.VERSION.SDK_INT < 30 && AndroidCompat.overlays(this)) {
            cutoutProbe = new View(this);
            WindowManager.LayoutParams probe = parameters(-1, -1, "Niulai Camera Geometry");
            probe.flags |= WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS;
            probe.alpha = 0;
            probe.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            cutoutProbe.setOnApplyWindowInsetsListener((view, insets) -> {
                DisplayCutout next = insets.getDisplayCutout();
                if (!java.util.Objects.equals(next, detectedCutout)) {
                    detectedCutout = next;
                    handler.post(() -> { if (island != null) { cancelIslandAnimation(); placeIsland(); updateIslandWindow(); } });
                }
                return insets;
            });
            try { wm.addView(cutoutProbe, probe); }
            catch (RuntimeException error) { android.util.Log.w("NiulaiPet", "Camera geometry probe unavailable", error); }
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
            updateSystemNotification();
        });
        islandFeed = new NativeQuoteFeed((quote, error) -> {
            secondaryQuote = quote;
            secondaryError = error;
            island.update(quote, error);
            updateSystemNotification();
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
            boolean autoCollapse = config.optBoolean("islandAutoCollapse", true);
            config = new JSONObject(PetConfig.json(this));
            String nextMode = config.optString("islandMode", "auto");
            boolean nextSystemIsland = config.optBoolean("islandEnabled") && SystemIsland.use(this, config);
            boolean nextPromotionEligible = nextSystemIsland && SystemIsland.canRequestPromotion(this);
            boolean nextOemEligible = nextSystemIsland && SystemIsland.seemsOemEligible(this);
            if (systemIsland != nextSystemIsland || promotionEligible != nextPromotionEligible
                    || oemEligible != nextOemEligible || !islandMode.equals(nextMode)) {
                cancelPromotionCheck();
                usingOemRoute = false;
                islandFallback = false;
                if (nextSystemIsland && !nextPromotionEligible && !nextOemEligible) startIslandFallback();
            }
            islandMode = nextMode;
            systemIsland = nextSystemIsland;
            systemIslandActive = nextSystemIsland;
            promotionEligible = nextPromotionEligible;
            oemEligible = nextOemEligible;
            cancelIslandAnimation();
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
            clampPet();
            placeIsland();
            updatePetWindow();
            updateIslandWindow();
            syncVisibility();
            if (autoCollapse != config.optBoolean("islandAutoCollapse", true)) scheduleIslandCollapse();
            sendBroadcast(new Intent(CHANGED).setPackage(getPackageName()));
        } catch (Exception e) { android.util.Log.e("NiulaiPet", "Overlay configuration failed", e); }
    }

    private void attachSurfaces(boolean canOverlay) {
        if (!canOverlay || !config.optBoolean("petEnabled")) detachPetWindow();
        else if (!petShowing) {
            try {
                clampPet();
                root.setVisibility(View.INVISIBLE);
                wm.addView(root, petParams);
                petShowing = true;
            } catch (RuntimeException error) {
                android.util.Log.w("NiulaiPet", "Floating pet unavailable", error);
                detachPetWindow();
            }
        }
        boolean showIsland = canOverlay && config.optBoolean("islandEnabled") && (!systemIsland || islandFallback);
        if (!showIsland) detachIslandWindow();
        else if (!islandShowing && !attachIslandWindow() && cameraHost != null) {
            setIslandHost(null);
            attachIslandWindow();
        }
    }

    private boolean attachIslandWindow() {
        try {
            placeIsland();
            island.setVisibility(View.INVISIBLE);
            updateBridge();
            islandWm.addView(island, islandParams);
            islandShowing = true;
            return true;
        } catch (RuntimeException error) {
            android.util.Log.w("NiulaiPet", "Floating island unavailable", error);
            detachIslandWindow();
            return false;
        }
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
        FrontCameraService next = (!systemIsland || islandFallback) && config.optBoolean("islandCameraInteraction")
            && !config.optString("islandPlacement", "auto").equals("below") ? FrontCameraService.connected : null;
        if (next != cameraHost) detachIslandWindow();
        setIslandHost(next);
    }

    private void setIslandHost(FrontCameraService next) {
        cameraHost = next;
        islandWm = next == null ? wm : (WindowManager)next.getSystemService(WINDOW_SERVICE);
        islandParams.type = next == null ? AndroidCompat.overlayType() : WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY;
        islandParams.token = null;
        islandParams.flags |= WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS;
        if (Build.VERSION.SDK_INT >= 30) { islandParams.setFitInsetsTypes(0); islandParams.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS; }
        else if (Build.VERSION.SDK_INT >= 28) islandParams.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
    }

    private void removeBridge() {
        if (cameraBridge == null || !bridgeShowing && cameraBridge.getParent() == null) return;
        bridgeShowing = false;
        cameraBridge.setVisibility(View.INVISIBLE);
        try { islandWm.removeViewImmediate(cameraBridge); }
        catch (RuntimeException error) { android.util.Log.w("NiulaiPet", "Camera join detach failed", error); }
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
            boolean restoreIsland = islandShowing;
            if (restoreIsland) { islandWm.removeViewImmediate(island); islandShowing = false; }
            cameraBridge.setVisibility(island.getVisibility());
            islandWm.addView(cameraBridge, bridgeParams); bridgeShowing = true;
            if (restoreIsland) { islandWm.addView(island, islandParams); islandShowing = true; }
        }
    }

    private void detachPetWindow() {
        if (!petShowing && root.getParent() == null) return;
        petShowing = false;
        root.setVisibility(View.INVISIBLE);
        try { wm.removeViewImmediate(root); }
        catch (RuntimeException error) { android.util.Log.w("NiulaiPet", "Floating pet detach failed", error); }
    }

    private void detachIslandWindow() {
        islandVisible = false;
        if (islandShowing || island.getParent() != null) {
            islandShowing = false;
            island.setVisibility(View.INVISIBLE);
            try { islandWm.removeViewImmediate(island); }
            catch (RuntimeException error) { android.util.Log.w("NiulaiPet", "Floating island detach failed", error); }
        }
        removeBridge();
    }

    private void scheduleWindowRecovery() {
        handler.removeCallbacks(recoverWindows);
        handler.post(recoverWindows);
    }

    private void updatePetWindow() {
        if (!petShowing) return;
        try {
            if (AndroidCompat.overlays(this)) { wm.updateViewLayout(root, petParams); return; }
        } catch (RuntimeException error) { android.util.Log.w("NiulaiPet", "Floating pet update failed", error); }
        detachPetWindow();
        scheduleWindowRecovery();
    }

    private void updateIslandWindow() {
        if (!islandShowing) return;
        try {
            if (AndroidCompat.overlays(this)) {
                islandWm.updateViewLayout(island, islandParams);
                updateBridge();
                return;
            }
        } catch (RuntimeException error) { android.util.Log.w("NiulaiPet", "Floating island update failed", error); }
        detachIslandWindow();
        cancelIslandAnimation();
        if (cameraHost != null) setIslandHost(null);
        scheduleWindowRecovery();
    }

    private void syncVisibility() {
        if (feed == null) return;
        boolean wasMounted = islandShowing, wasVisible = islandVisible, wasSystemVisible = systemIslandVisible;
        boolean wasChecking = islandCheckingPromotion;
        boolean canOverlay = AndroidCompat.overlays(this);
        attachSurfaces(canOverlay);
        if (!config.optBoolean("petEnabled")) { petPreviewUntil = 0; handler.removeCallbacks(endPetPreview); }
        if (!config.optBoolean("islandEnabled")) { islandPreviewUntil = 0; handler.removeCallbacks(endIslandPreview); }
        boolean screen = ((PowerManager)getSystemService(POWER_SERVICE)).isInteractive()
            && !((KeyguardManager)getSystemService(KEYGUARD_SERVICE)).isKeyguardLocked();
        long now = SystemClock.uptimeMillis();
        boolean petVisible = screen && petShowing && (!appVisible || !config.optBoolean("petHideInApp", true) || now < petPreviewUntil);
        boolean showIsland = screen && (!appVisible || !config.optBoolean("islandHideInApp", true) || now < islandPreviewUntil);
        if (!showIsland) {
            island.setVisibility(View.INVISIBLE);
            if (cameraBridge != null) cameraBridge.setVisibility(View.INVISIBLE);
        }
        if ((!showIsland || !islandShowing) && resetIslandExpansion() && islandShowing) {
            placeIsland();
            updateIslandWindow();
        }
        islandVisible = showIsland && islandShowing;
        systemIslandVisible = showIsland && systemIsland && !islandShowing && SystemIsland.notifications(this);
        islandOemRoute = systemIsland && !islandFallback && oemEligible && (!promotionEligible || usingOemRoute);
        root.setVisibility(petVisible ? View.VISIBLE : View.INVISIBLE);
        island.setVisibility(islandVisible ? View.VISIBLE : View.INVISIBLE);
        if (cameraBridge != null) cameraBridge.setVisibility(islandVisible ? View.VISIBLE : View.INVISIBLE);
        pet.active(petVisible);
        island.active(islandVisible);
        boolean petMarket = !"muyu".equals(config.optString("petMode"));
        boolean islandMarket = !"muyu".equals(config.optString("islandContent"));
        feed.setActive((petVisible && petMarket) || ((islandVisible || systemIslandVisible) && islandMarket && islandSymbol.equals(symbol)));
        islandFeed.setActive((islandVisible || systemIslandVisible) && islandMarket && !islandSymbol.equals(symbol));
        updateSystemNotification();
        if (systemIslandVisible && promotionEligible && !islandFallback && !usingOemRoute) schedulePromotionCheck();
        else cancelPromotionCheck();
        if (!screen) woodSound.stop();
        if (!canOverlay && !systemIsland) stopSelf();
        if (wasMounted != islandShowing || wasVisible != islandVisible || wasSystemVisible != systemIslandVisible
                || wasChecking != islandCheckingPromotion) notifyIslandStatus();
        android.util.Log.i("NiulaiPet", "visible=" + petVisible + ";island=" + islandVisible);
    }

    private void notifyIslandStatus() {
        sendBroadcast(new Intent(CHANGED).setPackage(getPackageName()).putExtra(ISLAND_STATUS_ONLY, true));
    }

    private void updateSystemNotification() {
        if (feed == null) return;
        NativeMarket.Quote quote = islandSymbol.equals(symbol) ? primaryQuote : secondaryQuote;
        String error = islandSymbol.equals(symbol) ? primaryError : secondaryError;
        boolean requestPromotion = systemIslandVisible && !islandFallback && (promotionEligible || oemEligible);
        String key = systemIslandVisible ? config.toString() + ":" + islandSymbol + ":" + (quote == null ? "waiting" : quote.received)
            + ":" + error + ":" + MuyuStore.read(this).optLong("session") + ":" + requestPromotion : "service";
        if (key.equals(notificationKey)) return;
        try {
            Notification notification = systemIslandVisible ? SystemIsland.create(this, config, quote, error, requestPromotion) : AndroidCompat.notification(this);
            getSystemService(NotificationManager.class).notify(SystemIsland.NOTIFICATION_ID, notification);
            notificationKey = key;
        } catch (RuntimeException failure) { android.util.Log.w("NiulaiPet", "Island notification update failed", failure); }
    }

    private void schedulePromotionCheck() {
        if (islandCheckingPromotion) return;
        islandCheckingPromotion = true;
        handler.postDelayed(promotionCheck, promotionConfirmed && !needsPromotionRecheck ? PROMOTION_RECHECK_MS : PROMOTION_GRACE_MS);
    }

    private void cancelPromotionCheck() {
        handler.removeCallbacks(promotionCheck);
        islandCheckingPromotion = false;
        promotionConfirmed = false;
        needsPromotionRecheck = false;
    }

    private void checkIslandPromotion() {
        islandCheckingPromotion = false;
        if (!systemIslandVisible || islandFallback) return;
        if (SystemIsland.promoted(this)) {
            boolean changed = !promotionConfirmed || needsPromotionRecheck;
            promotionConfirmed = true;
            needsPromotionRecheck = false;
            schedulePromotionCheck();
            if (changed) notifyIslandStatus();
            return;
        }
        if (promotionConfirmed && !needsPromotionRecheck) {
            needsPromotionRecheck = true;
            schedulePromotionCheck();
            notifyIslandStatus();
            return;
        }
        if (oemEligible) {
            promotionConfirmed = false;
            usingOemRoute = true;
            islandOemRoute = true;
            notifyIslandStatus();
            return;
        }
        startIslandFallback();
        refreshIslandHost();
        syncVisibility();
        notifyIslandStatus();
    }

    private void startIslandFallback() {
        islandFallback = true;
        resetIslandExpansion();
    }

    private void cancelIslandAnimation() {
        if (islandAnimator == null) return;
        android.animation.ValueAnimator animation = islandAnimator;
        islandAnimator = null;
        animation.cancel();
    }

    private boolean resetIslandExpansion() {
        boolean changed = island.expanded() || islandAnimator != null;
        handler.removeCallbacks(collapseIsland);
        cancelIslandAnimation();
        if (island.expanded()) island.expanded(false);
        return changed;
    }

    private void scheduleIslandCollapse() {
        handler.removeCallbacks(collapseIsland);
        if (islandVisible && island.expanded() && config.optBoolean("islandAutoCollapse", true)) {
            handler.postDelayed(collapseIsland, 10000);
        }
    }

    private void togglePet() {
        collapsed = !collapsed;
        pet.collapsed(collapsed);
        clampPet(); updatePetWindow();
        PetConfig.prefs(this).edit().putBoolean("collapsed", collapsed).apply();
    }

    private void toggleIsland() {
        if (!islandVisible) return;
        cancelIslandAnimation();
        int oldWidth = islandParams.width, oldHeight = islandParams.height, oldX = islandParams.x, oldY = islandParams.y;
        island.expanded(!island.expanded());
        placeIsland();
        int targetWidth = islandParams.width, targetHeight = islandParams.height, targetX = islandParams.x, targetY = islandParams.y;
        if (config.optBoolean("islandMotion", true) && config.optBoolean("motion", true)) {
            islandAnimator = android.animation.ValueAnimator.ofFloat(0, 1);
            islandAnimator.setDuration(220);
            islandAnimator.addUpdateListener(animation -> {
                float fraction = (float)animation.getAnimatedValue();
                islandParams.width = Math.round(oldWidth + (targetWidth - oldWidth) * fraction);
                islandParams.height = Math.round(oldHeight + (targetHeight - oldHeight) * fraction);
                islandParams.x = Math.round(oldX + (targetX - oldX) * fraction);
                islandParams.y = Math.round(oldY + (targetY - oldY) * fraction);
                island.cameraWindowX(islandParams.x);
                updateIslandWindow();
            });
            islandAnimator.addListener(new android.animation.AnimatorListenerAdapter() {
                @Override public void onAnimationEnd(android.animation.Animator animation) {
                    if (islandAnimator == animation) islandAnimator = null;
                }
            });
            islandAnimator.start();
        } else updateIslandWindow();
        scheduleIslandCollapse();
    }

    private void selectIsland(int direction) {
        try {
            JSONObject state = AppState.load(this);
            JSONArray stocks = state.getJSONArray("stocks");
            if (stocks.length() == 0) return;
            int index = -1;
            for (int i = 0; i < stocks.length(); i++) if (stocks.getJSONObject(i).optString("code").equals(islandSymbol)) index = i;
            if (index < 0) index = direction < 0 ? stocks.length() - 1 : 0;
            else index = (index + direction + stocks.length()) % stocks.length();
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
        if (!petShowing && !islandShowing && !(systemIsland && config.optBoolean("islandEnabled"))) stopSelf();
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? "" : intent.getAction();
        if (STOP.equals(action)) {
            AppState.feature(this, "petEnabled", false); AppState.feature(this, "islandEnabled", false); stopSelf();
        } else if (CLOSE_PET.equals(action)) closeFeature("petEnabled");
        else if (CLOSE_ISLAND.equals(action)) closeFeature("islandEnabled");
        else if ("art.niulai.ISLAND_PREVIOUS".equals(action)) selectIsland(-1);
        else if ("art.niulai.ISLAND_NEXT".equals(action)) selectIsland(1);
        else if ("art.niulai.PREVIEW".equals(action) && pet != null) {
            petPreviewUntil = SystemClock.uptimeMillis() + 6000;
            handler.removeCallbacks(endPetPreview);
            handler.postAtTime(endPetPreview, petPreviewUntil);
            pet.preview(intent.getStringExtra("motion"));
            syncVisibility();
        } else {
            if ("art.niulai.ISLAND_PREVIEW".equals(action) && island != null) {
                islandPreviewUntil = SystemClock.uptimeMillis() + 10000;
                handler.removeCallbacks(endIslandPreview);
                handler.postAtTime(endIslandPreview, islandPreviewUntil);
            }
            configure();
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
                clampPet(); updatePetWindow();
            }
            if (event.getActionMasked() == MotionEvent.ACTION_UP || event.getActionMasked() == MotionEvent.ACTION_CANCEL) {
                PetConfig.prefs(PetService.this).edit().putInt("x", petParams.x).putInt("y", petParams.y).apply(); dragging = false;
            }
            return true;
        }
    }

    @Override public void onDestroy() {
        running = false;
        systemIslandActive = false;
        islandFallback = islandVisible = islandCheckingPromotion = islandOemRoute = false;
        cancelIslandAnimation();
        handler.removeCallbacksAndMessages(null);
        if (feed != null) feed.close();
        if (islandFeed != null) islandFeed.close();
        if (pet != null) pet.close();
        if (island != null) island.close();
        if (woodSound != null) woodSound.close();
        if (receiverRegistered) unregisterReceiver(receiver);
        if (root != null) detachPetWindow();
        if (island != null) detachIslandWindow();
        try { if (cutoutProbe != null) wm.removeView(cutoutProbe); } catch (RuntimeException ignored) { }
        petShowing = islandShowing = false;
        stopForeground(STOP_FOREGROUND_REMOVE);
        sendBroadcast(new Intent(CHANGED).setPackage(getPackageName()));
        super.onDestroy();
    }
}
