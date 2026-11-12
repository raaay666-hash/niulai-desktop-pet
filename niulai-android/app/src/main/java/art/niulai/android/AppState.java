package art.niulai.android;
import android.content.Context;
import org.json.*;

final class AppState {
    static void feature(Context c,String key,boolean value){if(!key.equals("petEnabled")&&!key.equals("islandEnabled"))return;try{JSONObject state=load(c);state.put(key,value);save(c,state.toString());}catch(Exception ignored){}}
    static String existing(Context c){return PetConfig.prefs(c).getString("app_state","");}
    static JSONObject load(Context c){try{return clean(existing(c));}catch(Exception e){return defaults();}}
    static JSONObject defaults(){try{JSONObject o=new JSONObject();JSONArray stocks=new JSONArray();for(String[] s:new String[][]{{"s_sh000001","上证指数"},{"s_sz399001","深证成指"},{"s_sz399006","创业板指"}}){JSONObject item=new JSONObject();item.put("code",s[0]);item.put("name",s[1]);item.put("cost",0);item.put("shares",0);stocks.put(item);}o.put("stocks",stocks);o.put("selected","s_sh000001");o.put("sound",false);o.put("haptic",true);o.put("motion",true);o.put("private",true);o.put("theme","system");o.put("interval",10);FeatureOptions.copy(o,o);return o;}catch(Exception e){return new JSONObject();}}
    static JSONObject clean(String raw)throws JSONException{
        if(raw==null||raw.length()>32768)throw new JSONException("state size");JSONObject o=new JSONObject(raw);JSONArray input=o.optJSONArray("stocks"),stocks=new JSONArray();java.util.HashSet<String> seen=new java.util.HashSet<>();
        if(input!=null)for(int i=0;i<input.length()&&stocks.length()<20;i++){JSONObject s=input.optJSONObject(i);if(s==null)continue;String code=s.optString("code");if(!NativeMarket.valid(code)||!seen.add(code))continue;JSONObject safe=new JSONObject();safe.put("code",code);String name=s.optString("name",NativeMarket.display(code));safe.put("name",name.substring(0,Math.min(50,name.length())));double cost=s.optDouble("cost",0),shares=s.optDouble("shares",0);safe.put("cost",cost>0&&cost<=1e9?cost:0);safe.put("shares",shares>0&&shares<=1e12?shares:0);stocks.put(safe);}
        if(stocks.length()==0)return defaults();o.put("stocks",stocks);if(!seen.contains(o.optString("selected")))o.put("selected",stocks.getJSONObject(0).getString("code"));
        for(String key:new String[]{"sound","haptic","motion","private","smartScene"})o.put(key,o.optBoolean(key,!key.equals("sound")));
        int interval=o.optInt("interval",10);o.put("interval",interval==5||interval==30?interval:10);String theme=o.optString("theme","system");o.put("theme",theme.equals("light")||theme.equals("dark")?theme:"system");FeatureOptions.copy(o,o);return o;
    }
    static void save(Context c,String raw){try{PetConfig.prefs(c).edit().putString("app_state",clean(raw).toString()).apply();}catch(Exception ignored){}}
}
