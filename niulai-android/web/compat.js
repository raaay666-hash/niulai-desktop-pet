(function () {
  'use strict';
  if (!Object.fromEntries) Object.fromEntries = function (entries) { var result = {}; entries.forEach(function (entry) { result[entry[0]] = entry[1]; }); return result; };
  if (!Element.prototype.append) Element.prototype.append = function () { for (var i = 0; i < arguments.length; i++) this.appendChild(typeof arguments[i] === 'string' ? document.createTextNode(arguments[i]) : arguments[i]); };
  if (!Element.prototype.replaceChildren) Element.prototype.replaceChildren = function () { while (this.firstChild) this.removeChild(this.firstChild); this.append.apply(this, arguments); };
  // Some OEM WebViews expose a dialog element without the modal methods.
  var dialog = document.createElement('dialog');
  if (typeof dialog.showModal !== 'function') {
    document.addEventListener('DOMContentLoaded', function () {
      var dialogs = document.querySelectorAll('dialog');
      for (var i = 0; i < dialogs.length; i++) (function (d) {
        var shade = document.createElement('div'); shade.className = 'dialog-fallback-shade'; shade.hidden = true; document.body.appendChild(shade);
        Object.defineProperty(d, 'open', { get: function () { return d.hasAttribute('open'); } });
        d.showModal = function () { d.setAttribute('open', ''); d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); shade.hidden = false; var close = d.querySelector('.close-dialog'); if (close) close.focus(); };
        d.close = function () { d.removeAttribute('open'); shade.hidden = true; d.dispatchEvent(new Event('close')); };
        shade.onclick = d.close;
      })(dialogs[i]);
    });
  }
})();
