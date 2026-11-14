// Copy a reviewed source allowlist to the existing public release checkout.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const asar=require('@electron/asar');
const root=path.resolve(__dirname,'..'),destination=path.join(root,'artifacts/github-publish-1.5.1');
const excluded=new Set(['node_modules','.git','.ops','.signing','build','dist','qa','__pycache__']);
const selected=['package.json','package-lock.json','pnpm-lock.yaml','main.js','preload.js','index.html','desktop.css','renderer.js','renderer.bundle.js','overlay.html','overlay.css','overlay.js','overlay.bundle.js','main-modules','renderer-modules','scripts','assets/2d/frames/hq','assets/2d/frames/mobile-hq','assets/2d/frames/webp','niulai-android/package.json','niulai-android/package-lock.json','niulai-android/web','niulai-android/app','niulai-android/scripts','niulai-android/tests','docs/电脑版使用说明.md','docs/高清插帧与画质优化-20261113.md'];
for(const file of selected){const source=path.join(root,file),target=path.join(destination,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.cpSync(source,target,{recursive:true,filter:p=>!excluded.has(path.basename(p))&&!/\.(p12|jks|keystore|apk|log|pyc)$/.test(p)});}
const archive=path.join(root,'release/polish-20261113/win-unpacked/resources/app.asar');
const files=asar.listPackage(archive).map(file=>file.replace(/^[\\/]/,'')).filter(file=>!asar.statFile(archive,file).files).map(file=>{const data=asar.extractFile(archive,file);return{name:file.replaceAll('\\','/'),bytes:data.length,sha256:crypto.createHash('sha256').update(data).digest('hex')};});
const version=require('../package.json').version;
const report={version,reference:'Verified Windows '+version+' application',files};
for(const base of [root,destination])fs.writeFileSync(path.join(base,'build/desktop-'+version+'-payload.json'),JSON.stringify(report,null,2)+'\n');
console.log('Prepared source and '+files.length+'-file package reference');
