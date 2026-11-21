package art.niulai.android;

import android.app.*;
import android.appwidget.*;
import android.content.*;
import android.content.res.ColorStateList;
import android.graphics.Bitmap;
import android.graphics.drawable.Icon;
import android.os.*;
import android.view.View;
import android.widget.RemoteViews;
import java.text.SimpleDateFormat;
import java.util.*;
import org.json.*;

public class StackWidgetProvider extends AppWidgetProvider {
    private static long lastUpdate;
    private static boolean counterPending;
    private static MuyuSound clickSound;
    private static final Handler handler = new Handler(Looper.getMainLooper());
    private static final String NEXT = "art.niulai.WIDGET_NEXT", PREV = "art.niulai.WIDGET_PREV", KNOCK = "art.niulai.WIDGET_KNOCK",
        STOCK = "art.niulai.WIDGET_COVER_STOCK";

    static void refreshThrottled(Context context) {
        long now = System.currentTimeMillis();
        if (now - lastUpdate > 30000) { lastUpdate = now; refreshAll(context); }
    }

    static void refreshCounter(Context context) {
        if (counterPending) return;
        counterPending = true;
        Context application = context.getApplicationContext();
        handler.postDelayed(() -> { counterPending = false; refreshAll(application); }, 500);
    }

    static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        for (Class<?> type : new Class<?>[]{StackWidgetProvider.class, CoverWidgetProvider.class})
            for (int id : manager.getAppWidgetIds(new ComponentName(context, type))) render(context, manager, id, type);
    }

    @Override public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) render(context, manager, id, getClass());
    }
    @Override public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        render(context, manager, id, getClass());
    }
    @Override public void onDeleted(Context context, int[] ids) {
        for (int id : ids) PetConfig.prefs(context).edit().remove("widget_scene_" + id).remove("widget_stock_" + id).apply();
    }

    @Override public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        String action = intent.getAction();
        if (!NEXT.equals(action) && !PREV.equals(action) && !KNOCK.equals(action) && !STOCK.equals(action)) return;
        int id = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, -1);
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        AppWidgetProviderInfo info = manager.getAppWidgetInfo(id);
        if (info == null || !info.provider.equals(new ComponentName(context, getClass()))) return;
        if (STOCK.equals(action)) {
            if (getClass() != CoverWidgetProvider.class) return;
            JSONObject state = AppState.load(context);
            JSONArray stocks = state.optJSONArray("stocks");
            String current = coverSymbol(context, state, id);
            for (int i = 0; stocks != null && i < stocks.length(); i++) {
                if (!stocks.optJSONObject(i).optString("code").equals(current)) continue;
                String next = stocks.optJSONObject((i + 1) % stocks.length()).optString("code");
                PetConfig.prefs(context).edit().putString("widget_stock_" + id, next).apply();
                break;
            }
        } else if (KNOCK.equals(action)) {
            MuyuStore.tap(context);
            if (AppState.load(context).optBoolean("muyuSound")) {
                if (clickSound == null) clickSound = new MuyuSound(context.getApplicationContext());
                clickSound.play();
            }
        } else {
            int page = PetConfig.prefs(context).getInt("widget_scene_" + id, 0);
            int next = getClass() == CoverWidgetProvider.class ? (page == 3 ? 1 : 3)
                : (page + (NEXT.equals(action) ? 1 : 3)) % 4;
            PetConfig.prefs(context).edit().putInt("widget_scene_" + id, next).apply();
        }
        render(context, manager, id, getClass());
    }

    private static int res(Context context, String type, String name) {
        return context.getResources().getIdentifier(name, type, context.getPackageName());
    }

    static JSONArray history(Context context, String symbol) {
        try { return new JSONArray(PetConfig.prefs(context).getString("history_" + symbol, "[]")); }
        catch (Exception ignored) { return new JSONArray(); }
    }

    private static void textColor(Context context, RemoteViews view, String id, String theme, String colorResource, int light, int dark) {
        if (Build.VERSION.SDK_INT >= 31 && theme.equals("system")) view.setColor(res(context, "id", id), "setTextColor", res(context, "color", colorResource));
        else view.setTextColor(res(context, "id", id), Appearance.dark(context, theme) ? dark : light);
    }

    private static PendingIntent event(Context context, int id, Class<?> provider, String action) {
        Intent intent = new Intent(context, provider).setAction(action).putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id)
            .setData(android.net.Uri.parse("niulai://widget/" + id + "/" + action));
        return PendingIntent.getBroadcast(context, id, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static String coverSymbol(Context context, JSONObject state, int id) {
        String code = PetConfig.prefs(context).getString("widget_stock_" + id, "");
        return AppState.stock(state,code) != null ? code : state.optString("selected", "s_sh000001");
    }

    private static void render(Context context, AppWidgetManager manager, int id, Class<?> provider) {
        try {
            JSONObject state = AppState.load(context), config = new JSONObject(PetConfig.json(context));
            boolean cover = provider == CoverWidgetProvider.class;
            String symbol = cover ? coverSymbol(context,state,id) : config.optString("symbol", "s_sh000001");
            JSONObject stock = AppState.stock(state,symbol);
            JSONObject quote = cover ? PetConfig.snapshot(context,symbol) : new JSONObject(PetConfig.prefs(context).getString("quote", "{}"));
            if (!symbol.equals(quote.optString("code"))) quote = new JSONObject();
            int scene = Math.floorMod(PetConfig.prefs(context).getInt("widget_scene_" + id, 0),4);
            if (cover && scene != 3) scene = 1;
            String theme = cover ? "dark" : state.optString("widgetTheme", "system");
            Bundle options = manager.getAppWidgetOptions(id);
            boolean landscape=context.getResources().getConfiguration().orientation==android.content.res.Configuration.ORIENTATION_LANDSCAPE;
            int availableWidth=options.getInt(landscape?AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH:AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH,cover?352:250);
            int availableHeight=options.getInt(landscape?AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT:AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT,cover?339:160);
            boolean compact=cover&&(availableWidth<290||availableHeight<220);
            String layout=cover?(compact?"widget_cover_compact":"widget_cover"):"widget_stack";
            RemoteViews view = new RemoteViews(context.getPackageName(), res(context, "layout", layout));
            ColorStateList lightSurface = ColorStateList.valueOf(0xfffafbf5), darkSurface = ColorStateList.valueOf(0xff20231f);
            ColorStateList tint = theme.equals("system") ? null : Appearance.dark(context, theme) ? darkSurface : lightSurface;
            if (!cover && Build.VERSION.SDK_INT >= 31) {
                view.setColorStateList(res(context, "id", "widget_root"), "setBackgroundTintList", tint);
            }
            if (!cover) {
                for (String name : new String[]{"widget_scene", "widget_time", "widget_note"}) textColor(context, view, name, theme, "widget_muted", 0xff74766f, 0xffa0a498);
                for (String name : new String[]{"widget_name", "widget_prev", "widget_next"}) textColor(context, view, name, theme, "widget_ink", 0xff282925, 0xffeeefe8);
            } else {
                view.setTextViewText(res(context, "id", "widget_next"), scene == 3 ? "行情" : "木鱼");
                JSONArray stocks=state.optJSONArray("stocks");
                view.setViewVisibility(res(context, "id", "widget_cover_stock"),scene==1&&stocks!=null&&stocks.length()>1?View.VISIBLE:View.GONE);
            }
            String[] titles = {"牛来 · 桌宠", "牛来 · 行情", "牛来 · 持仓", "牛来 · 木鱼"};
            view.setTextViewText(res(context, "id", "widget_scene"), titles[scene]);
            double price = quote.optDouble("price", 0), percent = quote.optDouble("changePct", 0);
            String name = cover && stock != null ? stock.optString("name") : config.optString("name", "牛来盯盘");
            String valueColor = percent < 0 ? "widget_fall" : "widget_rise";
            java.text.NumberFormat priceFormat=java.text.NumberFormat.getNumberInstance(Locale.US);
            priceFormat.setMinimumFractionDigits(symbol.startsWith("rt_hk")?3:2);
            priceFormat.setMaximumFractionDigits(4);
            String value = price > 0 ? priceFormat.format(price) : "—";
            String note = price > 0 && quote.has("changePct") ? String.format(Locale.US, "%+.2f%%  ·  %s", percent, NativeMarket.currency(symbol))
                : price>0 ? NativeMarket.currency(symbol) : "点开连接行情";
            int lightColor = percent < 0 ? 0xff22836d : 0xffcc4148;
            int darkColor = percent < 0 ? 0xff63c5a6 : 0xfffa8086;
            int pose = percent >= 5 ? 2 : percent >= 2 ? 3 : percent > .15 ? 4 : percent >= -.15 ? 0 : percent > -1 ? 5 : percent > -3 ? 1 : percent > -5 ? 6 : 7;
            if (scene == 2) {
                boolean hide = state.optBoolean("private", true);
                value = hide ? "••••" : config.optDouble("shares") > 0 && price > 0
                    ? String.format(Locale.US, "%+,.2f", (price - config.optDouble("cost")) * config.optDouble("shares")) : "未设置";
                note = hide ? "持仓金额已隐藏" : "累计盈亏 · " + NativeMarket.currency(symbol);
                lightColor = 0xff282925; darkColor = 0xffeeefe8; valueColor = "widget_ink";
            }
            JSONObject counts = MuyuStore.read(context);
            if (scene == 3) {
                name = "敲敲木鱼"; value = Long.toString(counts.optLong("session"));
                note = "今日 " + counts.optLong("today") + " · 累计 " + counts.optLong("total");
                lightColor = 0xffa67631; darkColor = 0xffe5b775; valueColor = "widget_wood"; pose = 8;
            }
            view.setTextViewText(res(context, "id", "widget_name"), name);
            view.setTextViewText(res(context, "id", "widget_value"), value);
            view.setTextViewText(res(context, "id", "widget_note"), note);
            textColor(context, view, "widget_value", theme, valueColor, lightColor, darkColor);
            if (scene < 2) textColor(context, view, "widget_note", theme, valueColor, lightColor, darkColor);
            long received = quote.optLong("received");
            String format=cover?(System.currentTimeMillis()-received>86400000?"MM/dd HH:mm":"HH:mm"):"HH:mm:ss";
            String time = received > 0 ? new SimpleDateFormat(format, Locale.CHINA).format(new Date(received)) : "尚无行情";
            String status=scene==3?"轻触牛来或数字 +1": "快照 " + time + (cover ? "" : " · 点开刷新");
            view.setTextViewText(res(context, "id", "widget_time"), status);
            boolean small = availableWidth < (cover ? 280 : 210);
            boolean bull=state.optBoolean("widgetBull", true)&&!small&&!compact;
            view.setViewVisibility(res(context, "id", "widget_bull"), bull ? View.VISIBLE : View.GONE);
            if(bull)view.setImageViewBitmap(res(context, "id", "widget_bull"), BullBitmap.pose(context, pose));
            JSONArray history = history(context, symbol);
            boolean graph = !compact && scene < 2 && state.optBoolean("widgetSparkline", true) && history.length() >= 2
                && availableHeight >= (cover ? 240 : 140);
            view.setViewVisibility(res(context, "id", "widget_chart"), graph ? View.VISIBLE : View.GONE);
            if (graph) {
                Bitmap light = WidgetChart.draw(history, lightColor), dark = WidgetChart.draw(history, darkColor);
                if (Build.VERSION.SDK_INT >= 31 && theme.equals("system"))
                    view.setIcon(res(context, "id", "widget_chart"), "setImageIcon", Icon.createWithBitmap(light), Icon.createWithBitmap(dark));
                else view.setImageViewBitmap(res(context, "id", "widget_chart"), Appearance.dark(context, theme) ? dark : light);
            }
            Intent target=new Intent(context,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            if(cover&&scene==1)target.setAction(MainActivity.OPEN_WIDGET_STOCK).putExtra("widget_stock",symbol);
            PendingIntent open = PendingIntent.getActivity(context, id, target, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            view.setOnClickPendingIntent(res(context, "id", "widget_root"), open);
            view.setOnClickPendingIntent(res(context, "id", "widget_value"), scene == 3 ? event(context, id, provider, KNOCK) : open);
            view.setOnClickPendingIntent(res(context, "id", "widget_bull"), scene == 3 ? event(context, id, provider, KNOCK) : open);
            view.setOnClickPendingIntent(res(context, "id", "widget_next"), event(context, id, provider, NEXT));
            if(cover)view.setOnClickPendingIntent(res(context,"id","widget_cover_stock"),event(context,id,provider,STOCK));
            if (!cover) view.setOnClickPendingIntent(res(context, "id", "widget_prev"), event(context, id, provider, PREV));
            manager.updateAppWidget(id, view);
        } catch (Exception e) { android.util.Log.e("NiulaiWidget", "Widget update failed", e); }
    }
}
