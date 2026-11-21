package art.niulai.qa;

import android.app.Instrumentation;
import android.appwidget.AppWidgetHost;
import android.appwidget.AppWidgetHostView;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.View;
import android.widget.TextView;
import java.io.File;
import java.io.FileOutputStream;
import java.lang.reflect.Method;
import org.json.JSONArray;
import org.json.JSONObject;

final class CoverWidgetCheck {
    static void verify(Instrumentation runner) throws Exception {
        Context context = runner.getTargetContext();
        SharedPreferences prefs = context.getSharedPreferences("pet", Context.MODE_PRIVATE);
        String oldState = prefs.getString("app_state", null), oldQuote = prefs.getString("quote", null);
        String oldCache = prefs.getString("watch_quotes", null);
        AppWidgetHost host = new AppWidgetHost(context, 0x3479);
        int squareId = -1, stripId = -1;
        try {
            String state = "{\"selected\":\"s_sh000001\",\"private\":false,\"muyuSound\":false,\"stocks\":["
                + "{\"code\":\"s_sh000001\",\"name\":\"上证指数\",\"cost\":3000,\"shares\":2},"
                + "{\"code\":\"rt_hk00700\",\"name\":\"腾讯控股\"}]}";
            prefs.edit().putString("app_state", state).remove("quote").remove("watch_quotes").commit();
            Class<?> config = context.getClassLoader().loadClass("art.niulai.android.PetConfig");
            Method cache = config.getDeclaredMethod("cacheWatch", Context.class, String.class);
            cache.setAccessible(true);
            long now = System.currentTimeMillis();
            cache.invoke(null, context, new JSONArray()
                .put(quote("s_sh000001", 3420.35, now)).put(quote("rt_hk00700", 411.125, now))
                .put(quote("gb_aapl", 999, now)).toString());
            cache.invoke(null, context, new JSONArray().put(quote("rt_hk00700", 399, now - 5000)).toString());
            JSONObject saved = new JSONObject(prefs.getString("watch_quotes", "{}"));
            require(saved.length() == 2 && saved.getJSONObject("rt_hk00700").getDouble("price") == 411.125,
                "Cache must exclude untracked or older quotes");

            AppWidgetManager manager = AppWidgetManager.getInstance(context);
            ComponentName provider = new ComponentName(context.getPackageName(), "art.niulai.android.CoverWidgetProvider");
            squareId = host.allocateAppWidgetId();
            stripId = host.allocateAppWidgetId();
            require(manager.bindAppWidgetIdIfAllowed(squareId, provider, options(352,339)), "QA binding unavailable");
            require(manager.bindAppWidgetIdIfAllowed(stripId, provider, options(256,130)), "QA binding unavailable");
            AppWidgetHostView square = view(runner, host, context, manager, squareId);
            AppWidgetHostView strip = view(runner, host, context, manager, stripId);
            runner.runOnMainSync(host::startListening);
            waitFor(runner, square, "widget_value", "3,420.35");
            waitFor(runner, strip, "widget_value", "3,420.35");
            click(runner, square, "widget_cover_stock");
            waitFor(runner, square, "widget_value", "411.125");
            waitFor(runner, strip, "widget_value", "3,420.35");
            require(new JSONObject(prefs.getString("app_state", "{}")).getString("selected").equals("s_sh000001"),
                "Widget selection escaped the widget");
            capture(runner, square, 352, 339, "widget-square.png");
            capture(runner, strip, 256, 130, "widget-strip.png");
            click(runner, square, "widget_next");
            waitFor(runner, square, "widget_name", "敲敲木鱼");
            require(read(runner, square, "widget_cover_stock").startsWith("hidden:"), "Stock switch visible in wood mode");
            click(runner, square, "widget_next");
            waitFor(runner, square, "widget_value", "411.125");
        } finally {
            runner.runOnMainSync(host::stopListening);
            host.deleteHost();
            prefs.edit().putString("app_state", oldState).putString("quote", oldQuote).putString("watch_quotes", oldCache)
                .remove("widget_scene_" + squareId).remove("widget_scene_" + stripId)
                .remove("widget_stock_" + squareId).remove("widget_stock_" + stripId).commit();
        }
    }

    private static JSONObject quote(String code, double price, long received) throws Exception {
        return new JSONObject().put("code", code).put("price", price).put("changePct", 0.8).put("received", received);
    }

    private static Bundle options(int width, int height) {
        Bundle options = new Bundle();
        options.putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, width);
        options.putInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH, width);
        options.putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, height);
        options.putInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, height);
        return options;
    }

    private static AppWidgetHostView view(Instrumentation runner, AppWidgetHost host, Context context,
                                         AppWidgetManager manager, int id) {
        AppWidgetHostView[] result = new AppWidgetHostView[1];
        runner.runOnMainSync(() -> result[0] = host.createView(context, id, manager.getAppWidgetInfo(id)));
        return result[0];
    }

    private static View find(AppWidgetHostView view, String name) {
        Context context = view.getContext();
        return view.findViewById(context.getResources().getIdentifier(name, "id", context.getPackageName()));
    }

    private static String read(Instrumentation runner, AppWidgetHostView view, String name) {
        String[] value = {""};
        runner.runOnMainSync(() -> {
            View child = find(view, name);
            if (child instanceof TextView) value[0] = (child.getVisibility() == View.VISIBLE ? "" : "hidden:") + ((TextView) child).getText();
        });
        return value[0];
    }

    private static void waitFor(Instrumentation runner, AppWidgetHostView view, String name, String expected) {
        long deadline = SystemClock.elapsedRealtime() + 7000;
        while (SystemClock.elapsedRealtime() < deadline) {
            if (expected.equals(read(runner, view, name))) return;
            SystemClock.sleep(100);
        }
        throw new AssertionError(name + " expected " + expected + "; received " + read(runner, view, name));
    }

    private static void click(Instrumentation runner, AppWidgetHostView view, String name) {
        runner.runOnMainSync(() -> {
            View child = find(view, name);
            require(child != null && child.performClick(), name + " gesture not bound");
        });
    }

    private static void capture(Instrumentation runner, AppWidgetHostView view, int width, int height, String name) throws Exception {
        Bitmap[] image = new Bitmap[1];
        runner.runOnMainSync(() -> {
            float density = view.getResources().getDisplayMetrics().density;
            int w = Math.round(width * density), h = Math.round(height * density);
            view.measure(View.MeasureSpec.makeMeasureSpec(w, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(h, View.MeasureSpec.EXACTLY));
            view.layout(0, 0, w, h);
            image[0] = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
            view.draw(new Canvas(image[0]));
        });
        File output = new File(view.getContext().getExternalFilesDir("qa"), name);
        try (FileOutputStream file = new FileOutputStream(output)) { image[0].compress(Bitmap.CompressFormat.PNG, 100, file); }
        finally { image[0].recycle(); }
    }

    private static void require(boolean result, String message) {
        if (!result) throw new AssertionError(message);
    }
}
