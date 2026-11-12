package art.niulai.android;

import android.content.Context;
import android.content.res.AssetFileDescriptor;
import android.media.AudioAttributes;
import android.media.SoundPool;

final class MuyuSound {
    private final SoundPool pool;
    private int sound;
    private boolean ready, pending;
    private long lastPlayed;

    MuyuSound(Context context) {
        pool = new SoundPool.Builder().setMaxStreams(2).setAudioAttributes(new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build()).build();
        pool.setOnLoadCompleteListener((p, id, status) -> {ready = status == 0;if(ready&&pending){pending=false;play();}});
        try (AssetFileDescriptor file = context.getAssets().openFd("web/assets/niulai-tap.wav")) {
            sound = pool.load(file, 1);
        } catch (Exception e) { android.util.Log.w("NiulaiMuyu", "Wood sound unavailable", e); }
    }

    void play() {
        long now = android.os.SystemClock.uptimeMillis();
        if (now - lastPlayed < 480) return;
        if (ready) { lastPlayed = now; pool.play(sound, .65f, .65f, 1, 0, 1); }
        else pending = true;
    }
    void stop() { pending=false;pool.autoPause(); }
    void close() { pool.release(); }
}
