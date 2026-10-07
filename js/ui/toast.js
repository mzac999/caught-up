// Small transient message + simple confirm sheet.

let current = null;
/** toast('Saved') or toast('Marked caught up', 4000, { action: 'Undo', onAction }) */
export function toast(msg, ms = 1600, opts = {}) {
  if (current) current.remove();
  const t = document.createElement('div');
  t.className = 'toast' + (opts.action ? ' has-action' : '');
  const span = document.createElement('span');
  span.textContent = msg;
  t.append(span);
  if (opts.action) {
    const b = document.createElement('button');
    b.textContent = opts.action;
    b.onclick = () => {
      t.remove();
      opts.onAction && opts.onAction();
    };
    t.append(b);
  }
  document.body.append(t);
  current = t;
  setTimeout(() => {
    t.classList.add('out');
    setTimeout(() => t.remove(), 220);
  }, ms);
}

/** Bottom confirmation sheet. Resolves true/false. */
export function confirmSheet({ title, message, confirmLabel = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    const bd = document.createElement('div');
    bd.className = 'sheet-backdrop';
    bd.innerHTML = `
      <div class="sheet" role="dialog" aria-modal="true">
        <h3></h3><p></p>
        <button class="btn ${danger ? 'danger' : 'primary'}" data-ok></button>
        <button class="btn ghost" data-cancel>Cancel</button>
      </div>`;
    bd.querySelector('h3').textContent = title;
    bd.querySelector('p').textContent = message;
    bd.querySelector('[data-ok]').textContent = confirmLabel;
    const done = (v) => {
      bd.remove();
      resolve(v);
    };
    bd.addEventListener('click', (e) => {
      if (e.target === bd || e.target.closest('[data-cancel]')) done(false);
      else if (e.target.closest('[data-ok]')) done(true);
    });
    document.body.append(bd);
  });
}
