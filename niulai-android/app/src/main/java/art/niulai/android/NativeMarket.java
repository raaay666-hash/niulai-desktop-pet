package art.niulai.android;

import java.util.*;
import java.util.regex.*;

/** Pure Java provider contract, shared by the renderer-independent pet and compatibility UI. */
final class NativeMarket {
    static final class Quote {
        final String code,name,time,source;final double price,change,pct,prevClose;final long received;
        Quote(String code,String name,double price,double change,double pct,double prevClose,String time,String source){this.code=code;this.name=name;this.price=price;this.change=change;this.pct=pct;this.prevClose=prevClose;this.time=time;this.source=source;this.received=System.currentTimeMillis();}
    }
    static final class Stock {final String code,name;Stock(String code,String name){this.code=code;this.name=name;}}
    static boolean valid(String value){return value!=null&&value.matches("s_(?:sh|sz)[0-9]{6}|rt_hk[0-9]{5}|gb_[a-z][a-z0-9.-]{0,11}");}
    static String normalize(String input){
        String s=input==null?"":input.trim().replaceAll("\\s+","").toLowerCase(Locale.US);
        if(s.equals("上证")||s.equals("上证指数"))return "s_sh000001";
        if(s.equals("深成")||s.equals("深证成指"))return "s_sz399001";
        if(s.equals("创业板")||s.equals("创业板指"))return "s_sz399006";
        if(valid(s))return s;if(s.matches("(?:sh|sz)[0-9]{6}"))return "s_"+s;
        if(s.matches("[0-9]{6}"))return "s_"+(s.matches("[569].*")?"sh":"sz")+s;
        Matcher hk=Pattern.compile("(?:(?:rt_)?hk([0-9]{1,5})|([0-9]{1,5})\\.hk)").matcher(s);
        if(hk.matches())return "rt_hk"+String.format(Locale.US,"%05d",Integer.parseInt(hk.group(1)!=null?hk.group(1):hk.group(2)));
        if(s.matches("[0-9]{5}"))return "rt_hk"+s;
        s=s.replaceFirst("^\\$","").replaceFirst("\\.us$","").replaceFirst("^us","");
        return s.matches("[a-z][a-z0-9.-]{0,11}")?"gb_"+s:null;
    }
    static String display(String code){return code.startsWith("gb_")?code.substring(3).toUpperCase(Locale.US):code.startsWith("rt_hk")?"HK "+code.substring(5):code.replaceFirst("^s_","");}
    static String currency(String code){return code.startsWith("gb_")?"USD":code.startsWith("rt_hk")?"HKD":"CNY";}
    static String provider(String code){return code.startsWith("rt_hk")?"hk"+code.substring(5):code.startsWith("gb_")?"us"+code.substring(3).toUpperCase(Locale.US):code;}
    static String field(String[] parts,int index){return index>=0&&index<parts.length?parts[index]:"";}
    static double number(String[] parts,int index){try{return Double.parseDouble(field(parts,index));}catch(Exception e){return Double.NaN;}}
    static Quote parse(String body,String code,boolean fallback){
        if(!valid(code)||body==null)return null;
        Matcher match=Pattern.compile((fallback?"v_":"hq_str_")+Pattern.quote(fallback?provider(code):code)+"=\"([^\"]*)\"").matcher(body);
        if(!match.find()||match.group(1).isEmpty())return null;
        String[] p=match.group(1).split(fallback?"~":",",-1);boolean hk=code.startsWith("rt_hk"),us=code.startsWith("gb_");
        int ni,pi,ci,pcti,previ;String time;
        if(fallback){ni=1;pi=3;ci=hk||us?31:4;pcti=hk||us?32:5;previ=hk||us?4:-1;time=hk||us?field(p,30):"";}
        else if(hk){ni=1;pi=6;ci=7;pcti=8;previ=3;time=(field(p,17)+" "+field(p,18)).trim();}
        else if(us){ni=0;pi=1;ci=4;pcti=2;previ=26;time=field(p,3);}
        else{ni=0;pi=1;ci=2;pcti=3;previ=-1;time=field(p,31);}
        double price=number(p,pi),change=number(p,ci),pct=number(p,pcti),previous=number(p,previ);
        if(!(price>0)||Double.isInfinite(price)||Double.isNaN(change)||Double.isInfinite(change)||Double.isNaN(pct)||Double.isInfinite(pct))return null;
        if(Double.isNaN(previous)||Double.isInfinite(previous)||previous<=0)previous=price-change;
        String name=field(p,ni);return new Quote(code,name.isEmpty()?display(code):name,price,change,pct,previous,time,fallback?"tencent":"sina");
    }
    static List<Stock> suggestions(String body){
        List<Stock> result=new ArrayList<>();Matcher m=Pattern.compile("v_hint=\"([\\s\\S]*?)\"").matcher(body==null?"":body);if(!m.find())return result;
        Matcher escaped=Pattern.compile("\\\\u([0-9a-fA-F]{4})").matcher(m.group(1));StringBuffer decoded=new StringBuffer();while(escaped.find())escaped.appendReplacement(decoded,Matcher.quoteReplacement(String.valueOf((char)Integer.parseInt(escaped.group(1),16))));escaped.appendTail(decoded);
        Set<String> seen=new HashSet<>();for(String row:decoded.toString().split("\\^")){String[] p=row.split("~",-1);if(p.length<5||!p[4].equals("GP"))continue;String code=null;
            if(p[0].equals("sh")||p[0].equals("sz"))code="s_"+p[0]+p[1];else if(p[0].equals("hk"))code=normalize("hk"+p[1]);else if(p[0].equals("us"))code=normalize(p[1].replaceFirst("(?i)\\.(oq|o|n|a|ps|k)$",""));
            if(valid(code)&&seen.add(code))result.add(new Stock(code,p[2].isEmpty()?display(code):p[2]));if(result.size()==12)break;
        }return result;
    }
}
