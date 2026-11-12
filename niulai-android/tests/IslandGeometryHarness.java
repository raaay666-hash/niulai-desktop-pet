package art.niulai.android;
import java.io.BufferedReader;
import java.io.InputStreamReader;

public final class IslandGeometryHarness {
    public static void main(String[] args) throws Exception {
        BufferedReader reader = new BufferedReader(new InputStreamReader(System.in));
        String line;
        while ((line = reader.readLine()) != null) {
            String[] p = line.split(" ");
            int[] safe = {Integer.parseInt(p[3]), Integer.parseInt(p[4]), Integer.parseInt(p[5]), Integer.parseInt(p[6])};
            int[] hole = p[7].equals("-") ? null : new int[]{Integer.parseInt(p[7]), Integer.parseInt(p[8]), Integer.parseInt(p[9]), Integer.parseInt(p[10])};
            IslandGeometry.Layout l = IslandGeometry.calculate(Integer.parseInt(p[0]), Integer.parseInt(p[1]), Float.parseFloat(p[2]), safe, hole, Integer.parseInt(p[11]), Integer.parseInt(p[12]), Integer.parseInt(p[13]), Integer.parseInt(p[14]), p[15].equals("1"));
            System.out.println(l.x+" "+l.y+" "+l.width+" "+l.height+" "+l.gapLeft+" "+l.gapRight+" "+l.fused+" "+(l.bridge==null?"-":l.bridge[0]+","+l.bridge[1]+","+l.bridge[2]+","+l.bridge[3]));
        }
    }
}
