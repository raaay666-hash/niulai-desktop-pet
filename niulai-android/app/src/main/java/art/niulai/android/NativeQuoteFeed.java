package art.niulai.android;
import android.os.*;
import org.json.JSONObject;

final class NativeQuoteFeed {
    interface Listener{void update(NativeMarket.Quote quote,String error);}
    private final Handler main=new Handler(Looper.getMainLooper());private final QuoteGateway gateway;private final Listener listener;
    private String symbol="s_sh000001",pendingId="";private int interval=10;private long sequence=0;private boolean active=false,busy=false,fallback=false,closed=false;private NativeMarket.Quote quote;
    private final Runnable tick=()->refresh();
    NativeQuoteFeed(Listener listener){this.listener=listener;gateway=new QuoteGateway((id,text,error)->main.post(()->complete(id,text,error)));}
    void configure(String next,int seconds){if(!NativeMarket.valid(next))return;interval=seconds==5||seconds==30?seconds:10;if(!symbol.equals(next)){symbol=next;quote=null;pendingId="";busy=false;main.removeCallbacks(tick);if(active)refresh();}else if(active&&!busy){main.removeCallbacks(tick);main.postDelayed(tick,interval*1000L);}}
    void setActive(boolean value){if(closed)return;boolean changed=active!=value;active=value;gateway.setActive(value);if(!value){pendingId="";busy=false;main.removeCallbacks(tick);}else if(changed)refresh();}
    void refresh(){if(!active||busy||closed)return;main.removeCallbacks(tick);busy=true;fallback=false;pendingId=Long.toString(++sequence);gateway.request(pendingId,"quote",symbol);}
    private void complete(String id,String text,String error){if(closed||!active||!pendingId.equals(id))return;NativeMarket.Quote q=error==null?NativeMarket.parse(text,symbol,fallback):null;
        if(q==null&&!fallback){fallback=true;pendingId=Long.toString(++sequence);gateway.request(pendingId,"fallback",NativeMarket.provider(symbol));return;}
        busy=false;if(q!=null)quote=q;listener.update(quote,q==null?"更新失败，保留上次行情":null);main.postDelayed(tick,interval*1000L);
    }
    void close(){closed=true;active=false;main.removeCallbacksAndMessages(null);gateway.close();}
    static String json(NativeMarket.Quote q){try{JSONObject o=new JSONObject();o.put("code",q.code);o.put("name",q.name);o.put("price",q.price);o.put("changePct",q.pct);o.put("change",q.change);o.put("prevClose",q.prevClose);o.put("dayPrevClose",q.dayPrevClose);o.put("session",q.session);o.put("quotedAt",q.quotedAt);o.put("time",q.time);o.put("source",q.source);o.put("received",q.received);return o.toString();}catch(Exception e){return "{}";}}
}
