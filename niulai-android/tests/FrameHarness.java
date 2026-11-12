package art.niulai.android;
import java.io.BufferedReader;
import java.io.InputStreamReader;

public final class FrameHarness {
    public static void main(String[] args) throws Exception {
        FramePlayer player = new FramePlayer();
        BufferedReader reader = new BufferedReader(new InputStreamReader(System.in));
        String line;
        while ((line = reader.readLine()) != null) {
            String[] p = line.split(" ");
            if (p[0].equals("state")) player.state(p[1], Integer.parseInt(p[2]), Integer.parseInt(p[3]), Long.parseLong(p[4]), p[5].equals("1"));
            if (p[0].equals("pause")) player.pause(p[1].equals("1"), Long.parseLong(p[2]));
            if (p[0].equals("frame")) System.out.println(player.frame(Long.parseLong(p[1]), p[2].equals("1")));
        }
    }
}
