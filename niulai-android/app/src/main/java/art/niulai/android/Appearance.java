package art.niulai.android;

import android.content.Context;
import android.content.res.Configuration;

final class Appearance {
    static boolean systemDark(Context context) {
        return (context.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
            == Configuration.UI_MODE_NIGHT_YES;
    }

    static boolean dark(Context context, String preference) {
        return "dark".equals(preference) || (!"light".equals(preference) && systemDark(context));
    }
}
