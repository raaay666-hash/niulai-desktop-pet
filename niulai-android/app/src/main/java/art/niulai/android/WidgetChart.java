package art.niulai.android;

import android.graphics.*;
import org.json.JSONArray;
import org.json.JSONObject;

final class WidgetChart {
    static Bitmap draw(JSONArray history, int color) {
        Bitmap bitmap = Bitmap.createBitmap(600, 80, Bitmap.Config.ARGB_8888);
        if (history.length() < 2) return bitmap;
        double min = Double.POSITIVE_INFINITY, max = Double.NEGATIVE_INFINITY;
        for (int i = 0; i < history.length(); i++) {
            double price = history.optJSONObject(i).optDouble("price");
            min = Math.min(min, price); max = Math.max(max, price);
        }
        double range = Math.max(max - min, Math.max(max * .0003, .00001));
        Canvas canvas = new Canvas(bitmap);
        Path line = new Path(), fill = new Path();
        for (int i = 0; i < history.length(); i++) {
            float x = 3 + 594f * i / (history.length() - 1);
            double padding=(range-(max-min))/2;
            float y = 12 + (float)((max + padding - history.optJSONObject(i).optDouble("price")) / range) * 52;
            if (i == 0) { line.moveTo(x, y); fill.moveTo(x, 80); fill.lineTo(x, y); }
            else { line.lineTo(x, y); fill.lineTo(x, y); }
        }
        fill.lineTo(597, 80); fill.close();
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setShader(new LinearGradient(0, 0, 0, 80, (color & 0xffffff) | 0x40000000, color & 0xffffff, Shader.TileMode.CLAMP));
        canvas.drawPath(fill, paint);
        paint.setShader(null); paint.setColor(color); paint.setStrokeWidth(3);
        paint.setStyle(Paint.Style.STROKE); paint.setStrokeCap(Paint.Cap.ROUND);
        canvas.drawPath(line, paint);
        return bitmap;
    }

    static JSONArray append(JSONArray old, long received, double price) {
        JSONArray next = new JSONArray();
        long last = old.length() == 0 ? 0 : old.optJSONObject(old.length() - 1).optLong("received");
        for (int i = Math.max(0, old.length() - 39); i < old.length(); i++) {
            JSONObject point = old.optJSONObject(i);
            if (point != null && point.optDouble("price") > 0 && received - point.optLong("received") <= 1200000) next.put(point);
        }
        if (received - last >= 5000 || next.length() == 0) {
            try { next.put(new JSONObject().put("price", price).put("received", received)); } catch (Exception ignored) { }
        }
        return next;
    }
}
