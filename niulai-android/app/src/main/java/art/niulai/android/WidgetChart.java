package art.niulai.android;

import android.graphics.*;
import org.json.JSONArray;
import org.json.JSONObject;

final class WidgetChart {
    static Bitmap draw(JSONArray history, int color) {
        Bitmap bitmap = Bitmap.createBitmap(600, 80, Bitmap.Config.ARGB_8888);
        if (history == null || history.length() < 2) return bitmap;
        double[] prices = new double[history.length()];
        int count = 0;
        double min = Double.POSITIVE_INFINITY, max = Double.NEGATIVE_INFINITY;
        for (int i = 0; i < history.length(); i++) {
            JSONObject item = history.optJSONObject(i);
            if (item == null) continue;
            double price = item.optDouble("price", Double.NaN);
            if (!Double.isFinite(price) || price <= 0) continue;
            prices[count++] = price;
            min = Math.min(min, price); max = Math.max(max, price);
        }
        if (count < 2) return bitmap;
        double range = Math.max(max - min, Math.max(max * .0003, .00001));
        Canvas canvas = new Canvas(bitmap);
        Path line = new Path(), fill = new Path();
        double padding = (range - (max - min)) / 2;
        for (int i = 0; i < count; i++) {
            float x = 3 + 594f * i / (count - 1);
            float y = 12 + (float)((max + padding - prices[i]) / range) * 52;
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
        if (!Double.isFinite(price) || price <= 0) return old != null ? old : next;
        int len = old == null ? 0 : old.length();
        JSONObject lastPoint = len == 0 ? null : old.optJSONObject(len - 1);
        long last = lastPoint == null ? 0 : lastPoint.optLong("received");
        for (int i = Math.max(0, len - 39); i < len; i++) {
            JSONObject point = old.optJSONObject(i);
            if (point == null) continue;
            double value = point.optDouble("price", Double.NaN);
            long age = received - point.optLong("received");
            if (Double.isFinite(value) && value > 0 && age >= 0 && age <= 1200000) next.put(point);
        }
        if (received - last >= 5000 || received < last || next.length() == 0) {
            try { next.put(new JSONObject().put("price", price).put("received", received)); } catch (Exception ignored) { }
        }
        return next;
    }
}
