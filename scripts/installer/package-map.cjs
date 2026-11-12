// Some archived pnpm installations contain copies instead of junctions. Respect
// their recorded per-package dependencies rather than mixing flattened versions.
const fs = require('fs');
const path = require('path');
const Module = require('module');
const base = path.resolve(__dirname, '../../node_modules');
const map = JSON.parse(fs.readFileSync(path.join(base, '.package-map.json'), 'utf8')).packages;
const entries = Object.entries(map).map(([key, value]) => ({ key, ...value, full: path.resolve(base, value.url) }))
  .sort((a, b) => b.full.length - a.full.length);
const resolve = Module._resolveFilename;
const cache = new Map();
Module._resolveFilename = function(request, parent, ...rest) {
  if (!request.startsWith('.') && !path.isAbsolute(request) && !Module.isBuiltin(request)) {
    const name = request.startsWith('@') ? request.split('/').slice(0, 2).join('/') : request.split('/')[0];
    const filename = parent?.filename || '';
    let owner = cache.get(filename);
    if (!owner) { owner = entries.find(entry => filename === entry.full || filename.startsWith(entry.full + path.sep)); cache.set(filename, owner); }
    const target = owner && map[owner.dependencies[name]];
    if (target) return resolve.call(this, path.resolve(base, target.url) + request.slice(name.length), parent, ...rest);
  }
  return resolve.call(this, request, parent, ...rest);
};
