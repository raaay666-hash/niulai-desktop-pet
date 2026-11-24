package art.niulai.android;
import android.content.*;
import org.json.*;

final class PetConfig {
    static SharedPreferences prefs(Context c) { return c.getSharedPreferences("pet", Context.MODE_PRIVATE); }
    static boolean configure(Context c, String raw) {
        if (raw == null || raw.length() > 32768) return false;
        try { return configure(c, new JSONObject(raw)); } catch (Exception e) { return false; }
    }
    static boolean configure(Context c, JSONObject incoming) {
        if (incoming == null) return false;
        try {
            String symbol = incoming.optString("symbol"); if (!QuoteGateway.symbol(symbol)) return false;
            JSONObject safe = new JSONObject(); safe.put("symbol", symbol); String rawName = incoming.optString("name", symbol);
            safe.put("name", rawName.substring(0, Math.min(50, rawName.length())));
            safe.put("sound", incoming.optBoolean("sound", false)); safe.put("haptic", incoming.optBoolean("haptic", true)); safe.put("motion", incoming.optBoolean("motion", true));
            int interval = incoming.optInt("interval", 10);
            safe.put("interval", interval == 1 || interval == 3 || interval == 5 ? 5 : interval == 30 ? 30 : 10);
            safe.put("private", incoming.optBoolean("private", true)); safe.put("scene", Math.floorMod(incoming.optInt("scene", 0), 4));
            if (!safe.optBoolean("private")) { double cost=incoming.optDouble("cost",0),shares=incoming.optDouble("shares",0); if(cost>0&&cost<=1e9&&shares>0&&shares<=1e12){safe.put("cost",cost);safe.put("shares",shares);} }
            FeatureOptions.copy(incoming,safe);
            String theme = incoming.optString("theme", "system");
            safe.put("theme", theme.equals("light") || theme.equals("dark") ? theme : "system");
            prefs(c).edit().putString("config", safe.toString()).apply(); return true;
        } catch (Exception e) { return false; }
    }
    static void pruneHistory(Context c, JSONObject state) {
        try {
            JSONArray stocks = state.optJSONArray("stocks");
            java.util.HashSet<String> keep = new java.util.HashSet<>();
            if (stocks != null) for (int i = 0; i < stocks.length(); i++) {
                JSONObject s = stocks.optJSONObject(i);
                if (s != null) keep.add("history_" + s.optString("code"));
            }
            SharedPreferences p = prefs(c);
            SharedPreferences.Editor editor = null;
            for (String key : p.getAll().keySet()) {
                if (key.startsWith("history_") && !keep.contains(key)) {
                    if (editor == null) editor = p.edit();
                    editor.remove(key);
                }
            }
            if (editor != null) editor.apply();
        } catch (Exception ignored) {}
    }
    static String json(Context c) { return prefs(c).getString("config", "{\"symbol\":\"s_sh000001\",\"name\":\"上证指数\",\"interval\":10,\"private\":true}"); }
    private static JSONObject object(Context c,String key) {
        try { return new JSONObject(prefs(c).getString(key,"{}")); }
        catch (JSONException ignored) { return new JSONObject(); }
    }
    static JSONObject snapshot(Context c,String code) {
        JSONObject selected=object(c,"quote");
        JSONObject saved=object(c,"watch_quotes").optJSONObject(code);
        if(code.equals(selected.optString("code"))&&(saved==null||selected.optLong("received")>=saved.optLong("received")))return selected;
        return saved!=null? saved : new JSONObject();
    }
    static synchronized void cacheWatch(Context c,String raw) {
        if(raw==null||raw.length()>16000)return;
        try {
            JSONObject state=AppState.load(c), old=object(c,"watch_quotes"), next=new JSONObject();
            JSONArray stocks=state.getJSONArray("stocks"), quotes=new JSONArray(raw);
            for(int i=0;i<stocks.length();i++){
                String code=stocks.getJSONObject(i).getString("code");
                JSONObject snapshot=old.optJSONObject(code);
                if(snapshot!=null)next.put(code,snapshot);
            }
            long now=System.currentTimeMillis();
            for(int i=0;i<Math.min(20,quotes.length());i++){
                JSONObject quote=quotes.optJSONObject(i);
                if(quote==null)continue;
                String code=quote.optString("code");
                double price=quote.optDouble("price"),change=quote.optDouble("changePct");
                long received=quote.optLong("received",0);
                JSONObject previous=next.optJSONObject(code);
                if(AppState.stock(state,code)==null||!Double.isFinite(price)||price<=0||
                    received<=0||received>now+60000||previous!=null&&received<previous.optLong("received"))continue;
                JSONObject snapshot=new JSONObject();
                snapshot.put("code",code).put("price",price).put("received",received);
                if(Double.isFinite(change))snapshot.put("changePct",change);
                next.put(code,snapshot);
            }
            prefs(c).edit().putString("watch_quotes",next.toString()).apply();
            StackWidgetProvider.refreshThrottled(c);
        } catch (JSONException ignored) {}
    }
    static synchronized void cache(Context c, String raw) {
        if (raw == null || raw.length() > 8192) return;
        try {
            JSONObject q = new JSONObject(raw), config = new JSONObject(json(c));
            if (!QuoteGateway.symbol(q.optString("code")) || !config.optString("symbol").equals(q.optString("code")) || !(q.optDouble("price", 0) > 0)) return;
            JSONObject safe = new JSONObject(); safe.put("code", q.getString("code")); safe.put("name", q.optString("name")); safe.put("price", q.getDouble("price"));
            double changePct = q.optDouble("changePct", Double.NaN);
            if (Double.isFinite(changePct)) safe.put("changePct", changePct);
            long now = System.currentTimeMillis();
            long received = q.optLong("received", now);
            safe.put("received", received); safe.put("sourceTime", q.optString("time"));
            JSONObject old=new JSONObject(prefs(c).getString("quote","{}"));
            long previousReceived = old.optLong("received");
            if (safe.getString("code").equals(old.optString("code")) && received < previousReceived && previousReceived <= now) return;
            prefs(c).edit().putString("quote", safe.toString()).putString("history_"+safe.getString("code"),WidgetChart.append(StackWidgetProvider.history(c,safe.getString("code")),received,safe.optDouble("price")).toString()).apply();
            if(!old.optString("code").equals(safe.optString("code")))StackWidgetProvider.refreshAll(c);else StackWidgetProvider.refreshThrottled(c);
        } catch (Exception ignored) {}
    }
}
