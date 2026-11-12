package art.niulai.android;

/** All values use physical screen pixels. No model-name assumptions enter the placement. */
final class IslandGeometry {
    static final class Layout {
        int x, y, width, height, gapLeft, gapRight;
        int[] bridge;
        boolean fused;
    }

    static Layout calculate(int screenWidth, int screenHeight, float density, int[] safe, int[] hole,
                            int requestedWidth, int requestedHeight, int offsetX, int offsetY, boolean camera) {
        Layout result = new Layout();
        int margin = Math.round(8 * density), overlap = Math.round(3 * density);
        int usable = Math.max(1, screenWidth - safe[0] - safe[2] - margin * 2);
        result.width = Math.min(requestedWidth, usable);
        result.height = Math.min(requestedHeight, Math.max(1, screenHeight - safe[1] - safe[3] - margin * 2));
        int center = screenWidth / 2;
        result.y = safe[1] + Math.max(0, offsetY);
        if (camera && hole != null && hole[2] > hole[0] && hole[3] > hole[1]) {
            result.fused = true;
            int cx = (hole[0] + hole[2]) / 2, cy = (hole[1] + hole[3]) / 2;
            boolean top = hole[1] < Math.max(safe[1], Math.round(64 * density));
            boolean central = cx > screenWidth * .28f && cx < screenWidth * .72f;
            boolean narrow = hole[2] - hole[0] < screenWidth * .36f;
            if (top && central && narrow) {
                center = cx;
                if (requestedHeight <= Math.round(48 * density)) {
                    result.width = Math.min(result.width, Math.max(Math.round(176 * density), screenWidth - Math.round(164 * density)));
                }
                result.y = Math.max(0, hole[1] - Math.round(4 * density)) + offsetY;
                result.height = Math.max(result.height, hole[3] - result.y + Math.round(6 * density));
            } else if (top) {
                center = central ? screenWidth / 2 : cx < screenWidth / 2 ? safe[0] + margin + result.width / 2 : screenWidth - safe[2] - margin - result.width / 2;
                result.y = Math.max(safe[1], hole[3]) - overlap + offsetY;
                result.bridge = new int[]{Math.max(0, hole[0] - overlap), Math.max(0, hole[1] - overlap), Math.min(screenWidth, hole[2] + overlap), result.y + Math.round(24 * density)};
            } else {
                boolean left = cx < screenWidth / 2;
                center = left ? hole[2] + result.width / 2 - overlap : hole[0] - result.width / 2 + overlap;
                result.y = cy - result.height / 2 + offsetY;
                result.bridge = new int[]{Math.max(0, hole[0] - overlap), Math.max(0, hole[1] - overlap), Math.min(screenWidth, hole[2] + overlap), Math.min(screenHeight, hole[3] + overlap)};
            }
        }
        result.x = clamp(center - result.width / 2 + offsetX, safe[0] + margin, screenWidth - safe[2] - margin - result.width);
        result.y = clamp(result.y, 0, Math.max(0, screenHeight - safe[3] - margin - result.height));
        if (result.bridge != null && hole[1] >= Math.max(safe[1], Math.round(64 * density))) {
            if ((hole[0] + hole[2]) / 2 < screenWidth / 2) result.bridge[2] = Math.max(result.bridge[2], result.x + Math.round(16 * density));
            else result.bridge[0] = Math.min(result.bridge[0], result.x + result.width - Math.round(16 * density));
        }
        if (result.fused && result.bridge == null) {
            result.gapLeft = clamp(hole[0] - result.x - Math.round(7 * density), 0, result.width);
            result.gapRight = clamp(hole[2] - result.x + Math.round(7 * density), result.gapLeft, result.width);
            if (hole[3] <= result.y || hole[1] >= result.y + result.height) { result.gapLeft = 0; result.gapRight = 0; }
        }
        return result;
    }

    private static int clamp(int value, int min, int max) { return Math.max(min, Math.min(Math.max(min, max), value)); }
}
