package art.niulai.android;

import java.util.*;
import java.util.regex.*;
import java.time.*;
import java.time.format.DateTimeFormatter;

/** Pure Java provider contract, shared by the renderer-independent pet and compatibility UI. */
final class NativeMarket {
    static final class Quote {
        final String code,name,time,source;final double price,change,pct,prevClose;final long received;
        double dayPrevClose; Long quotedAt; String session = "regular";
        Quote(String code,String name,double price,double change,double pct,double prevClose,String time,String source){this.code=code;this.name=name;this.price=price;this.change=change;this.pct=pct;this.prevClose=prevClose;this.dayPrevClose=prevClose;this.time=time;this.source=source;this.received=System.currentTimeMillis();}
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
    static Long quoteTime(String text, ZoneId zone, long reference) {
        try {
            if (text.matches("[0-9]{4}[-/].*")) return LocalDateTime.parse(text.replace('/', '-').replace('T',' '), DateTimeFormatter.ofPattern("uuuu-MM-dd HH:mm:ss")).atZone(zone).toInstant().toEpochMilli();
            Matcher m = Pattern.compile("(?i)^([a-z]{3})\\s+(\\d{1,2})\\s+(\\d{1,2}):(\\d{2})(AM|PM)(?:\\s+(EST|EDT))?$").matcher(text.trim());
            if (!m.matches()) return null;
            int month = Arrays.asList("jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec").indexOf(m.group(1).toLowerCase(Locale.US)) + 1;
            int day = Integer.parseInt(m.group(2)), rawHour = Integer.parseInt(m.group(3)), minute = Integer.parseInt(m.group(4));
            if (rawHour < 1 || rawHour > 12) return null;
            int hour = rawHour % 12 + (m.group(5).equalsIgnoreCase("PM") ? 12 : 0);
            int year = Instant.ofEpochMilli(reference).atZone(zone).getYear(); Long nearest = null;
            for (int y = year - 1; y <= year + 1; y++) {
                try {
                    LocalDateTime wall = LocalDateTime.of(y, month, day, hour, minute);
                    long value = m.group(6) == null ? wall.atZone(zone).toInstant().toEpochMilli() : wall.toInstant(ZoneOffset.ofHours(m.group(6).equalsIgnoreCase("EDT") ? -4 : -5)).toEpochMilli();
                    if (!Instant.ofEpochMilli(value).atZone(zone).toLocalDateTime().equals(wall)) continue;
                    if (nearest == null || Math.abs(value-reference) < Math.abs(nearest-reference)) nearest = value;
                } catch (DateTimeException ignored) { }
            }
            return nearest;
        } catch (Exception ignored) { return null; }
    }
    static Quote parse(String body,String code,boolean fallback){
        if(!valid(code)||body==null)return null;
        Matcher match=Pattern.compile((fallback?"v_":"hq_str_")+Pattern.quote(fallback?provider(code):code)+"=\"([^\"]*)\"").matcher(body);
        if(!match.find()||match.group(1).isEmpty())return null;
        String[] p=match.group(1).split(fallback?"~":",",-1);boolean hk=code.startsWith("rt_hk"),us=code.startsWith("gb_");
        int ni,pi,ci,pcti,previ;String time;
        if(fallback){ni=1;pi=3;ci=hk||us?31:4;pcti=hk||us?32:5;previ=hk||us?4:-1;time=hk||us?field(p,30):"";}
        else if(hk){ni=1;pi=6;ci=7;pcti=8;previ=3;time=(field(p,17)+" "+field(p,18)).trim();}
        else if(us){ni=0;pi=1;ci=4;pcti=2;previ=26;time=field(p,25);}
        else{ni=0;pi=1;ci=2;pcti=3;previ=-1;time=field(p,31);}
        double price=number(p,pi),change=number(p,ci),pct=number(p,pcti),previous=number(p,previ);
        if(!(price>0)||Double.isInfinite(price)||Double.isNaN(change)||Double.isInfinite(change)||Double.isNaN(pct)||Double.isInfinite(pct))return null;
        if(Double.isNaN(previous)||Double.isInfinite(previous)||previous<=0)previous=price-change;
        String name=field(p,ni); Quote result = new Quote(code,name.isEmpty()?display(code):name,price,change,pct,previous,time,fallback?"tencent":"sina");
        if (!us) return result;
        long now = System.currentTimeMillis(); ZoneId zone = ZoneId.of("America/New_York");
        Long provider = fallback ? null : quoteTime(field(p,3), ZoneId.of("Asia/Shanghai"), now);
        long reference = provider == null ? now : provider;
        result.quotedAt = quoteTime(time, zone, reference);
        if (fallback) return result;
        double extended = number(p,21); Long extendedAt = quoteTime(field(p,24),zone,reference);
        if (!(extended>0) || Double.isInfinite(extended) || extendedAt == null || extendedAt > now+90000 || result.quotedAt != null && extendedAt <= result.quotedAt) return result;
        ZonedDateTime clock = Instant.ofEpochMilli(extendedAt).atZone(zone); int minutes = clock.getHour()*60+clock.getMinute();
        if (clock.getDayOfWeek().getValue()>5) return result;
        String phase = minutes>=240 && minutes<570 ? "pre" : minutes>=960 && minutes<1200 ? "post" : "";
        if (phase.isEmpty()) return result;
        Quote selected = new Quote(code,result.name,extended,extended-price,(extended-price)/price*100,price,field(p,24),"sina");
        selected.session=phase; selected.quotedAt=extendedAt; selected.dayPrevClose=phase.equals("pre")?price:previous;
        return selected;
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
