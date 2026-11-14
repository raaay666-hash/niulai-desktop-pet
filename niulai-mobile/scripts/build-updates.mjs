import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const history=JSON.parse(fs.readFileSync(path.join(root,'release-history.json')));
const latest=history[0],url='https://niulai.raaay.art/download/#versions';
const desktop=JSON.parse(fs.readFileSync(path.join(root,'../package.json'))).version;
const android=JSON.parse(fs.readFileSync(path.join(root,'../niulai-android/package.json'))).version;
if(latest.desktop!==desktop||latest.android!==android)throw Error('Update release-history.json before publishing a new application version.');
const downloads=JSON.parse(fs.readFileSync(path.join(root,'download-files.json')));
for(const file of [`Niulai-${desktop}-Setup-x64.exe`,`Niulai-${desktop}-portable-x64.exe`,`Niulai-${desktop}-mac-arm64.dmg`,`Niulai-${desktop}-mac-x64.dmg`,`Niulai-Android-${android}.apk`]) {
  if(!downloads[file]||!/^\w{64}$/.test(downloads[file].sha256)||!(downloads[file].size>0))throw Error('Verified download metadata is required before publication: '+file);
}
const manifest={schema:1,releases:Object.fromEntries(['desktop','android'].map(platform=>[platform,{version:latest[platform],status:'published',publishedAt:latest.date+'T00:00:00+08:00',url,notes:latest.notes}]))};
fs.writeFileSync(path.join(root,'updates.json'),JSON.stringify(manifest,null,2)+'\n');
const escape=text=>String(text).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const cards=history.map(release=>`<article class="release-entry"><time datetime="${escape(release.date)}">${escape(release.date.replaceAll('-','.'))}</time><h2>${escape(release.title)}</h2><p class="release-platforms">Windows / macOS ${escape(release.desktop)} · Android ${escape(release.android)}</p><ul>${[...release.notes,...(release.webNotes||[])].map(note=>'<li>'+escape(note)+'</li>').join('')}</ul></article>`).join('\n');
fs.mkdirSync(path.join(root,'download/updates'),{recursive:true});
fs.writeFileSync(path.join(root,'download/updates/index.html'),`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="查看牛来盯盘 Windows、Mac 与 Android 每次更新的内容。"><title>更新记录 · 牛来盯盘</title><link rel="icon" href="/assets/head.png"><script src="/theme.js"></script><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/download.css?v=20261114-polish160"></head><body class="download-page history-page"><header class="site-header"><a class="site-brand" href="/download/">牛来盯盘</a><nav aria-label="页面导航"><a class="back-link" href="/download/#versions">下载最新版 ↗</a></nav></header><main><header class="history-heading"><p class="release-eyebrow">每一次，都更好一点。</p><h1>更新记录</h1></header><section class="release-timeline">${cards}</section><p class="release-footer"><a href="/download/history/">寻找过往版本 →</a></p></main></body></html>`);
console.log('Update manifest and changelog generated from one release history.');
