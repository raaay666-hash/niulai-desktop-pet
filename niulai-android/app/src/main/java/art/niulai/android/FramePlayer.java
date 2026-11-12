package art.niulai.android;

/** Playback changes whole drawings. Coordinates and body proportions come from the artwork. */
final class FramePlayer {
    String id = "idle";
    long started;
    private long pausedAt = -1;
    private boolean knocking, queuedKnock;
    private int duration = 2400, rest = 1600;
    private long lastKnock;

    void state(String next, int milliseconds, int pause, long now, boolean replay) {
        if (id.equals(next) && !replay) return;
        if (next.equals("muyu") && id.equals(next) && replay && knocking && now - started < duration) {
            queuedKnock = true;
            lastKnock = now;
            return;
        }
        id = next;
        duration = milliseconds;
        rest = pause;
        started = pausedAt >= 0 ? pausedAt : now;
        knocking = id.equals("muyu") && replay;
        if (knocking) lastKnock = now;
        queuedKnock = false;
    }

    void pause(boolean value, long now) {
        if (value && pausedAt < 0) pausedAt = now;
        if (!value && pausedAt >= 0) { started += now - pausedAt; pausedAt = -1; }
        if (value) queuedKnock = false;
    }

    int frame(long now, boolean moving) {
        long elapsed = Math.max(0, (pausedAt >= 0 ? pausedAt : now) - started);
        if (!moving || id.equals("muyu") && !knocking) return 0;
        if (id.equals("muyu") && elapsed >= duration) {
            if (queuedKnock && elapsed < duration * 2L) {
                started += duration;
                elapsed -= duration;
                duration = now - lastKnock < 180 ? 300 : 400;
                queuedKnock = false;
            } else { knocking = false; queuedKnock = false; return 0; }
        }
        long time = elapsed % (duration + rest);
        return time >= duration ? 23 : Math.min(23, (int)(time * 24 / duration));
    }
}
