package art.niulai.android;
import java.io.*;
import java.net.*;
import java.nio.charset.Charset;
import java.util.concurrent.*;
import org.json.JSONObject;

final class QuoteGateway {
    interface Result { void send(String script); }
    interface RawResult { void send(String id,String text,String error); }
    private volatile boolean active = true;
    private final Result result;
    private final RawResult raw;
    private final ThreadPoolExecutor pool = new ThreadPoolExecutor(2, 2, 30, TimeUnit.SECONDS, new ArrayBlockingQueue<Runnable>(8), new ThreadPoolExecutor.AbortPolicy());
    QuoteGateway(Result result) { this.result = result; this.raw=null; }
    QuoteGateway(RawResult raw) { this.raw=raw;this.result=null; }
    static boolean symbol(String value) { return NativeMarket.valid(value); }
    void setActive(boolean enabled) { active = enabled; if (!enabled) pool.getQueue().clear(); }
    void close() { active = false; pool.shutdownNow(); }
    private void finish(String id, String text, String error) {
        if(raw!=null){raw.send(id,text,error);return;}
        result.send("window.__niulaiResult(" + JSONObject.quote(id) + "," + (text == null ? "null" : JSONObject.quote(text)) + "," + (error == null ? "null" : JSONObject.quote(error)) + ")");
    }
    void request(String id, String kind, String value) {
        if (id == null || !id.matches("[0-9]{1,10}") || value == null) return;
        if (!active) { finish(id, null, "刷新已暂停"); return; }
        try {
            final String endpoint, referer;
            if ("quote".equals(kind) && value.matches("(?:s_(?:sh|sz)[0-9]{6}|rt_hk[0-9]{5}|gb_[a-z][a-z0-9.-]{0,11})(?:,(?:s_(?:sh|sz)[0-9]{6}|rt_hk[0-9]{5}|gb_[a-z][a-z0-9.-]{0,11})){0,19}")) {
                endpoint = "https://hq.sinajs.cn/list=" + value; referer = "https://finance.sina.com.cn/";
            } else if ("fallback".equals(kind) && value.matches("(?:s_(?:sh|sz)[0-9]{6}|hk[0-9]{5}|us[A-Z][A-Z0-9.-]{0,11})(?:,(?:s_(?:sh|sz)[0-9]{6}|hk[0-9]{5}|us[A-Z][A-Z0-9.-]{0,11})){0,19}")) {
                endpoint = "https://qt.gtimg.cn/q=" + value; referer = "https://gu.qq.com/";
            } else if ("search".equals(kind) && value.trim().length() >= 1 && value.length() <= 40) {
                endpoint = "https://smartbox.gtimg.cn/s3/?t=all&q=" + URLEncoder.encode(value.trim(), "UTF-8"); referer = "https://gu.qq.com/";
            } else { finish(id, null, "请求参数无效"); return; }
            pool.execute(() -> fetch(id, endpoint, referer));
        } catch (Exception e) { finish(id, null, "请求繁忙，请稍后重试"); }
    }
    private void fetch(String id, String endpoint, String referer) {
        HttpURLConnection c = null;
        try {
            if (!active) throw new IOException("paused");
            c = (HttpURLConnection)new URL(endpoint).openConnection(); c.setInstanceFollowRedirects(false);
            c.setConnectTimeout(6500); c.setReadTimeout(6500); c.setRequestProperty("Referer", referer);
            c.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android) Niulai/1.0");
            if (c.getResponseCode() != 200) throw new IOException("HTTP " + c.getResponseCode());
            try (InputStream stream = c.getInputStream(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                byte[] chunk = new byte[8192]; int read;
                while ((read = stream.read(chunk)) != -1) { if (!active || output.size() + read > 512000) throw new IOException("cancelled"); output.write(chunk, 0, read); }
                finish(id, new String(output.toByteArray(), Charset.forName("GBK")), null);
            }
        } catch (Exception e) { finish(id, null, "行情连接失败，请检查网络后重试"); }
        finally { if (c != null) c.disconnect(); }
    }
}
