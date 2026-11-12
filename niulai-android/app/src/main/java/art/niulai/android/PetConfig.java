package art.niulai.android;
import android.content.*;
import org.json.*;

final class PetConfig {
    static SharedPreferences prefs(Context c) { return c.getSharedPreferences("pet", Context.MODE_PRIVATE); }
    static boolean configure(Context c, String raw) {
        if (raw == null || raw.length() > 8192) return false;
        try {
            JSONObject incoming = new JSONObject(raw); String symbol = incoming.optString("symbol"); if (!QuoteGateway.symbol(symbol)) return false;
            JSONObject safe = new JSONObject(); safe.put("symbol", symbol); safe.put("name", incoming.optString("name", symbol).substring(0, Math.min(50, incoming.optString("name", symbol).length())));
            safe.put("sound", incoming.optBoolean("sound", false)); safe.put("haptic", incoming.optBoolean("haptic", true)); safe.put("motion", incoming.optBoolean("motion", true));
            int interval = incoming.optInt("interval", 10); safe.put("interval", interval == 5 || interval == 30 ? interval : 10);
            safe.put("private", incoming.optBoolean("private", true)); safe.put("scene", incoming.optInt("scene", 0) % 4);
            if (!safe.optBoolean("private")) { double cost=incoming.optDouble("cost",0),shares=incoming.optDouble("shares",0); if(cost>0&&cost<=1e9&&shares>0&&shares<=1e12){safe.put("cost",cost);safe.put("shares",shares);} }
            FeatureOptions.copy(incoming,safe);safe.put("theme",incoming.optString("theme","system"));
            prefs(c).edit().putString("config", safe.toString()).apply(); return true;
        } catch (Exception e) { return false; }
    }
    static String json(Context c) { return prefs(c).getString("config", "{\"symbol\":\"s_sh000001\",\"name\":\"上证指数\",\"interval\":10,\"private\":true}"); }
    static void cache(Context c, String raw) {
        if (raw == null || raw.length() > 8192) return;
        try {
            JSONObject q = new JSONObject(raw), config = new JSONObject(json(c));
            if (!QuoteGateway.symbol(q.optString("code")) || !config.optString("symbol").equals(q.optString("code")) || !(q.optDouble("price", 0) > 0)) return;
            JSONObject safe = new JSONObject(); safe.put("code", q.getString("code")); safe.put("name", q.optString("name")); safe.put("price", q.getDouble("price")); safe.put("changePct", q.getDouble("changePct")); safe.put("received", q.optLong("received", System.currentTimeMillis())); safe.put("sourceTime", q.optString("time"));
            JSONObject old=new JSONObject(prefs(c).getString("quote","{}"));
            prefs(c).edit().putString("quote", safe.toString()).putString("history_"+safe.getString("code"),WidgetChart.append(StackWidgetProvider.history(c,safe.getString("code")),safe.optLong("received"),safe.optDouble("price")).toString()).apply();
            if(!old.optString("code").equals(safe.optString("code")))StackWidgetProvider.refreshAll(c);else StackWidgetProvider.refreshThrottled(c);
        } catch (Exception ignored) {}
    }
}
