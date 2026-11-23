package art.niulai.android;

import java.util.ArrayDeque;
import java.util.Iterator;

/** Recent samples for the current instrument and session, in receipt order. */
final class IslandTrend implements Iterable<IslandTrend.Sample> {
    private static final int LIMIT = 24;
    private static final long MAX_GAP = 15 * 60 * 1000;

    static final class Sample {
        final long at;
        final double price;

        Sample(long at, double price) { this.at = at; this.price = price; }
    }

    private final ArrayDeque<Sample> samples = new ArrayDeque<>();
    private String code = "", session = "";

    void select(String symbol) {
        if (code.equals(symbol)) return;
        code = symbol;
        session = "";
        samples.clear();
    }

    void record(NativeMarket.Quote quote) {
        if (quote == null || !code.equals(quote.code) || !Double.isFinite(quote.price) || quote.price <= 0) return;
        long at = quote.quotedAt != null ? quote.quotedAt : quote.received;
        if (at <= 0 || at > quote.received + 90000) return;
        Sample last = samples.peekLast();
        if (last != null && at < last.at) return;
        if (!session.equals(quote.session) || (last != null && at - last.at > MAX_GAP)) {
            samples.clear();
            last = null;
        }
        if (last != null && at == last.at && quote.price == last.price) return;
        session = quote.session;
        if (samples.size() == LIMIT) samples.removeFirst();
        samples.addLast(new Sample(at, quote.price));
    }

    boolean ready() { return samples.size() >= 2; }
    Sample first() { return samples.peekFirst(); }
    Sample last() { return samples.peekLast(); }
    @Override public Iterator<Sample> iterator() { return samples.iterator(); }
}
