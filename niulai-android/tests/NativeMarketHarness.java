package art.niulai.android;
import java.io.*;
import java.util.Base64;
public final class NativeMarketHarness {
    public static void main(String[] args)throws Exception{
        BufferedReader input=new BufferedReader(new InputStreamReader(System.in,"UTF-8"));String line;
        while((line=input.readLine())!=null){String[] p=line.split("\t",-1);String value=new String(Base64.getDecoder().decode(p[p.length-1]),"UTF-8");
            if(p[0].equals("N")){String n=NativeMarket.normalize(value);System.out.println(n==null?"-":n);continue;}
            NativeMarket.Quote q=NativeMarket.parse(value,p[1],p[2].equals("1"));
            if(q==null){System.out.println("-");continue;}
            System.out.println(q.price+"\t"+q.change+"\t"+q.pct+"\t"+q.prevClose+"\t"+Base64.getEncoder().encodeToString(q.name.getBytes("UTF-8"))+"\t"+Base64.getEncoder().encodeToString(q.time.getBytes("UTF-8")));
        }
    }
}
