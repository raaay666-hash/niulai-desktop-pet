const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),site=path.join(root,'niulai-mobile'),release=path.join(root,'release/polish-20261113');
const files=[
 ['Niulai-1.6.0-Setup-x64.exe','application/vnd.microsoft.portable-executable'],
 ['Niulai-1.6.0-portable-x64.exe','application/vnd.microsoft.portable-executable'],
 ['Niulai-1.6.0-mac-arm64.dmg','application/x-apple-diskimage'],
 ['Niulai-1.6.0-mac-x64.dmg','application/x-apple-diskimage'],
 ['Niulai-Android-1.4.0.apk','application/vnd.android.package-archive']
];
const metadata=JSON.parse(fs.readFileSync(path.join(site,'download-files.json')));
for(const[name,type]of files){const data=fs.readFileSync(path.join(release,name));metadata[name]={size:data.length,sha256:crypto.createHash('sha256').update(data).digest('hex'),type,release:'v1.6.0'};}
fs.writeFileSync(path.join(site,'download-files.json'),JSON.stringify(metadata,null,2)+'\n');
let page=fs.readFileSync(path.join(site,'download/index.html'),'utf8');
for(const [old,next] of [
 ['Niulai-1.5.0-Setup-x64-20261112.exe',files[0][0]],['Niulai-1.5.0-portable-x64-20261112.exe',files[1][0]],
 ['Niulai-1.5.0-mac-arm64-20261112.dmg',files[2][0]],['Niulai-1.5.0-mac-x64-20261112.dmg',files[3][0]],
 ['/android/Niulai-Android-1.3.2.apk','/files/'+files[4][0]]])page=page.replaceAll(old,next);
page=page.replaceAll('v1.5.0','v1.6.0').replaceAll('v1.3.2','v1.4.0').replaceAll('20261112-market150','20261114-polish160');
page=page.replace(/<p class="version-update">.*?<\/p>/,'<p class="version-update">电脑版 1.6.0 · Android 1.4.0：高清流畅动画、更顺手的交互和新版更新提醒。<a href="/download/updates/">查看本次更新 →</a></p>');
page=page.replace(/<article class="version-card"[\s\S]*?<\/article>/g,card=>{
 const item=files.find(([name])=>card.includes(name));return item?card.replace(/\d+\.\d+ MB/,(metadata[item[0]].size/1048576).toFixed(1)+' MB'):card;
});
if(!page.includes('href="/download/updates/"'))throw Error('Changelog link missing');
fs.writeFileSync(path.join(site,'download/index.html'),page);
let history=fs.readFileSync(path.join(site,'download/history/index.html'),'utf8');
const add=(id,title,description,links)=>{const heading=new RegExp('(<section id="'+id+'"[^>]*><h2[^>]*>[^<]*</h2>)');if(history.includes('<h3>'+title+'</h3>')&&id==='windows')return;history=history.replace(heading,'$1\n<article class="history-row"><div><h3>'+title+'</h3><p>'+description+'</p></div><div class="history-downloads">'+links+'</div></article>');};
add('windows','v1.5.0','美股时段行情与自有行情源','<a href="/files/Niulai-1.5.0-Setup-x64-20261112.exe" download>安装版</a><a href="/files/Niulai-1.5.0-portable-x64-20261112.exe" download>免安装版</a>');
if(!history.includes('Niulai-Android-1.3.2.apk'))add('android','v1.3.2','逐帧木鱼与手机适配','<a href="/android/Niulai-Android-1.3.2.apk" download>下载安装包</a>');
if(!history.includes('Niulai-1.5.0-mac-arm64-20261112.dmg'))add('mac','v1.5.0','共享桌面功能与美股时段行情','<a href="/files/Niulai-1.5.0-mac-arm64-20261112.dmg" download>Apple 芯片</a><a href="/files/Niulai-1.5.0-mac-x64-20261112.dmg" download>Intel 芯片</a>');
fs.writeFileSync(path.join(site,'download/history/index.html'),history);
let sw=fs.readFileSync(path.join(site,'sw.js'),'utf8').replaceAll('20261112-market150','20261114-polish160');
if(!sw.includes("'download/updates/'"))sw=sw.replace("'download/history/',","'download/history/','download/updates/',");fs.writeFileSync(path.join(site,'sw.js'),sw);
console.log('Prepared 5 versioned downloads with exact size and SHA-256; older versions retained.');
