// Glisser du doigt (Pointer Events), pensé pour l'iPad et la dyspraxie.
// Un simple toucher reste un toucher (tap) : on peut toujours faire « toucher l'élément, puis la cible ».
// Le glissé ne démarre qu'après un petit déplacement, et le dépôt se fait sur la cible la plus proche.

const THRESHOLD = 10; // px avant de considérer que le doigt glisse

// opts : { can(), tap(), start(x, y), move(x, y), end(x, y), cancel() }
export function draggable(el, opts) {
  el.classList.add('drag');
  let id = null, x0 = 0, y0 = 0, dragging = false, suppress = 0;

  el.addEventListener('pointerdown', (e) => {
    if (id !== null || (e.pointerType === 'mouse' && e.button !== 0)) return;
    id = e.pointerId; x0 = e.clientX; y0 = e.clientY; dragging = false;
    try { el.setPointerCapture(id); } catch { /* rien */ }
  });

  el.addEventListener('pointermove', (e) => {
    if (e.pointerId !== id) return;
    if (!dragging) {
      if (Math.hypot(e.clientX - x0, e.clientY - y0) < THRESHOLD) return;
      if (opts.can && !opts.can()) { id = null; return; }
      dragging = true;
      opts.start?.(x0, y0);
    }
    e.preventDefault();
    opts.move?.(e.clientX, e.clientY);
  });

  const stop = (e, dropped) => {
    if (e.pointerId !== id) return;
    id = null;
    if (!dragging) return;
    dragging = false;
    suppress = performance.now() + 500; // pas de « tap » juste après un glissé
    if (dropped) opts.end?.(e.clientX, e.clientY);
    else opts.cancel?.();
  };
  el.addEventListener('pointerup', (e) => stop(e, true));
  el.addEventListener('pointercancel', (e) => stop(e, false));
  el.addEventListener('lostpointercapture', (e) => stop(e, false));

  el.addEventListener('click', (e) => {
    if (performance.now() < suppress) { e.preventDefault(); return; }
    opts.tap?.(e);
  });
}

// Élément le plus proche du point (x, y), à moins de `margin` pixels de son bord ; sinon null.
export function nearest(els, x, y, margin = 80) {
  let best = null, bd = Infinity;
  for (const el of els) {
    const r = el.getBoundingClientRect();
    const dx = Math.max(r.left - x, 0, x - r.right);
    const dy = Math.max(r.top - y, 0, y - r.bottom);
    const d = Math.hypot(dx, dy);
    if (d < bd) { bd = d; best = el; }
  }
  return bd <= margin ? best : null;
}

// Relance une petite animation CSS (classe retirée après `ms`).
export function flash(el, cls, ms = 900) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
  clearTimeout(el[`_${cls}`]);
  el[`_${cls}`] = setTimeout(() => el.classList.remove(cls), ms);
}
