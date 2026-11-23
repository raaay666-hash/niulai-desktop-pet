package art.niulai.android;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.drawable.GradientDrawable;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.View;
import android.view.MotionEvent;
import android.widget.FrameLayout;
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
    private final IslandTrend trend = new IslandTrend();
    private final TapFeedback feedback;
    private JSONObject config = new JSONObject();
    private NativeMarket.Quote quote;
    private String error;
    private boolean expanded, active = true;
    private TextView title, compactPrice, compactDelta, mainValue, detail, source, holding;
    private NativeBullView bull, miniBull;
    private TrendView trendView, expandedTrend;
    private int ink, muted, surface, accent;
    private boolean dark;
    private LinearLayout headerLeft, headerRight;
    private View headerGap;
    private boolean fused;
    private int gapLeft, gapRight, windowX, windowWidth;
    private float downX, downY;
    private long downTime;

    void cameraLayout(IslandGeometry.Layout layout) {
        boolean changed = fused != layout.fused;
        fused = layout.fused;
        gapLeft = layout.x + layout.gapLeft; gapRight = layout.x + layout.gapRight;
        windowX = layout.x;
        windowWidth = layout.width;
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
            int valueWidth = compactDelta != null && compactDelta.getVisibility() == GONE ? 44 : 96;
            headerRight.setLayoutParams(new LinearLayout.LayoutParams(dp(valueWidth), -1));
        } else {
            headerGap.setVisibility(VISIBLE);
            int left = Math.max(0, gapLeft - windowX - dp(10));
            headerLeft.setLayoutParams(new LinearLayout.LayoutParams(left, -1));
            headerGap.setLayoutParams(new LinearLayout.LayoutParams(gap, -1));
            headerRight.setLayoutParams(new LinearLayout.LayoutParams(0, -1, 1));
        }
        updateTrendVisibility();
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

    void expanded(boolean value) {
        if (expanded == value) return;
        expanded = value;
        rebuild();
    }

    void configure(JSONObject next) {
        config = next;
        trend.select(symbol());
        if (quote != null && !quote.code.equals(symbol())) { quote = null; error = null; }
        rebuild();
    }

    private GradientDrawable background(int color, int radius) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(color);
        drawable.setCornerRadius(dp(radius));
        drawable.setStroke(dp(1), fused ? 0xff000000 : dark ? 0xff3b434f : 0xffdadfe6);
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
        dark = fused || Appearance.dark(getContext(), config.optString("islandTheme", "dark"));
        ink = dark ? 0xfff0f2f7 : 0xff212733;
        muted = dark ? 0xffadb7c6 : 0xff546073;
        surface = fused ? 0xff000000 : dark ? 0xff171a21 : 0xfffafbfe;
        accent = dark ? 0xffadbfff : 0xff324e95;
        String style = muyu() ? "quote" : config.optString("islandStyle", "quote");
        boolean minimal = "minimal".equals(style);
        boolean inline = minimal && !fused;
        trendView = expandedTrend = null;
        int radius = "trend".equals(style) ? 15 : minimal ? 12 : 24;
        setBackground(background(surface, expanded ? radius + 3 : radius));
        setClipToOutline(true);
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
        if ("quote".equals(style) && config.optBoolean("islandBull", true)) {
            NativeBullView icon = new NativeBullView(getContext());
            icon.mini(true);miniBull=icon;
            LinearLayout.LayoutParams iconParams = new LinearLayout.LayoutParams(dp(fused && gapRight > gapLeft ? 24 : 32), dp(34));
            iconParams.rightMargin = dp(3);
            headerLeft.addView(icon, iconParams);
        }
        LinearLayout summary = new LinearLayout(getContext());
        summary.setOrientation(inline ? LinearLayout.HORIZONTAL : LinearLayout.VERTICAL);
        summary.setGravity(Gravity.CENTER_VERTICAL);
        title = label("牛来", inline ? 11 : 10, muted);
        compactPrice = label("—", inline ? 15 : 13, ink);
        compactPrice.setTypeface(null, 1);
        if (inline) {
            compactPrice.setMaxWidth(dp(108));
            compactPrice.setPadding(dp(5), 0, 0, 0);
            summary.addView(title, new LinearLayout.LayoutParams(0, -2, 1));
            summary.addView(compactPrice, new LinearLayout.LayoutParams(-2, -2));
        } else {
            summary.addView(title, new LinearLayout.LayoutParams(-1, dp(16)));
            summary.addView(compactPrice, new LinearLayout.LayoutParams(-1, dp(19)));
        }
        headerLeft.addView(summary, new LinearLayout.LayoutParams(0, -2, 1));
        if ("trend".equals(style)) {
            trendView = new TrendView();
            trendView.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
            LinearLayout.LayoutParams chart = new LinearLayout.LayoutParams(dp(43), dp(22));
            chart.setMargins(dp(5), 0, dp(4), 0);
            headerLeft.addView(trendView, chart);
        }
        compactDelta = label("—", 12, ink);
        compactDelta.setGravity(Gravity.CENTER);
        compactDelta.setTypeface(null, 1);
        headerRight.addView(compactDelta, new LinearLayout.LayoutParams(0, -1, 1));
        TextView toggle = button(expanded ? "⌃" : "⌄", expanded ? "收起灵动岛" : "展开灵动岛", actions::expand);
        headerRight.addView(toggle, new LinearLayout.LayoutParams(dp(44), dp(44)));
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
            if ("trend".equals(style)) {
                expandedTrend = new TrendView();
                expandedTrend.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
                body.addView(expandedTrend, new LinearLayout.LayoutParams(dp(86), dp(52)));
            } else if (config.optBoolean("islandBull", true)) {
                bull = new NativeBullView(getContext());
                bull.setContentDescription(muyu() ? "敲木鱼" : "牛来动作");
                bull.setOnClickListener(v -> { if (muyu()) actions.knock(); else actions.open(); });
                body.addView(bull, new LinearLayout.LayoutParams(dp(72), dp(88)));
            }
            content.addView(body, new LinearLayout.LayoutParams(-1, dp(90)));
            source = label("", 9, muted);
            content.addView(source, new LinearLayout.LayoutParams(-1, dp(20)));
            LinearLayout controls = new LinearLayout(getContext());
            String[] labels = muyu() ? new String[]{"敲一下", "打开", "关闭"} : new String[]{"上一只", "下一只", "打开", "关闭"};
            Runnable[] callbacks = muyu() ? new Runnable[]{actions::knock, actions::open, actions::close}
                : new Runnable[]{actions::previous, actions::next, actions::open, actions::close};
            for (int i = 0; i < labels.length; i++) {
                TextView control = button(labels[i], labels[i], callbacks[i]);
                control.setTextColor(accent);
                controls.addView(control, new LinearLayout.LayoutParams(0, dp(44), 1));
            }
            content.addView(controls, new LinearLayout.LayoutParams(-1, dp(44)));
        }
        addView(feedback, new FrameLayout.LayoutParams(-1, -1));
        updateText();
    }

    private boolean muyu() { return "muyu".equals(config.optString("islandContent")); }

    private String symbol() {
        String pinned = config.optString("islandSymbol");
        return NativeMarket.valid(pinned) ? pinned : config.optString("symbol", "s_sh000001");
    }

    private void updateTrendVisibility() {
        if (trendView == null) return;
        boolean ready = trend.ready();
        boolean compact = !expanded && gapLeft == gapRight && windowWidth >= dp(240) && ready;
        trendView.setVisibility(compact ? VISIBLE : GONE);
        if (compact) trendView.invalidate();
        if (expandedTrend != null) {
            expandedTrend.setVisibility(ready ? VISIBLE : GONE);
            if (ready) expandedTrend.invalidate();
        }
    }

    void update(NativeMarket.Quote value, String failure) {
        quote = value != null && symbol().equals(value.code) ? value : null;
        error = failure;
        if (failure == null) trend.record(quote);
        updateText();
    }

    void countsChanged() { updateText(); }

    private void updateText() {
        boolean wood = muyu();
        JSONObject counts = wood ? MuyuStore.read(getContext()) : null;
        long now = System.currentTimeMillis();
        boolean stale = error != null || quote != null && now - quote.received > 45000;
        String code = symbol();
        String name = quote != null ? quote.name : code.equals(config.optString("symbol"))
            ? config.optString("name", NativeMarket.display(code)) : NativeMarket.display(code);
        boolean minimal = !wood && "minimal".equals(config.optString("islandStyle"));
        title.setText(wood ? "牛来木鱼" : minimal ? NativeMarket.display(code) : name);
        String price = quote != null ? NativeMarket.priceText(quote) : error == null ? "等待行情" : "获取失败";
        compactPrice.setText(wood ? config.optBoolean("islandCount", true) ? "本轮 " + counts.optLong("session") : "轻触敲击" : price);
        compactPrice.setVisibility(wood || config.optBoolean("islandPrice", true) ? VISIBLE : GONE);
        boolean hasPercent = quote != null && Double.isFinite(quote.pct);
        compactDelta.setText(stale ? "延迟" : hasPercent ? String.format(Locale.US, "%+.2f%%", quote.pct) : "—");
        int deltaVisibility = !wood && (stale || config.optBoolean("islandPercent", true)) ? VISIBLE : GONE;
        if (compactDelta.getVisibility() != deltaVisibility) {
            compactDelta.setVisibility(deltaVisibility);
            layoutHeader();
        }
        int quoteColor = !hasPercent || quote.pct == 0 ? ink : quote.pct < 0
            ? (dark ? 0xff72d0ad : 0xff18724f) : (dark ? 0xffff929e : 0xffb62945);
        compactDelta.setTextColor(stale ? muted : quoteColor);
        updateTrendVisibility();
        String motionState = wood ? "muyu" : moods.update(code, quote == null ? 0 : quote.price, quote == null ? 0 : quote.pct,
            quote == null ? 0 : quote.received, quote != null, stale, now, config.optInt("islandInterval", 5));
        if(miniBull!=null){miniBull.state(motionState);miniBull.configure(active,config.optBoolean("motion",true)&&config.optBoolean("islandMotion",true));}
        if (!expanded) return;
        mainValue.setText(wood ? config.optBoolean("islandCount", true) ? Long.toString(counts.optLong("session")) : "木鱼" : config.optBoolean("islandPrice", true) ? price : name);
        mainValue.setTextColor(wood || stale || !config.optBoolean("islandPrice", true) ? ink : quoteColor);
        detail.setText(wood ? "今日 " + counts.optLong("today") + " · 累计 " + counts.optLong("total")
            : stale ? (quote == null ? "行情暂不可用" : "更新延迟 · 保留上次报价")
            : quote != null && Double.isFinite(quote.change) ? String.format(Locale.US, "%+.3f  ·  %s", quote.change, NativeMarket.currency(code)) : "等待报价");
        detail.setVisibility(!wood || config.optBoolean("islandCount", true) ? VISIBLE : GONE);
        holding.setVisibility(!wood && config.optBoolean("islandHoldings") ? VISIBLE : GONE);
        holding.setText(holdingText());
        source.setText(wood ? "点击敲击 · 本机计数" : quote == null ? "等待行情" : (quote.source.equals("tencent") ? "腾讯" : "新浪") + " · 获取 " + new SimpleDateFormat("HH:mm:ss", Locale.CHINA).format(new Date(quote.received)));
        if (bull != null) {
            bull.state(motionState);
            bull.configure(active, config.optBoolean("motion", true) && config.optBoolean("islandMotion", true));
        }
    }

    private final class TrendView extends View {
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Path line = new Path();

        TrendView() { super(NativeIslandView.this.getContext()); }

        @Override protected void onDraw(Canvas canvas) {
            if (!trend.ready()) return;
            double low = Double.POSITIVE_INFINITY, high = Double.NEGATIVE_INFINITY;
            for (IslandTrend.Sample sample : trend) {
                low = Math.min(low, sample.price);
                high = Math.max(high, sample.price);
            }
            long start = trend.first().at, span = trend.last().at - start;
            float inset = dp(3), width = getWidth() - 2 * inset, height = getHeight() - 2 * inset;
            if (width <= 0 || height <= 0) return;
            float x = 0, y = 0;
            boolean first = true;
            line.rewind();
            for (IslandTrend.Sample sample : trend) {
                x = inset + (span == 0 ? width / 2 : width * (sample.at - start) / span);
                y = inset + (high == low ? height / 2 : (float)(height * (high - sample.price) / (high - low)));
                if (first) line.moveTo(x, y); else line.lineTo(x, y);
                first = false;
            }
            paint.setColor(error == null ? accent : muted);
            paint.setStrokeWidth(Math.max(1.5f, dp(1)));
            paint.setStrokeCap(Paint.Cap.ROUND);
            paint.setStrokeJoin(Paint.Join.ROUND);
            paint.setStyle(Paint.Style.STROKE);
            canvas.drawPath(line, paint);
            paint.setStyle(Paint.Style.FILL);
            canvas.drawCircle(x, y, dp(2), paint);
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
