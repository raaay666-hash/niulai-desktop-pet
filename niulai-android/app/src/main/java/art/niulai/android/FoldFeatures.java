package art.niulai.android;

import android.app.Activity;
import android.content.Context;
import android.graphics.Rect;
import android.view.View;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.function.Consumer;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** Reads optional OEM Window Extensions without bundling a stub implementation. */
final class FoldFeatures implements AutoCloseable {
    private static final String EXTENSION = "androidx.window.extensions.";
    private final Activity activity;
    private final Runnable changed;
    private Object component, listener;
    private Method removeListener;
    private List<Rect> folds = Collections.emptyList();

    FoldFeatures(Activity activity, Runnable changed) {
        this.activity = activity;
        this.changed = changed;
        try {
            Class<?> provider = Class.forName(EXTENSION + "WindowExtensionsProvider");
            Class<?> extensions = Class.forName(EXTENSION + "WindowExtensions");
            Class<?> layout = Class.forName(EXTENSION + "layout.WindowLayoutComponent");
            Object instance = provider.getMethod("getWindowExtensions").invoke(null);
            component = extensions.getMethod("getWindowLayoutComponent").invoke(instance);
            if (component != null && !listenWithExtensionsConsumer(layout)) {
                register(layout, Activity.class, Consumer.class, (Consumer<Object>) this::onLayoutInfo);
            }
        } catch (ReflectiveOperationException | RuntimeException | LinkageError unavailable) {
            close();
        }
    }

    private boolean listenWithExtensionsConsumer(Class<?> layout) {
        try {
            Class<?> consumer = Class.forName(EXTENSION + "core.util.function.Consumer");
            Object callback = Proxy.newProxyInstance(consumer.getClassLoader(), new Class<?>[]{consumer}, (proxy, method, args) -> {
                switch (method.getName()) {
                    case "accept": onLayoutInfo(args[0]); return null;
                    case "equals": return proxy == args[0];
                    case "hashCode": return System.identityHashCode(proxy);
                    case "toString": return "Niulai window layout listener";
                    default: return null;
                }
            });
            register(layout, Context.class, consumer, callback);
            return true;
        } catch (ReflectiveOperationException | RuntimeException | LinkageError unavailable) {
            return false;
        }
    }

    private void register(Class<?> layout, Class<?> context, Class<?> consumer, Object callback)
            throws ReflectiveOperationException {
        Method add = layout.getMethod("addWindowLayoutInfoListener", context, consumer);
        Method remove = layout.getMethod("removeWindowLayoutInfoListener", consumer);
        add.invoke(component, activity, callback);
        listener = callback;
        removeListener = remove;
    }

    private void onLayoutInfo(Object info) {
        if (info == null) return;
        List<Rect> next = new ArrayList<>();
        try {
            Class<?> layout = Class.forName(EXTENSION + "layout.WindowLayoutInfo");
            Class<?> foldClass = Class.forName(EXTENSION + "layout.FoldingFeature");
            int hinge = foldClass.getField("TYPE_HINGE").getInt(null);
            int halfOpened = foldClass.getField("STATE_HALF_OPENED").getInt(null);
            Method type = foldClass.getMethod("getType"), state = foldClass.getMethod("getState");
            Method bounds = foldClass.getMethod("getBounds");
            for (Object feature : (List<?>) layout.getMethod("getDisplayFeatures").invoke(info)) {
                if (foldClass.isInstance(feature) && ((Integer) type.invoke(feature) == hinge
                        || (Integer) state.invoke(feature) == halfOpened)) {
                    next.add(new Rect((Rect) bounds.invoke(feature)));
                }
            }
        } catch (ReflectiveOperationException | RuntimeException | LinkageError unavailable) {
            next.clear();
        }
        activity.runOnUiThread(() -> {
            if (activity.isDestroyed() || folds.equals(next)) return;
            folds = next;
            changed.run();
        });
    }

    String inView(View view) {
        JSONArray features = new JSONArray();
        if (folds.isEmpty()) return features.toString();
        int[] location = new int[2];
        view.getLocationInWindow(location);
        float density = view.getResources().getDisplayMetrics().density;
        for (Rect fold : folds) {
            try {
                JSONObject bounds = new JSONObject();
                bounds.put("left", (fold.left - location[0]) / density);
                bounds.put("top", (fold.top - location[1]) / density);
                bounds.put("right", (fold.right - location[0]) / density);
                bounds.put("bottom", (fold.bottom - location[1]) / density);
                features.put(bounds);
            } catch (JSONException ignored) {}
        }
        return features.toString();
    }

    @Override public void close() {
        try {
            if (removeListener != null) removeListener.invoke(component, listener);
        } catch (ReflectiveOperationException | RuntimeException | LinkageError ignored) {}
        component = null;
        listener = null;
        removeListener = null;
        folds = Collections.emptyList();
    }
}
