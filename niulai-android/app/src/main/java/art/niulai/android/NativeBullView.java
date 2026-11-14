package art.niulai.android;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Rect;
import android.graphics.RectF;
import android.os.SystemClock;
import android.util.LruCache;
import android.view.View;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONObject;

final class NativeBullView extends View {
    private static JSONObject animation = new JSONObject(), labels = new JSONObject(), highQuality = new JSONObject();
    private static final ExecutorService decoder = Executors.newSingleThreadExecutor();
    private static final LruCache<String, Bitmap> cache = new LruCache<String, Bitmap>(24 * 1024 * 1024) {
        @Override protected int sizeOf(String key, Bitmap value) { return value.getAllocationByteCount(); }
    };
    private final FramePlayer player = new FramePlayer();
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
    private final Rect source = new Rect();
    private final RectF destination = new RectF();
    private Bitmap sheet;
    private String sheetName = "", target = "";
    private int request;
    private boolean active = true, motion = true, mini;
    private JSONObject hqSpec;
    private int lastIndex;

    NativeBullView(Context context) { super(context); load(context); state("idle"); }

    private static String read(Context context, String name) throws Exception {
        try (InputStream input = context.getAssets().open("web/assets/" + name)) {
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            byte[] buffer = new byte[4096]; int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
            return output.toString("UTF-8");
        }
    }

    private static synchronized void load(Context context) {
        if (animation.has("clips")) return;
        try {
            animation = new JSONObject(read(context, "bull-frames.json"));
            highQuality = new JSONObject(read(context, "hq/manifest.json")).getJSONObject("sheets");
            JSONArray catalog = new JSONArray(read(context, "motion-catalog.json"));
            for (int i = 0; i < catalog.length(); i++) {
                JSONObject item = catalog.getJSONObject(i);
                labels.put(item.getString("id"), item.getString("label"));
            }
        } catch (Exception error) { android.util.Log.e("NiulaiPet", "Animation catalog unavailable", error); }
    }

    static String label(Context context, String id) { load(context); return labels.optString(id); }
    void mini(boolean value) { mini = value; invalidate(); }
    void state(String id) { if (target.equals(id)) return; select(id, false); }
    void replay(String id) { select(id, true); }

    private void select(String id, boolean replay) {
        JSONObject clips = animation.optJSONObject("clips");
        if (clips == null) return;
        final String next = clips.has(id) ? id : "loading";
        target = next;
        JSONObject clip = clips.optJSONObject(next);
        String name = clip.optString("sheet");
        JSONObject spec = animation.optJSONObject("sheets").optJSONObject(name);
        final int ticket = ++request;
        if (sheet != null && sheetName.equals(name)) { apply(next, clip, spec, sheet, name, replay); return; }
        Context context = getContext().getApplicationContext();
        JSONObject hq = highQuality.optJSONObject(name);
        if (hq != null) {
            final String file = hq.optJSONArray("pages").optString(0);
            HQFrames.load(context, file, () -> post(() -> {
                if (ticket != request) return;
                Bitmap ready = HQFrames.get(file);
                if (ready != null) { hqSpec = hq; lastIndex = 0; apply(next, clip, spec, ready, name, replay); }
                else loadOriginal(context, next, clip, spec, name, replay, ticket);
            }));
            return;
        }
        loadOriginal(context, next, clip, spec, name, replay, ticket);
    }

    private void loadOriginal(Context context, String next, JSONObject clip, JSONObject spec, String name, boolean replay, int ticket) {
        decoder.execute(() -> {
            Bitmap image = cache.get(name);
            if (image == null) {
                try (InputStream input = context.getAssets().open("web/assets/frames/" + spec.optString("file"))) {
                    BitmapFactory.Options options = new BitmapFactory.Options(); options.inScaled = false;
                    image = BitmapFactory.decodeStream(input, null, options);
                    if (image != null) cache.put(name, image);
                } catch (Exception error) { android.util.Log.e("NiulaiPet", "Animation image unavailable", error); }
            }
            final Bitmap ready = image;
            post(() -> { if (ticket == request && ready != null) { hqSpec = null; apply(next, clip, spec, ready, name, replay); } });
        });
    }

    private void apply(String id, JSONObject clip, JSONObject spec, Bitmap image, String name, boolean replay) {
        boolean preserve = sheetName.equals(name) && !replay;
        sheet = image; sheetName = name;
        if (preserve) player.alias(id);
        else player.state(id, spec.optInt("duration", 1000), clip.optInt("rest", 1200), SystemClock.uptimeMillis(), replay);
        invalidate();
    }

    void configure(boolean visible, boolean animate) {
        if (active == visible && motion == animate) return;
        active = visible; motion = animate;
        player.pause(!visible || !animate, SystemClock.uptimeMillis());
        invalidate();
    }

    @Override protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        if (sheet == null) return;
        int index = player.frame(SystemClock.uptimeMillis(), motion, hqSpec == null ? 24 : hqSpec.optInt("count", 24));
        int columns = hqSpec == null ? 6 : 4;
        if (hqSpec != null) {
            JSONArray files = hqSpec.optJSONArray("pages");
            int page = index / 16;
            String file = files.optString(page);
            Bitmap ready = HQFrames.get(file);
            if (ready != null) { sheet = ready; lastIndex = index % 16; }
            else HQFrames.load(getContext(), file, this::postInvalidate);
            HQFrames.load(getContext(), files.optString((page + 1) % files.length()), null);
            index = lastIndex;
        }
        int width = sheet.getWidth() / columns, height = sheet.getHeight() / 4;
        source.set(index % columns * width, index / columns * height, (index % columns + 1) * width, (index / columns + 1) * height);
        float size = mini ? Math.min(getWidth() * 1.04f, getHeight() * 1.08f) : Math.min(getWidth() * .94f, getHeight() * .96f);
        float x = (getWidth() - size) / 2, y = getHeight() - size - getHeight() * .01f;
        destination.set(x, y, x + size, y + size);
        canvas.drawBitmap(sheet, source, destination, paint);
        if (active && motion && getWindowVisibility() == VISIBLE && isShown()) {
            if (mini) postInvalidateDelayed(32); else postInvalidateOnAnimation();
        }
    }

    @Override protected void onVisibilityChanged(View changed, int visibility) { super.onVisibilityChanged(changed, visibility); if (visibility == VISIBLE) invalidate(); }
    @Override protected void onDetachedFromWindow() { super.onDetachedFromWindow(); request++; }
    @Override protected void onAttachedToWindow() { super.onAttachedToWindow(); if (sheet == null) select(target.isEmpty() ? "idle" : target, false); }
}
