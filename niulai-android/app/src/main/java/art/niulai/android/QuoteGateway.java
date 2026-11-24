package art.niulai.android;
import java.io.*;
import java.net.*;
import java.nio.charset.Charset;
import java.util.concurrent.*;
import org.json.JSONObject;

final class QuoteGateway {
    interface Result { void send(String script); }
    interface RawResult { void send(String id,String text,String error); }
    private static final class Task implements Runnable {
        final String id;
        private final Runnable run;
        Task(String id, Runnable run) { this.id = id; this.run = run; }
        @Override public void run() { run.run(); }
    }
    private volatile boolean active = true;
    private final Result result;
    private final RawResult raw;
    private final ThreadPoolExecutor pool;
    private volatile ThreadPoolExecutor newsPool;
    QuoteGateway(Result result) { this.result = result; this.raw=null; this.pool = makePool(2, 24); }
    QuoteGateway(RawResult raw) { this.raw=raw; this.result=null; this.pool = makePool(2, 16); }
    private static ThreadPoolExecutor makePool(int threads, int capacity) {
        ThreadPoolExecutor executor = new ThreadPoolExecutor(threads, threads, 30, TimeUnit.SECONDS, new ArrayBlockingQueue<Runnable>(capacity), new ThreadPoolExecutor.AbortPolicy());
        executor.allowCoreThreadTimeOut(true);
        return executor;
    }
    private synchronized ThreadPoolExecutor editorialPool() {
        if (newsPool == null) newsPool = makePool(3, 32);
        return newsPool;
    }
    private void cancelQueued(ThreadPoolExecutor executor) {
        if (executor == null) return;
        java.util.ArrayList<Runnable> dropped = new java.util.ArrayList<>();
        executor.getQueue().drainTo(dropped);
        for (Runnable item : dropped) if (item instanceof Task) finish(((Task) item).id, null, "刷新已暂停");
    }
    static boolean symbol(String value) { return NativeMarket.valid(value); }
    void setActive(boolean enabled) { active = enabled; if (!enabled) { cancelQueued(pool); cancelQueued(newsPool); } }
    void close() { active = false; cancelQueued(pool); cancelQueued(newsPool); pool.shutdownNow(); if (newsPool != null) newsPool.shutdownNow(); }
    private void finish(String id, String text, String error) {
        if(raw!=null){raw.send(id,text,error);return;}
        result.send("window.__niulaiResult(" + JSONObject.quote(id) + "," + (text == null ? "null" : JSONObject.quote(text)) + "," + (error == null ? "null" : JSONObject.quote(error)) + ")");
    }
    void request(String id, String kind, String value) {
        if (id == null || !id.matches("[0-9]{1,10}") || value == null) return;
        if (!active) { finish(id, null, "刷新已暂停"); return; }
        try {
            final String endpoint, referer, encoding;
            boolean editorial = "news-feed".equals(kind) || "news-translation".equals(kind);
            if ("quote".equals(kind) && value.matches("(?:s_(?:sh|sz)[0-9]{6}|rt_hk[0-9]{5}|gb_[a-z][a-z0-9.-]{0,11})(?:,(?:s_(?:sh|sz)[0-9]{6}|rt_hk[0-9]{5}|gb_[a-z][a-z0-9.-]{0,11})){0,19}")) {
                endpoint = "https://hq.sinajs.cn/list=" + value; referer = "https://finance.sina.com.cn/";
            } else if ("fallback".equals(kind) && value.matches("(?:s_(?:sh|sz)[0-9]{6}|hk[0-9]{5}|us[A-Z][A-Z0-9.-]{0,11})(?:,(?:s_(?:sh|sz)[0-9]{6}|hk[0-9]{5}|us[A-Z][A-Z0-9.-]{0,11})){0,19}")) {
                endpoint = "https://qt.gtimg.cn/q=" + value; referer = "https://gu.qq.com/";
            } else if ("history".equals(kind) && value.matches("(?:(?:sh|sz)[0-9]{6}|hk[0-9]{5}|us[A-Z][A-Z0-9.-]{0,20}),(?:day|week|month)(?:,raw)?")) {
                String[] parts = value.split(",");
                boolean raw = parts.length == 3;
                String prefix = parts[0].substring(0, 2);
                String route = !raw && (prefix.equals("hk") || prefix.equals("us")) ? prefix + "fqkline" : "fqkline";
                endpoint = "https://web.ifzq.gtimg.cn/appstock/app/" + route + "/get?param=" + URLEncoder.encode(parts[0] + "," + parts[1] + ",,,240," + (raw ? "" : "qfq"), "UTF-8"); referer = "https://gu.qq.com/";
            } else if ("minutes".equals(kind) && symbol(value)) {
                if (value.startsWith("gb_")) {
                    String ticker = value.substring(3).toUpperCase(java.util.Locale.ROOT).replace('.', '-');
                    endpoint = "https://query1.finance.yahoo.com/v8/finance/chart/" + ticker + "?range=1d&interval=1m&includePrePost=false";
                    referer = "https://finance.yahoo.com/";
                } else {
                    endpoint = "https://web.ifzq.gtimg.cn/appstock/app/minute/query?code=" + value.replaceFirst("^(s_|rt_)", "");
                    referer = "https://gu.qq.com/";
                }
            } else if ("book".equals(kind) && value.matches("(?:sh|sz)[0-9]{6}|hk[0-9]{5}|us[A-Z][A-Z0-9.-]{0,11}")) {
                endpoint = "https://qt.gtimg.cn/q=" + value; referer = "https://gu.qq.com/";
            } else if (editorial && editorialEndpoint(value, kind)) {
                endpoint = value; referer = "";
            } else if ("search".equals(kind) && value.trim().length() >= 1 && value.length() <= 40) {
                endpoint = "https://smartbox.gtimg.cn/s3/?t=all&q=" + URLEncoder.encode(value.trim(), "UTF-8"); referer = "https://gu.qq.com/";
            } else { finish(id, null, "请求参数无效"); return; }
            encoding = editorial || "minutes".equals(kind) ? "UTF-8" : "GBK";
            (editorial ? editorialPool() : pool).execute(new Task(id, () -> fetch(id, endpoint, referer, encoding)));
        } catch (Exception e) { finish(id, null, "请求繁忙，请稍后重试"); }
    }
    private boolean editorialEndpoint(String value, String kind) {
        if (value.length() > 4000) return false;
        try {
            URI uri = URI.create(value);
            if (!"https".equals(uri.getScheme()) || uri.getUserInfo() != null || uri.getPort() != -1 || uri.getFragment() != null || uri.getQuery() == null) return false;
            String route = uri.getHost() + uri.getPath();
            if ("news-translation".equals(kind)) return route.equals("translate.googleapis.com/translate_a/single");
            return route.equals("feeds.finance.yahoo.com/rss/2.0/headline") || route.equals("news.google.com/rss/search")
                || route.equals("search-api-web.eastmoney.com/search/jsonp") || route.equals("feed.mix.sina.com.cn/api/roll/get");
        } catch (IllegalArgumentException error) { return false; }
    }
    private void fetch(String id, String endpoint, String referer, String encoding) {
        HttpURLConnection c = null;
        try {
            if (!active) throw new IOException("paused");
            c = (HttpURLConnection)new URL(endpoint).openConnection(); c.setInstanceFollowRedirects(false);
            c.setConnectTimeout(4500); c.setReadTimeout(5000); if (!referer.isEmpty()) c.setRequestProperty("Referer", referer);
            c.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android) Niulai/1.0");
            int status = c.getResponseCode();
            if (status == 429) { finish(id, null, "行情源暂时限流"); return; }
            if (status != 200) throw new IOException("HTTP " + status);
            try (InputStream stream = c.getInputStream(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                byte[] chunk = new byte[8192]; int read;
                while ((read = stream.read(chunk)) != -1) { if (!active || output.size() + read > 1048576) throw new IOException("cancelled"); output.write(chunk, 0, read); }
                finish(id, new String(output.toByteArray(), Charset.forName(encoding)), null);
            }
        } catch (Exception e) { finish(id, null, active ? "行情连接失败，请检查网络后重试" : "刷新已暂停"); }
        finally { if (c != null) c.disconnect(); }
    }
}
