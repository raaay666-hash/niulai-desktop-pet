package art.niulai.android;

import java.util.*;

/** Describes retrieved prices; never infers exchange limits, halts or investment signals. */
final class MarketMood {
    private static final class Sample {final long at;final double price;Sample(long t,double p){at=t;price=p;}}
    private final ArrayList<Sample> samples=new ArrayList<>();
    private String key="",mood="loading";private long since,lastSample;
    static String phase(String code,long now){
        Calendar c=Calendar.getInstance(TimeZone.getTimeZone(code.startsWith("gb_")?"America/New_York":"Asia/Shanghai"));c.setTimeInMillis(now);
        int day=c.get(Calendar.DAY_OF_WEEK),m=c.get(Calendar.HOUR_OF_DAY)*60+c.get(Calendar.MINUTE);boolean us=code.startsWith("gb_"),hk=code.startsWith("rt_hk");
        if(day==Calendar.SATURDAY||day==Calendar.SUNDAY)return "weekend";
        if(m>=555&&m<570)return "preopen";
        if(!us&&m>=(hk?720:690)&&m<780)return "lunch";
        return m>=570&&m<(us||hk?960:900)?(m<573?"opening":"trading"):"closed";
    }
    void reset(){samples.clear();key="";mood="loading";since=lastSample=0;}
    String update(String code,double price,double pct,long received,boolean valid,boolean error,long now,int interval){
        String phase=phase(code,now);Calendar c=Calendar.getInstance(TimeZone.getTimeZone(code.startsWith("gb_")?"America/New_York":"Asia/Shanghai"));c.setTimeInMillis(now);
        String nextKey=code+":"+c.get(Calendar.YEAR)+":"+c.get(Calendar.DAY_OF_YEAR)+":"+phase;
        if(!nextKey.equals(key)){samples.clear();lastSample=0;key=nextKey;since=0;}
        valid=valid&&price>0&&!Double.isInfinite(price)&&!Double.isNaN(price)&&!Double.isNaN(pct)&&!Double.isInfinite(pct);
        String next;
        if(error||(valid&&(now-received>Math.max(45000,interval*2500L)||received>now+5000)))next="offline";
        else if(!phase.equals("trading")&&!phase.equals("opening"))next=phase;
        else if(!valid)next="loading";
        else {
            for(int i=samples.size()-1;i>=0;i--)if(now-samples.get(i).at>90000)samples.remove(i);
            if(received>lastSample){samples.add(new Sample(received,price));lastSample=received;if(samples.size()>24)samples.remove(0);}
            double base=samples.isEmpty()?price:samples.get(0).price,min=price,max=price;long span=samples.isEmpty()?0:now-samples.get(0).at;
            for(Sample s:samples){min=Math.min(min,s.price);max=Math.max(max,s.price);}
            double move=(price/base-1)*100,fromLow=(price/min-1)*100,fromHigh=(price/max-1)*100;
            if(samples.size()>=3&&span>=10000&&(min/base-1)*100<=-.5&&fromLow>=.45)next="rebound";
            else if(samples.size()>=3&&span>=10000&&(max/base-1)*100>=.5&&fromHigh<=-.45)next="pullback";
            else if(samples.size()>=2&&span>=5000&&move>=.6)next="surge";
            else if(samples.size()>=2&&span>=5000&&move<=-.6)next="drop";
            else if(phase.equals("opening"))next="opening";
            else if(samples.size()>=3&&span>=20000&&(max/min-1)*100<=.12)next="flat";
            else next=pct>=5?"rally":pct>=2?"clap":pct>.15?"rise":pct>=-.15?"near":pct>-1?"fall":pct>-3?"incense":pct>-5?"cover":"slump";
        }
        boolean immediate=Arrays.asList("offline","loading","preopen","opening","lunch","closed","weekend").contains(next);
        if(!next.equals(mood)&&(immediate||since==0||now-since>=8000)){mood=next;since=now;}
        return mood;
    }
}
