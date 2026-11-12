package art.niulai.android;
import android.content.Context;
import android.webkit.*;
import java.io.*;

class LocalAssets extends WebViewClient {
    static final String ORIGIN = "https://appassets.androidplatform.net";
    private final Context context;
    LocalAssets(Context context) { this.context = context; }
    @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { return true; }
    @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        android.net.Uri uri = request.getUrl();
        String path = uri.getPath() == null ? "" : uri.getPath().replaceFirst("^/", "");
        if (!"https".equals(uri.getScheme()) || !"appassets.androidplatform.net".equals(uri.getHost()) || path.contains("..") || !path.matches("[a-zA-Z0-9_./-]+") || uri.getQuery() != null)
            return new WebResourceResponse("text/plain", "UTF-8", new ByteArrayInputStream(new byte[0]));
        try {
            String mime = path.endsWith(".js") ? "application/javascript" : path.endsWith(".css") ? "text/css" : path.endsWith(".png") ? "image/png" : path.endsWith(".webp") ? "image/webp" : path.endsWith(".wav") ? "audio/wav" : path.endsWith(".json") ? "application/json" : path.endsWith(".mp3") ? "audio/mpeg" : "text/html";
            return new WebResourceResponse(mime, mime.startsWith("text/") || mime.contains("javascript") ? "UTF-8" : null, context.getAssets().open("web/" + path));
        } catch (IOException e) { return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", null, new ByteArrayInputStream(new byte[0])); }
    }
    static void configure(WebView web) {
        web.setVerticalScrollBarEnabled(false); web.setHorizontalScrollBarEnabled(false); web.setOverScrollMode(android.view.View.OVER_SCROLL_NEVER);
        WebSettings s = web.getSettings(); s.setJavaScriptEnabled(true); s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false); s.setAllowContentAccess(false); s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setMediaPlaybackRequiresUserGesture(true);
    }
}
