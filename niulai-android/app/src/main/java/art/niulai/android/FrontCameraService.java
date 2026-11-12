package art.niulai.android;

import android.accessibilityservice.AccessibilityService;
import android.content.Intent;
import android.view.accessibility.AccessibilityEvent;

/** Hosts only Niulai's own top controls. No screen-content or input-injection capabilities. */
public class FrontCameraService extends AccessibilityService {
    static volatile FrontCameraService connected;

    @Override protected void onServiceConnected() { connected = this; refresh(); }
    private void refresh() {
        if (PetService.running) startService(new Intent(this, PetService.class).setAction(PetService.CONFIG));
    }
    @Override public void onAccessibilityEvent(AccessibilityEvent event) { }
    @Override public void onInterrupt() { }
    @Override public boolean onUnbind(Intent intent) { connected = null; refresh(); return super.onUnbind(intent); }
    @Override public void onDestroy() { connected = null; refresh(); super.onDestroy(); }
}
