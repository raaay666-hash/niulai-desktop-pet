package art.niulai.android;
import android.content.Context;
import android.graphics.*;
import java.io.*;
final class BullBitmap {
    private static Bitmap cached;private static Bitmap atlas;private static final Bitmap[] poses=new Bitmap[9];
    static synchronized Bitmap pose(Context c,int index){index=Math.max(0,Math.min(8,index));if(poses[index]!=null)return poses[index];try{if(atlas==null){try(InputStream in=c.getAssets().open("web/assets/bull-poses-v3.png")){BitmapFactory.Options options=new BitmapFactory.Options();options.inSampleSize=2;atlas=BitmapFactory.decodeStream(in,null,options);}}int width=atlas.getWidth()/3,height=atlas.getHeight()/3;poses[index]=Bitmap.createBitmap(atlas,index%3*width,index/3*height,width,height);return poses[index];}catch(Exception e){return get(c);}}
    static synchronized Bitmap get(Context c){
        if(cached!=null)return cached;
        try(InputStream stream=c.getAssets().open("web/assets/bull-window-v2.png")){
            BitmapFactory.Options opt=new BitmapFactory.Options();opt.inSampleSize=4;
            Bitmap image=BitmapFactory.decodeStream(stream,null,opt);int w=image.getWidth(),h=image.getHeight(),n=w*h;
            int[] pixels=new int[n],queue=new int[n];boolean[] seen=new boolean[n];image.getPixels(pixels,0,w,0,0,w,h);int head=0,tail=0;
            for(int i=0;i<n;i++)if(i<w||i>=n-w||i%w==0||i%w==w-1){if(background(pixels[i])){seen[i]=true;queue[tail++]=i;}}
            while(head<tail){int i=queue[head++];int[] neighbors={i%w>0?i-1:-1,i%w<w-1?i+1:-1,i>=w?i-w:-1,i<n-w?i+w:-1};for(int next:neighbors)if(next>=0&&!seen[next]&&background(pixels[next])){seen[next]=true;queue[tail++]=next;}}
            int left=w,top=h,right=0,bottom=0;
            for(int i=0;i<n;i++){if(seen[i])pixels[i]=0;else if(Color.alpha(pixels[i])>0){left=Math.min(left,i%w);right=Math.max(right,i%w);top=Math.min(top,i/w);bottom=Math.max(bottom,i/w);}}
            Bitmap clean=Bitmap.createBitmap(pixels,w,h,Bitmap.Config.ARGB_8888);
            cached=Bitmap.createBitmap(clean,left,top,right-left+1,bottom-top+1);if(cached!=clean)clean.recycle();image.recycle();return cached;
        }catch(Exception e){return null;}
    }
    private static boolean background(int color){int r=Color.red(color),g=Color.green(color),b=Color.blue(color);return Math.max(r,Math.max(g,b))-Math.min(r,Math.min(g,b))<=15&&(r+g+b)/3>=222;}
}
