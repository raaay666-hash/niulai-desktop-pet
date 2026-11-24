package art.niulai.android;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.os.SystemClock;
import android.view.View;
import java.util.ArrayList;

final class TapFeedback extends View {
    private static final class Pulse {
        final float x, y;
        final long start = SystemClock.uptimeMillis();
        Pulse(float x, float y) { this.x = x; this.y = y; }
    }
    private final ArrayList<Pulse> pulses = new ArrayList<>();
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private int sequence;

    TapFeedback(Context context) { super(context); setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO); }

    void tap(float x, float y) {
        if (pulses.size() >= 8) pulses.remove(0);
        pulses.add(new Pulse(x, (sequence++ % 3) * 7));
        invalidate();
    }

    void clear() { pulses.clear(); invalidate(); }

    @Override protected void onDraw(Canvas canvas) {
        float density = getResources().getDisplayMetrics().density;
        long now = SystemClock.uptimeMillis();
        for (int i = pulses.size() - 1; i >= 0; i--) {
            Pulse pulse = pulses.get(i);
            float progress = (now - pulse.start) / 720f;
            if (progress >= 1) { pulses.remove(i); continue; }
            paint.setColor(0xffef4c55);
            float alpha = Math.min(1, progress / .12f) * Math.min(1, (1 - progress) / .35f);
            paint.setAlpha(Math.round(alpha * 255));
            paint.setStyle(Paint.Style.FILL);
            paint.setTextAlign(Paint.Align.RIGHT);
            paint.setTextSize(Math.min(density * 14, Math.min(getWidth() / 7.7f, Math.max(density * 10, getHeight() * .34f))));
            paint.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
            boolean compact = getHeight() < density * 72;
            float baseline = compact
                ? getHeight() - density * 9 + (pulse.y % 6) * density * .4f
                : Math.max(density * 16, getHeight() * .23f) + density * pulse.y;
            float rise = compact ? Math.min(density * 18, Math.max(density * 8, getHeight() * .38f)) : density * 30;
            canvas.drawText("牛气➕1 📈", getWidth() - density * 7, baseline - rise * progress, paint);
        }
        if (!pulses.isEmpty() && isShown()) postInvalidateDelayed(32);
    }
}
