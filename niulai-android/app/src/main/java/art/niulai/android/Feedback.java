package art.niulai.android;

import android.app.Activity;
import android.app.AlertDialog;
import android.os.Build;
import android.text.InputFilter;
import android.text.InputType;
import android.widget.*;
import java.io.*;
import java.net.*;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONObject;

final class Feedback {
    interface Result { void done(String receipt, String error); }
    private final Activity activity;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private boolean busy, closed;
    private AlertDialog dialog;
    private TextView statusView;
    private String nativeSignature = "", nativeId = "";

    Feedback(Activity activity) { this.activity = activity; }

    String context() {
        try { return activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0).versionName + " · Android " + Build.VERSION.RELEASE; }
        catch (Exception error) { return "Android " + Build.VERSION.RELEASE; }
    }

    void submit(String raw, Result result) {
        if (closed || busy) { result.done(null, "正在提交，请稍候"); return; }
        final JSONObject payload;
        try {
            JSONObject value = new JSONObject(raw);
            String kind = value.getString("kind");
            String message = value.getString("message").trim();
            String contact = value.getString("contact").trim();
            String id = value.getString("clientId");
            if (!(kind.equals("problem") || kind.equals("suggestion")) || message.codePointCount(0, message.length()) < 5 || message.length() > 2800 || contact.length() > 160 || !id.matches("(?i)[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}")) throw new IllegalArgumentException();
            payload = new JSONObject().put("kind", kind).put("message", message + "\n\n牛来盯盘 " + context()).put("contact", contact).put("clientId", id).put("website", "");
        } catch (Exception error) { result.done(null, "请检查反馈内容，至少填写 5 个字"); return; }
        busy = true;
        worker.execute(() -> {
            String receipt = null, error = null;
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) new URL(UpdateChecker.SITE + "/api/feedback").openConnection();
                connection.setInstanceFollowRedirects(false);
                connection.setConnectTimeout(8000);
                connection.setReadTimeout(12000);
                connection.setRequestMethod("POST");
                connection.setRequestProperty("Content-Type", "application/json");
                connection.setRequestProperty("Origin", UpdateChecker.SITE);
                connection.setDoOutput(true);
                byte[] body = payload.toString().getBytes("UTF-8");
                connection.setFixedLengthStreamingMode(body.length);
                try (OutputStream stream = connection.getOutputStream()) { stream.write(body); }
                int status = connection.getResponseCode();
                if (status == 429) error = "提交太频繁，请稍后再试";
                else if (status != 200 && status != 201) error = "提交失败，内容已保留，请重试";
                else {
                    ByteArrayOutputStream bytes = new ByteArrayOutputStream();
                    try (InputStream stream = connection.getInputStream()) {
                        byte[] buffer = new byte[1024];
                        int count;
                        while ((count = stream.read(buffer)) != -1) {
                            if (bytes.size() + count > 8192) throw new IOException();
                            bytes.write(buffer, 0, count);
                        }
                    }
                    JSONObject response = new JSONObject(bytes.toString("UTF-8"));
                    if (!response.optBoolean("ok") || !payload.getString("clientId").equals(response.optString("id"))) error = "提交失败，内容已保留，请重试";
                    else receipt = response.getString("id");
                }
            } catch (Exception failure) { error = "网络连接失败，内容已保留，请重试"; }
            finally { if (connection != null) connection.disconnect(); }
            final String finalReceipt = receipt, finalError = error;
            activity.runOnUiThread(() -> {
                busy = false;
                if (!closed) result.done(finalReceipt, finalError);
            });
        });
    }

    void show() {
        if (dialog != null) { if (!busy && statusView != null) statusView.setText(""); dialog.show(); return; }
        int padding = Math.round(24 * activity.getResources().getDisplayMetrics().density);
        LinearLayout form = new LinearLayout(activity);
        form.setOrientation(LinearLayout.VERTICAL);
        form.setPadding(padding, 0, padding, 0);
        Spinner kind = new Spinner(activity);
        kind.setAdapter(new ArrayAdapter<>(activity, android.R.layout.simple_spinner_dropdown_item, new String[]{"遇到问题", "改进建议"}));
        EditText message = new EditText(activity);
        message.setHint("描述问题和操作步骤，或写下改进建议");
        message.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE);
        message.setMinLines(4);
        message.setFilters(new InputFilter[]{new InputFilter.LengthFilter(2800)});
        EditText contact = new EditText(activity);
        contact.setHint("联系方式（选填）");
        contact.setSingleLine(true);
        contact.setFilters(new InputFilter[]{new InputFilter.LengthFilter(160)});
        TextView metadata = new TextView(activity);
        metadata.setText("随反馈附上 牛来盯盘 " + context());
        TextView status = new TextView(activity);
        statusView = status;
        status.setAccessibilityLiveRegion(android.view.View.ACCESSIBILITY_LIVE_REGION_POLITE);
        form.addView(kind); form.addView(message); form.addView(contact); form.addView(metadata); form.addView(status);
        ScrollView scroll = new ScrollView(activity);
        scroll.addView(form);
        dialog = new AlertDialog.Builder(activity).setTitle("问题与建议").setView(scroll).setNegativeButton("关闭", null).setPositiveButton("提交反馈", null).create();
        dialog.setOnShowListener(ignored -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(view -> {
            try {
                String text = message.getText().toString().trim();
                if (text.codePointCount(0, text.length()) < 5) { status.setText("请至少填写 5 个字"); message.requestFocus(); return; }
                JSONObject payload = new JSONObject().put("kind", kind.getSelectedItemPosition() == 0 ? "problem" : "suggestion").put("message", text).put("contact", contact.getText().toString().trim());
                String signature = payload.toString();
                if (!signature.equals(nativeSignature)) { nativeSignature = signature; nativeId = UUID.randomUUID().toString(); }
                payload.put("clientId", nativeId);
                dialog.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(false);
                kind.setEnabled(false); message.setEnabled(false); contact.setEnabled(false);
                status.setText("正在提交…");
                submit(payload.toString(), (receipt, error) -> {
                    dialog.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(true);
                    kind.setEnabled(true); message.setEnabled(true); contact.setEnabled(true);
                    status.setText(error == null ? "反馈已提交，谢谢" : error);
                    if (error == null) { message.setText(""); contact.setText(""); nativeSignature = ""; dialog.dismiss(); Toast.makeText(activity, "反馈已提交，谢谢", Toast.LENGTH_LONG).show(); }
                });
            } catch (Exception error) { status.setText("请检查反馈内容"); }
        }));
        dialog.show();
    }

    void close() { closed = true; worker.shutdownNow(); if (dialog != null) dialog.dismiss(); }
}
