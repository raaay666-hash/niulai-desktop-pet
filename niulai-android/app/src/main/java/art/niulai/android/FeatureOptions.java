package art.niulai.android;

import org.json.JSONException;
import org.json.JSONObject;

final class FeatureOptions {
    private static final String[] DEFAULT_ON = {
        "petQuote", "petHideInApp", "autoActions", "muyuEffects", "muyuCount",
        "islandPrice", "islandPercent", "islandBull", "islandCount",
        "islandHideInApp", "islandMotion", "islandAutoCollapse", "widgetSparkline", "widgetBull"
    };
    private static final String[] DEFAULT_OFF = {
        "petEnabled", "muyuSound", "islandEnabled", "islandHoldings", "islandCameraInteraction"
    };

    static void copy(JSONObject from, JSONObject to) throws JSONException {
        for (String key : DEFAULT_ON) to.put(key, from.optBoolean(key, true));
        for (String key : DEFAULT_OFF) to.put(key, from.optBoolean(key, false));
        to.put("petMode", "muyu".equals(from.optString("petMode")) ? "muyu" : "market");
        to.put("islandContent", "muyu".equals(from.optString("islandContent")) ? "muyu" : "market");
        to.put("widgetTheme", theme(from.optString("widgetTheme"), "system"));
        to.put("islandTheme", theme(from.optString("islandTheme"), "dark"));
        to.put("islandWidth", bounded(from, "islandWidth", 264, 200, 360));
        to.put("islandOffsetX", bounded(from, "islandOffsetX", 0, -160, 160));
        to.put("islandOffsetY", bounded(from, "islandOffsetY", 0, -24, 160));
        String placement = from.optString("islandPlacement", "auto");
        to.put("islandPlacement", placement.equals("manual") || placement.equals("below") ? placement : "auto");
        to.put("islandCameraX", bounded(from, "islandCameraX", 50, 0, 100));
        to.put("islandCameraWidth", bounded(from, "islandCameraWidth", 24, 12, 200));
        to.put("islandCameraHeight", bounded(from, "islandCameraHeight", 28, 12, 80));
        int interval = from.optInt("islandInterval", 5);
        to.put("islandInterval", interval == 10 || interval == 30 ? interval : 5);
        String symbol = from.optString("islandSymbol", "");
        to.put("islandSymbol", NativeMarket.valid(symbol) ? symbol : "");
    }

    private static int bounded(JSONObject source, String key, int fallback, int min, int max) {
        return Math.max(min, Math.min(max, source.optInt(key, fallback)));
    }

    private static String theme(String value, String fallback) {
        return value.equals("light") || value.equals("dark") || value.equals("system") ? value : fallback;
    }
}
