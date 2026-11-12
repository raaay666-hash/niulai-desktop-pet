package art.niulai.android;

import android.content.Context;
import android.graphics.drawable.GradientDrawable;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.View;
import android.view.MotionEvent;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import org.json.JSONObject;

final class NativeIslandView extends FrameLayout {
    interface Actions {
        void expand(); void open(); void previous(); void next(); void close(); void knock();
    }

    private final Actions actions;
    private final MarketMood moods = new MarketMood();
    private final TapFeedback feedback;
    private JSONObject config = new JSONObject();
    private NativeMarket.Quote quote;
    private String error;
    private boolean expanded, active = true;
    private TextView title, compactPrice, compactDelta, mainValue, detail, source, holding;
    private NativeBullView bull, miniBull;
    private int ink, muted, surface, accent;
    private LinearLayout headerLeft, headerRight;
    private View headerGap;
    private boolean fused;
    private int gapLeft, gapRight, windowX;
    private float downX, downY;
    private long downTime;

    void cameraLayout(IslandGeometry.Layout layout) {
        boolean changed = fused != layout.fused;
        fused = layout.fused;
        gapLeft = layout.x + layout.gapLeft; gapRight = layout.x + layout.gapRight;
        windowX = layout.x;
        if (changed) rebuild();
        layoutHeader();
    }

    void cameraWindowX(int value) { windowX = value; layoutHeader(); }

    private void layoutHeader() {
        if (headerLeft == null || headerGap == null) return;
        int gap = Math.max(0, gapRight - gapLeft);
        if (gap == 0) {
            headerGap.setVisibility(GONE);
            headerLeft.setLayoutParams(new LinearLayout.LayoutParams(0, -1, 1));
            headerRight.setLayoutParams(new LinearLayout.LayoutParams(dp(92), -1));
        } else {
            headerGap.setVisibility(VISIBLE);
            int left = Math.max(0, gapLeft - windowX - dp(10));
            headerLeft.setLayoutParams(new LinearLayout.LayoutParams(left, -1));
            headerGap.setLayoutParams(new LinearLayout.LayoutParams(gap, -1));
            headerRight.setLayoutParams(new LinearLayout.LayoutParams(0, -1, 1));
        }
    }

    @Override public boolean dispatchTouchEvent(MotionEvent event) {
        if (event.getActionMasked() == MotionEvent.ACTION_DOWN) { downX = event.getRawX(); downY = event.getRawY(); downTime = event.getEventTime(); }
        if (event.getActionMasked() == MotionEvent.ACTION_UP) {
            float dx = event.getRawX() - downX, dy = event.getRawY() - downY;
            boolean swipe = Math.hypot(dx, dy) > dp(24), hold = event.getEventTime() - downTime > 550;
            if (swipe || hold) {
                MotionEvent cancel = MotionEvent.obtain(event); cancel.setAction(MotionEvent.ACTION_CANCEL); super.dispatchTouchEvent(cancel); cancel.recycle();
                if (hold && !swipe) actions.open();
                else if (Math.abs(dx) > Math.abs(dy)) { if (!muyu()) { if (dx < 0) actions.next(); else actions.previous(); } }
                else if (dy > 0 && !expanded || dy < 0 && expanded) actions.expand();
                return true;
            }
        }
        return super.dispatchTouchEvent(event);
    }

    NativeIslandView(Context context, Actions actions) {
        super(context);
        this.actions = actions;
        feedback = new TapFeedback(context);
        rebuild();
    }

    private int dp(float value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    int desiredWidth() { int width=config.optInt("islandWidth",264);return dp(expanded?Math.max(300,width+32):width); }
    int desiredHeight() { return dp(expanded ? 206 : 44); }
    boolean expanded() { return expanded; }

    void expanded(boolean value) { expanded = value; rebuild(); }

    void configure(JSONObject next) {
        config = next;
        rebuild();
    }

    private GradientDrawable background(int color, int radius) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(color);
        drawable.setCornerRadius(dp(radius));
        drawable.setStroke(dp(1), fused ? 0xff000000 : Appearance.dark(getContext(), config.optString("islandTheme", "dark")) ? 0xff393e35 : 0xffe2e5dc);
        return drawable;
    }

    private TextView label(String text, int size, int color) {
        TextView view = new TextView(getContext());
        view.setText(text);
        view.setTextColor(color);
        view.setTextSize(android.util.TypedValue.COMPLEX_UNIT_DIP, size);
        view.setSingleLine(true);
        view.setEllipsize(TextUtils.TruncateAt.END);
        view.setGravity(Gravity.CENTER_VERTICAL);
        return view;
    }

    private TextView button(String text, String description, Runnable click) {
        TextView view = label(text, 12, ink);
        view.setGravity(Gravity.CENTER);
        view.setContentDescription(description);
        view.setOnClickListener(v -> click.run());
        return view;
    }

    private void rebuild() {
        if (bull != null) bull.configure(false, false);
        if (miniBull != null) miniBull.configure(false,false);miniBull=null;bull=null;
        removeAllViews();
        boolean dark = fused || Appearance.dark(getContext(), config.optString("islandTheme", "dark"));
        ink = dark ? 0xffeeefe8 : 0xff282925;
        muted = dark ? 0xffa0a498 : 0xff74766f;
        surface = fused ? 0xff000000 : dark ? 0xff111411 : 0xfffafbf5;
        accent = dark ? 0xffe1a378 : 0xffa6492e;
        setBackground(background(surface, expanded ? 27 : 24));setClipToOutline(true);
        LinearLayout content = new LinearLayout(getContext());
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(10), 0, dp(8), dp(expanded ? 8 : 0));
        addView(content, new FrameLayout.LayoutParams(-1, -1));

        LinearLayout header = new LinearLayout(getContext());
        header.setGravity(Gravity.CENTER_VERTICAL);
        headerLeft = new LinearLayout(getContext()); headerLeft.setGravity(Gravity.CENTER_VERTICAL);
        header.addView(headerLeft, new LinearLayout.LayoutParams(0, -1, 1));
        headerGap = new View(getContext()); header.addView(headerGap, new LinearLayout.LayoutParams(0, -1));
        headerRight = new LinearLayout(getContext()); headerRight.setGravity(Gravity.CENTER_VERTICAL | Gravity.RIGHT);
        header.addView(headerRight, new LinearLayout.LayoutParams(-2, -1));
        if (config.optBoolean("islandBull", true)) {
            NativeBullView icon = new NativeBullView(getContext());
            icon.mini(true);miniBull=icon;
            LinearLayout.LayoutParams iconParams = new LinearLayout.LayoutParams(dp(fused && gapRight > gapLeft ? 24 : 32), dp(34));
            iconParams.rightMargin = dp(3);
            headerLeft.addView(icon, iconParams);
        }
        LinearLayout summary = new LinearLayout(getContext());
        summary.setOrientation(LinearLayout.VERTICAL);
        title = label("牛来", 9, muted);
        compactPrice = label("—", 12, ink);
        compactPrice.setTypeface(null, 1);
        summary.addView(title, new LinearLayout.LayoutParams(-1, dp(16)));
        summary.addView(compactPrice, new LinearLayout.LayoutParams(-1, dp(18)));
        headerLeft.addView(summary, new LinearLayout.LayoutParams(0, -2, 1));
        compactDelta = label("—", 12, ink);
        compactDelta.setTypeface(null, 1);
        headerRight.addView(compactDelta, new LinearLayout.LayoutParams(0, -1, 1));
        TextView toggle = button(expanded ? "×" : "⌄", expanded ? "关闭灵动岛" : "展开灵动岛", expanded ? actions::close : actions::expand);
        headerRight.addView(toggle, new LinearLayout.LayoutParams(dp(22), dp(40)));
        header.setOnClickListener(v -> { if (muyu()) actions.knock(); else actions.expand(); });
        content.addView(header, new LinearLayout.LayoutParams(-1, dp(44)));
        layoutHeader();

        if (expanded) {
            LinearLayout body = new LinearLayout(getContext());
            body.setGravity(Gravity.CENTER_VERTICAL);
            LinearLayout values = new LinearLayout(getContext());
            values.setOrientation(LinearLayout.VERTICAL);
            mainValue = label("—", 24, ink);
            mainValue.setTypeface(null, 1);
            detail = label("", 11, muted);
            holding = label("", 10, muted);
            values.addView(mainValue, new LinearLayout.LayoutParams(-1, dp(35)));
            values.addView(detail, new LinearLayout.LayoutParams(-1, dp(23)));
            values.addView(holding, new LinearLayout.LayoutParams(-1, dp(20)));
            body.addView(values, new LinearLayout.LayoutParams(0, -2, 1));
            if (config.optBoolean("islandBull", true)) {
                bull = new NativeBullView(getContext());
                bull.setContentDescription(muyu() ? "敲木鱼" : "牛来动作");
                bull.setOnClickListener(v -> { if (muyu()) actions.knock(); else actions.open(); });
                body.addView(bull, new LinearLayout.LayoutParams(dp(72), dp(88)));
            }
            content.addView(body, new LinearLayout.LayoutParams(-1, dp(93)));
            source = label("", 9, muted);
            content.addView(source, new LinearLayout.LayoutParams(-1, dp(20)));
            LinearLayout controls = new LinearLayout(getContext());
            String[] labels = muyu() ? new String[]{"敲一下", "打开", "收起"} : new String[]{"上一只", "下一只", "打开", "收起"};
            Runnable[] callbacks = muyu() ? new Runnable[]{actions::knock, actions::open, actions::expand}
                : new Runnable[]{actions::previous, actions::next, actions::open, actions::expand};
            for (int i = 0; i < labels.length; i++) {
                TextView control = button(labels[i], labels[i], callbacks[i]);
                control.setTextColor(accent);
                controls.addView(control, new LinearLayout.LayoutParams(0, dp(36), 1));
            }
            content.addView(controls, new LinearLayout.LayoutParams(-1, dp(36)));
        }
        addView(feedback, new FrameLayout.LayoutParams(-1, -1));
        updateText();
    }

    private boolean muyu() { return "muyu".equals(config.optString("islandContent")); }

    void update(NativeMarket.Quote value, String failure) {
        quote = value;
        error = failure;
        updateText();
    }

    void countsChanged() { updateText(); }

    private void updateText() {
        boolean wood = muyu();
        JSONObject counts = MuyuStore.read(getContext());
        boolean stale = error != null || quote != null && System.currentTimeMillis() - quote.received > 45000;
        title.setText(wood ? "牛来木鱼" : quote == null ? "牛来盯盘" : quote.name);
        compactPrice.setText(wood ? config.optBoolean("islandCount",true) ? "本轮 " + counts.optLong("session") : "轻触敲击" : quote == null ? "连接中" : String.format(Locale.US, "%,.2f", quote.price));
        compactPrice.setVisibility(wood || config.optBoolean("islandPrice", true) ? VISIBLE : GONE);
        compactDelta.setText(wood ? "+1" : quote == null ? "—" : stale ? "更新延迟" : String.format(Locale.US, "%+.2f%%", quote.pct));
        compactDelta.setVisibility(wood || config.optBoolean("islandPercent", true) ? VISIBLE : GONE);
        int quoteColor = quote != null && quote.pct < 0 ? 0xff63c5a6 : 0xfffa8086;
        if (!fused && !Appearance.dark(getContext(), config.optString("islandTheme", "dark"))) quoteColor = quote != null && quote.pct < 0 ? 0xff22836d : 0xffcc4148;
        compactDelta.setTextColor(wood ? 0xffdda961 : stale ? muted : quoteColor);
        String code=quote==null?config.optString("islandSymbol",config.optString("symbol","s_sh000001")):quote.code;if(!NativeMarket.valid(code))code=config.optString("symbol","s_sh000001");
        String motionState = wood ? "muyu" : moods.update(code,quote==null?0:quote.price,quote==null?0:quote.pct,quote==null?0:quote.received,quote!=null,stale,System.currentTimeMillis(),config.optInt("islandInterval",5));
        if(miniBull!=null){miniBull.state(motionState);miniBull.configure(active,config.optBoolean("motion",true)&&config.optBoolean("islandMotion",true));}
        if (!expanded) return;
        mainValue.setText(wood ? config.optBoolean("islandCount",true) ? Long.toString(counts.optLong("session")) : "木鱼" : quote == null ? "—" : config.optBoolean("islandPrice", true) ? String.format(Locale.US, "%,.2f", quote.price) : quote.name);
        mainValue.setTextColor(wood ? ink : quoteColor);
        detail.setText(wood ? "今日 " + counts.optLong("today") + " · 累计 " + counts.optLong("total") : stale ? "更新延迟" : quote == null ? "等待报价" : String.format(Locale.US, "%+.3f  ·  %s", quote.change, NativeMarket.currency(code)));
        detail.setVisibility(!wood || config.optBoolean("islandCount", true) ? VISIBLE : GONE);
        holding.setVisibility(!wood && config.optBoolean("islandHoldings") ? VISIBLE : GONE);
        holding.setText(holdingText());
        source.setText(wood ? "点击敲击 · 本机计数" : quote == null ? "等待行情" : (quote.source.equals("tencent") ? "腾讯" : "新浪") + " · 获取 " + new SimpleDateFormat("HH:mm:ss", Locale.CHINA).format(new Date(quote.received)));
        if (bull != null) {
            
            bull.state(motionState);
            bull.configure(active, config.optBoolean("motion", true) && config.optBoolean("islandMotion", true));
        }
    }

    private String holdingText() {
        if (config.optBoolean("private", true)) return "持仓金额已隐藏";
        if (quote == null) return "等待持仓行情";
        JSONObject state = AppState.load(getContext());
        org.json.JSONArray stocks = state.optJSONArray("stocks");
        if (stocks != null) for (int i = 0; i < stocks.length(); i++) {
            JSONObject stock = stocks.optJSONObject(i);
            if (stock != null && quote.code.equals(stock.optString("code")) && stock.optDouble("shares") > 0) {
                return String.format(Locale.US, "累计 %+.2f %s", (quote.price - stock.optDouble("cost")) * stock.optDouble("shares"), NativeMarket.currency(quote.code));
            }
        }
        return "尚未设置持仓";
    }

    void knocked() {
        if (bull != null) bull.replay("muyu");
        if (miniBull != null) miniBull.replay("muyu");
        if (config.optBoolean("muyuEffects", true) && config.optBoolean("motion",true)) feedback.tap(getWidth() * .5f, getHeight() * .65f);
        updateText();
    }

    void active(boolean value) {
        active = value;
        if (!value) feedback.clear();
        if (miniBull != null) miniBull.configure(value, config.optBoolean("motion", true) && config.optBoolean("islandMotion", true));
        if (bull != null) bull.configure(value, config.optBoolean("motion", true) && config.optBoolean("islandMotion", true));
    }

    void close() { active(false); }
}
