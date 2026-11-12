package art.niulai.android;
import java.io.*;
public class MarketMoodHarness {
    public static void main(String[] args)throws Exception{
        MarketMood m=new MarketMood();BufferedReader r=new BufferedReader(new InputStreamReader(System.in,"UTF-8"));String line;
        while((line=r.readLine())!=null){String[] p=line.split("\t");if(p[0].equals("R")){m.reset();continue;}System.out.println(m.update(p[0],Double.parseDouble(p[1]),Double.parseDouble(p[2]),Long.parseLong(p[3]),p[4].equals("1"),p[5].equals("1"),Long.parseLong(p[6]),Integer.parseInt(p[7])));}
    }
}
