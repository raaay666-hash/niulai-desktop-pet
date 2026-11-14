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
    private static final ExecutorService worker = Executors.newSingleThreadExecutor();
    private static final Map<String, List<Runnable>> pending = new HashMap<>();
    private static final Map<String, Long> failed = new HashMap<>();
    private static final LruCache<String, Bitmap> pages = new LruCache<String, Bitmap>(40 * 1024 * 1024) {
        @Override protected int sizeOf(String key, Bitmap image) { return image.getAllocationByteCount(); }
    };
    static Bitmap get(String file) { return pages.get(file); }
    static void load(Context context, String file, Runnable ready) {
        if (pages.get(file) != null) { if (ready != null) ready.run(); return; }
        synchronized (pending) {
            Long failure = failed.get(file);
            if (failure != null && android.os.SystemClock.uptimeMillis() - failure < 5000) { if (ready != null) ready.run(); return; }
            List<Runnable> listeners = pending.get(file);
            if (listeners != null) { if (ready != null) listeners.add(ready); return; }
            listeners = new ArrayList<>(); if (ready != null) listeners.add(ready);
            pending.put(file, listeners);
        }
        Context app = context.getApplicationContext();
        worker.execute(() -> {
            try (InputStream input = app.getAssets().open("web/assets/hq/" + file)) {
                BitmapFactory.Options options = new BitmapFactory.Options(); options.inScaled = false;
                Bitmap image = BitmapFactory.decodeStream(input, null, options);
                if (image != null) pages.put(file, image);
            } catch (Exception error) { android.util.Log.w("NiulaiPet", "HQ page unavailable: " + file, error); }
            finally {
                List<Runnable> listeners;
                synchronized (pending) {
                    if (pages.get(file) == null) failed.put(file, android.os.SystemClock.uptimeMillis());
                    else failed.remove(file);
                    listeners = pending.remove(file);
                }
                if (listeners != null) for (Runnable listener : listeners) listener.run();
            }
        });
    }
}
