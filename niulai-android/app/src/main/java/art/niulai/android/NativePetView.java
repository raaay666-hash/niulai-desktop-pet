package art.niulai.android;

import android.content.Context;
import android.content.res.AssetFileDescriptor;
import android.graphics.drawable.GradientDrawable;
import android.media.MediaPlayer;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.widget.*;
import java.text.SimpleDateFormat;
import java.util.*;
import org.json.JSONObject;

final class NativePetView extends FrameLayout {
    interface Actions { void open(); void collapse(); void stop(); }
    private final TextView name, price, status, bubble, open, collapse, stop;
    private final NativeBullView bull;
    private final LinearLayout quote;
    private final TapFeedback feedback;
    private final MuyuSound woodSound;
    private final MarketMood moods = new MarketMood();
    private JSONObject config = new JSONObject();
    private NativeMarket.Quote current;
    private String error;
    private MediaPlayer player;
    private boolean active = true, collapsed;
    private long previewUntil, lastTap;
    private int taps;
    private final float scale;
    private final Runnable hideBubble = this::hideBubble;
    private final Runnable moodTick = new Runnable() {
        public void run() { refreshMood(); if (active) postDelayed(this, 1000); }
    };

    NativePetView(Context context, Actions actions) {
        super(context);
        setClipChildren(false);
        scale = Math.min(1.3f, Math.max(1f, getResources().getConfiguration().fontScale));
        woodSound = new MuyuSound(context);
        LinearLayout toolbar = new LinearLayout(context);
        toolbar.setGravity(Gravity.RIGHT | Gravity.CENTER_VERTICAL);
        toolbar.setPadding(dp(4), 0, dp(4), 0);
        open = tool("↗", "打开牛来盯盘", actions::open);
        collapse = tool("−", "收起桌宠", actions::collapse);
        stop = tool("×", "关闭桌宠", actions::stop);
        toolbar.addView(open, new LinearLayout.LayoutParams(dp(28), dp(28)));
        toolbar.addView(new View(context), new LinearLayout.LayoutParams(0, 1, 1));
        LinearLayout.LayoutParams gap = new LinearLayout.LayoutParams(dp(28), dp(28));
        gap.rightMargin = dp(3);
        toolbar.addView(collapse, gap);
        toolbar.addView(stop, new LinearLayout.LayoutParams(dp(28), dp(28)));
        addView(toolbar, new FrameLayout.LayoutParams(-1, dp(28), Gravity.TOP));
        quote = new LinearLayout(context);
        quote.setOrientation(LinearLayout.VERTICAL);
        quote.setPadding(dp(9), dp(5), dp(9), dp(4));
        name = label("牛来盯盘", 10, 0xff282925);
        price = label("—", 15, 0xffcc4148);
        price.setTypeface(null, 1);
        status = label("正在连接", 9, 0xff74766f);
        quote.addView(name); quote.addView(price); quote.addView(status);
        quote.setOnClickListener(v -> { if (muyu()) interact(); else actions.open(); });
        quote.setContentDescription("打开当前股票行情");
        FrameLayout.LayoutParams quoteParams = new FrameLayout.LayoutParams(-1, dp(65), Gravity.TOP);
        quoteParams.topMargin = dp(32);
        quoteParams.leftMargin = quoteParams.rightMargin = dp(3);
        addView(quote, quoteParams);
        bull = new NativeBullView(context);
        bull.setContentDescription("摸摸牛来");
        bull.setOnClickListener(v -> interact());
        FrameLayout.LayoutParams bullParams = new FrameLayout.LayoutParams(-1, dp(126), Gravity.BOTTOM);
        bullParams.leftMargin = bullParams.rightMargin = dp(6);
        addView(bull, bullParams);
        bubble = label("牛来", 11, 0xff74766f);
        bubble.setGravity(Gravity.CENTER);
        bubble.setVisibility(GONE);
        FrameLayout.LayoutParams bubbleParams = new FrameLayout.LayoutParams(-1, dp(28), Gravity.TOP);
        bubbleParams.topMargin = dp(96);
        bubbleParams.leftMargin = bubbleParams.rightMargin = dp(5);
        addView(bubble, bubbleParams);
        feedback = new TapFeedback(context);
        addView(feedback, new FrameLayout.LayoutParams(-1, -1));
    }

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density * scale); }
    private boolean muyu() { return "muyu".equals(config.optString("petMode")); }
    private boolean cardVisible() { return !collapsed && (muyu() ? config.optBoolean("muyuCount", true) : config.optBoolean("petQuote", true)); }
    int desiredWidth() { return dp(collapsed ? 86 : 174); }
    int desiredHeight() { return dp(collapsed ? 112 : cardVisible() ? 224 : 154); }

    private GradientDrawable background(int color, int radius) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(color); drawable.setCornerRadius(dp(radius)); return drawable;
    }

    private TextView label(String value, int size, int color) {
        TextView view = new TextView(getContext());
        view.setText(value); view.setTextColor(color);
        view.setTextSize(TypedValue.COMPLEX_UNIT_DIP, size * scale);
        view.setSingleLine(true); view.setEllipsize(android.text.TextUtils.TruncateAt.END);
        return view;
    }

    private TextView tool(String value, String description, Runnable callback) {
        TextView view = label(value, 18, 0xff74766f);
        view.setGravity(Gravity.CENTER); view.setContentDescription(description);
        view.setOnClickListener(v -> callback.run()); return view;
    }

    void configure(JSONObject next) {
        if (!next.optString("symbol").equals(config.optString("symbol"))) {
            moods.reset(); current = null; error = null; previewUntil = 0;
        }
        config = next;
        boolean dark = Appearance.dark(getContext(), config.optString("theme", "system"));
        int surface = dark ? 0xf51b202b : 0xf5ffffff;
        int ink = dark ? 0xffeeefe8 : 0xff282925;
        int muted = dark ? 0xffa0a498 : 0xff74766f;
        quote.setBackground(background(surface, 14));
        name.setTextColor(ink); status.setTextColor(muted);
        bubble.setTextColor(ink); bubble.setBackground(background(dark ? 0xee292f3c : 0xeeeff3f9, 10));
        for (TextView tool : new TextView[]{open, collapse, stop}) {
            tool.setTextColor(muted); tool.setBackground(background(dark ? 0xee292f3c : 0xeeeff3f9, 30));
        }
        if (!config.optBoolean("sound")) stopAudio();
        if (!config.optBoolean("muyuSound")) woodSound.stop();
        collapsed(collapsed);
        updateAnimation();
    }

    void collapsed(boolean value) {
        collapsed = value;
        quote.setVisibility(cardVisible() ? VISIBLE : GONE);
        open.setVisibility(value ? GONE : VISIBLE);
        stop.setVisibility(value ? GONE : VISIBLE);
        collapse.setText(value ? "+" : "−");
        collapse.setContentDescription(value ? "展开桌宠" : "收起桌宠");
        FrameLayout.LayoutParams params = (FrameLayout.LayoutParams)bull.getLayoutParams();
        params.height = dp(value ? 84 : 126); bull.setLayoutParams(params);
        FrameLayout.LayoutParams note = (FrameLayout.LayoutParams)bubble.getLayoutParams();
        note.topMargin = dp(cardVisible() ? 96 : 30); bubble.setLayoutParams(note);
    }

    void update(NativeMarket.Quote quote, String failure) { current = quote; error = failure; refreshMood(); }
    void countsChanged() { if (muyu()) refreshMood(); }

    void active(boolean value) {
        active = value;
        if (!value) { stopAudio(); woodSound.stop(); feedback.clear(); }
        updateAnimation();
    }

    private void updateAnimation() {
        removeCallbacks(moodTick);
        bull.configure(active, config.optBoolean("motion", true) && getResources().getConfiguration().fontScale < 2);
        refreshMood();
        if (active) postDelayed(moodTick, 1000);
    }

    private void refreshMood() {
        if (muyu()) {
            JSONObject counts = MuyuStore.read(getContext());
            name.setText("牛来木鱼");
            price.setText("本轮 " + counts.optLong("session"));
            price.setTextColor(0xffc59246);
            status.setText("今日 " + counts.optLong("today") + " · 累计 " + counts.optLong("total"));
            if (System.currentTimeMillis() >= previewUntil) bull.state("muyu");
            return;
        }
        String symbol = config.optString("symbol", "s_sh000001");
        boolean valid = current != null && current.code.equals(symbol);
        String id = moods.update(symbol, valid ? current.price : 0, valid ? current.pct : 0,
            valid ? current.received : 0, valid, error != null, System.currentTimeMillis(), config.optInt("interval", 10));
        if (!config.optBoolean("autoActions", true)) id = "idle";
        if (System.currentTimeMillis() >= previewUntil) bull.state(id);
        name.setText(valid ? current.name : config.optString("name", "牛来盯盘"));
        price.setText(!valid ? "—" : String.format(Locale.US,
            current.code.startsWith("rt_hk") ? "%,.3f %+.2f%%" : "%,.2f %+.2f%%", current.price, current.pct));
        boolean dark = Appearance.dark(getContext(), config.optString("theme", "system"));
        price.setTextColor(valid && current.pct < 0 ? dark ? 0xff63c5a6 : 0xff22836d : dark ? 0xfffa8086 : 0xffcc4148);
        String label = NativeBullView.label(getContext(), id);
        status.setText(!valid ? label : label + " · 获取 " + new SimpleDateFormat("HH:mm", Locale.CHINA).format(new Date(current.received)));
    }

    private void interact() {
        if (!active) return;
        if (config.optBoolean("haptic", true)) AndroidCompat.vibrate(getContext());
        if (muyu()) {
            MuyuStore.tap(getContext());
            bull.replay("muyu");
            if (config.optBoolean("muyuSound")) woodSound.play();
            if (config.optBoolean("muyuEffects", true) && config.optBoolean("motion", true)) feedback.tap(getWidth() * .5f, getHeight() * .73f);
            refreshMood(); return;
        }
        long now = System.currentTimeMillis();
        taps = now - lastTap < 1100 ? taps + 1 : 1; lastTap = now;
        String action = taps >= 3 ? "scratch" : taps % 2 == 0 ? "nod" : "wave";
        if (taps >= 3) taps = 0;
        previewUntil = now + 3200;
        bull.replay(action);
        bubble.setText(NativeBullView.label(getContext(), action)); bubble.setVisibility(VISIBLE);
        removeCallbacks(hideBubble); postDelayed(hideBubble, 1800);
        if (config.optBoolean("sound")) playVoice();
    }

    private void hideBubble() { bubble.setVisibility(GONE); }

    void preview(String id) {
        if (id == null || NativeBullView.label(getContext(), id).isEmpty()) return;
        previewUntil = System.currentTimeMillis() + 6000;
        bull.replay(id); bubble.setText("预览 · " + NativeBullView.label(getContext(), id)); bubble.setVisibility(VISIBLE);
        removeCallbacks(hideBubble); postDelayed(hideBubble, 6000);
    }

    private void playVoice() {
        stopAudio();
        try (AssetFileDescriptor file = getContext().getAssets().openFd("web/assets/" + (current != null && current.pct < 0 ? "mama.mp3" : "niulai.mp3"))) {
            player = new MediaPlayer();
            player.setDataSource(file.getFileDescriptor(), file.getStartOffset(), file.getLength());
            player.setOnCompletionListener(p -> stopAudio());
            player.setOnErrorListener((p, a, b) -> { stopAudio(); return true; });
            player.prepare(); player.start();
        } catch (Exception e) { stopAudio(); }
    }

    private void stopAudio() { if (player != null) { player.release(); player = null; } }
    void close() {
        active = false; removeCallbacks(moodTick); removeCallbacks(hideBubble);
        stopAudio(); woodSound.close(); feedback.clear(); bull.configure(false, false);
    }
}
