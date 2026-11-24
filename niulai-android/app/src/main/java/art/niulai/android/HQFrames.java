package art.niulai.android;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.LruCache;
import java.io.InputStream;
import java.util.HashMap;
import java.util.ArrayList;
import java.util.Map;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Shared bounded page cache. Decode never runs on the UI thread. */
final class HQFrames {
    private static final int CACHE_BYTES = (int) Math.min(96L * 1024 * 1024, Math.max(40L * 1024 * 1024, Runtime.getRuntime().maxMemory() / 3));
    private static final ExecutorService worker = Executors.newSingleThreadExecutor();
    private static final Map<String, List<Runnable>> pending = new HashMap<>();
    private static final Map<String, Long> failed = new HashMap<>();
    private static final LruCache<String, Bitmap> pages = new LruCache<String, Bitmap>(CACHE_BYTES) {
        @Override protected int sizeOf(String key, Bitmap image) { return image.getAllocationByteCount(); }
    };
    static int sampleSizeFor(boolean mini) { return mini ? 4 : CACHE_BYTES < 88 * 1024 * 1024 ? 2 : 1; }
    private static String key(String file, int sampleSize) { return sampleSize + ":" + file; }
    static Bitmap get(String file) { return get(file, sampleSizeFor(false)); }
    static Bitmap get(String file, int sampleSize) { return pages.get(key(file, sampleSize)); }
    static void trim() { pages.evictAll(); }
    static void load(Context context, String file, Runnable ready) { load(context, file, sampleSizeFor(false), ready); }
    static void load(Context context, String file, int sampleSize, Runnable ready) {
        final int step = Math.max(1, sampleSize);
        final String cacheKey = key(file, step);
        if (pages.get(cacheKey) != null) { if (ready != null) ready.run(); return; }
        synchronized (pending) {
            Long failure = failed.get(cacheKey);
            if (failure != null && android.os.SystemClock.uptimeMillis() - failure < 5000) { if (ready != null) ready.run(); return; }
            List<Runnable> listeners = pending.get(cacheKey);
            if (listeners != null) { if (ready != null) listeners.add(ready); return; }
            listeners = new ArrayList<>(); if (ready != null) listeners.add(ready);
            pending.put(cacheKey, listeners);
        }
        Context app = context.getApplicationContext();
        worker.execute(() -> {
            try (InputStream input = app.getAssets().open("web/assets/hq/" + file)) {
                BitmapFactory.Options options = new BitmapFactory.Options();
                options.inScaled = false;
                options.inSampleSize = step;
                Bitmap image = BitmapFactory.decodeStream(input, null, options);
                if (image != null) pages.put(cacheKey, image);
            } catch (Exception | OutOfMemoryError error) { android.util.Log.w("NiulaiPet", "HQ page unavailable: " + file, error); }
            finally {
                List<Runnable> listeners;
                synchronized (pending) {
                    if (pages.get(cacheKey) == null) failed.put(cacheKey, android.os.SystemClock.uptimeMillis());
                    else failed.remove(cacheKey);
                    listeners = pending.remove(cacheKey);
                }
                if (listeners != null) for (Runnable listener : listeners) listener.run();
            }
        });
    }
}
