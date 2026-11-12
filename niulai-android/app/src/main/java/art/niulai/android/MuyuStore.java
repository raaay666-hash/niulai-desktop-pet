package art.niulai.android;

import android.content.Context;
import android.content.SharedPreferences;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import org.json.JSONObject;

/** Counts are independent of screen settings so a stale WebView cannot overwrite a tap. */
final class MuyuStore {
    static final String CHANGED = "art.niulai.COUNTS_CHANGED";
    private static final long MAX_COUNT = 9007199254740991L;

    static synchronized JSONObject read(Context context) { return change(context, false, false); }
    static synchronized JSONObject tap(Context context) { return change(context, true, false); }
    static synchronized JSONObject newRound(Context context) { return change(context, false, true); }

    private static JSONObject change(Context context, boolean tap, boolean reset) {
        SharedPreferences prefs = PetConfig.prefs(context);
        String day = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
        long total = Math.max(0, prefs.getLong("muyu_total", 0));
        long today = day.equals(prefs.getString("muyu_day", "")) ? Math.max(0, prefs.getLong("muyu_today", 0)) : 0;
        long session = reset ? 0 : Math.max(0, prefs.getLong("muyu_session", 0));
        if (tap) {
            total = Math.min(MAX_COUNT, total + 1);
            today = Math.min(MAX_COUNT, today + 1);
            session = Math.min(MAX_COUNT, session + 1);
        }
        if(tap || reset || !day.equals(prefs.getString("muyu_day", "")))prefs.edit().putString("muyu_day", day).putLong("muyu_total", total)
            .putLong("muyu_today", today).putLong("muyu_session", session).apply();
        JSONObject result = new JSONObject();
        try {
            result.put("total", total).put("today", today).put("session", session).put("day", day);
        } catch (Exception ignored) { }
        if (tap || reset) {
            context.sendBroadcast(new android.content.Intent(CHANGED).setPackage(context.getPackageName()));
            StackWidgetProvider.refreshCounter(context);
        }
        return result;
    }
}
