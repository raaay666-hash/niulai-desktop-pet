package art.niulai.android;

public final class IslandTrendHarness {
    private static final String STOCK = "rt_hk00700", OTHER = "gb_aapl";
    private static final long NOW = 1700000000000L;

    private static NativeMarket.Quote quote(String code, String session, double price, long at) {
        NativeMarket.Quote quote = new NativeMarket.Quote(code, code, price, 1, 1, price - 1, "", "sina");
        quote.session = session;
        quote.quotedAt = at;
        return quote;
    }

    private static void require(boolean result, String message) {
        if (!result) throw new AssertionError(message);
    }

    public static void main(String[] args) {
        IslandTrend trend = new IslandTrend();
        trend.select(STOCK);
        trend.record(quote(STOCK, "regular", .105, NOW));
        trend.record(quote(STOCK, "regular", .105, NOW));
        trend.record(quote(OTHER, "regular", 42, NOW + 10));
        require(!trend.ready(), "Do not draw a trend from repeat or foreign samples");
        trend.record(quote(STOCK, "regular", .108, NOW + 750));
        require(trend.ready() && trend.last().at - trend.first().at == 750, "Keep actual sample spacing");
        trend.record(quote(STOCK, "pre", .102, NOW - 1000));
        require(trend.ready() && trend.last().price == .108, "Older data must not reset the session");
        trend.record(quote(STOCK, "regular", .110, NOW + 16 * 60 * 1000));
        require(!trend.ready(), "Do not join a paused session to earlier prices");
        trend.record(quote(STOCK, "post", .109, NOW + 17 * 60 * 1000));
        require(!trend.ready(), "Do not join two trading sessions");
        trend.select(OTHER);
        require(trend.first() == null, "Changing the symbol clears the chart");
        for (int i = 0; i < 30; i++) trend.record(quote(OTHER, "regular", 190 + i, NOW + i * 1000));
        require(trend.first().price == 196 && trend.last().price == 219, "Keep the latest 24 samples");
        require(NativeMarket.priceText(quote(STOCK, "regular", .105, NOW)).equals("0.105"), "Retain HK price precision");
        require(NativeMarket.priceText(quote(OTHER, "regular", .000043, NOW)).equals("0.000043"), "A small price must not become zero");
    }
}
