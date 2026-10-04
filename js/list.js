/* Virtualized list: only the visible rows exist in the DOM, so 20k items scroll smoothly. */
'use strict';

window.VirtualList = class VirtualList {
  constructor(container, { rowHeight, renderRow, onSelect, onActivate }) {
    this.el = container;
    this.rowH = rowHeight;
    this.renderRow = renderRow;   // (entry, rowEl) => void
    this.onSelect = onSelect;     // (entry, index) => void
    this.onActivate = onActivate; // (entry, index) => void  (double-click)
    this.items = [];
    this.selected = -1;
    this.rows = new Map();        // index -> row element currently rendered
    this.pool = [];

    this.el.textContent = '';
    this.el.tabIndex = 0; // so the list takes keyboard focus when clicked
    this.spacer = document.createElement('div');
    this.spacer.className = 'vl-spacer';
    this.el.appendChild(this.spacer);

    this.el.addEventListener('scroll', () => this.render());
    new ResizeObserver(() => this.render()).observe(this.el);

    this.el.addEventListener('click', (e) => {
      const row = e.target.closest('.row');
      if (row) this.select(+row.dataset.index, false);
    });
    this.el.addEventListener('dblclick', (e) => {
      const row = e.target.closest('.row');
      if (row && this.onActivate) this.onActivate(this.items[+row.dataset.index], +row.dataset.index);
    });
  }

  // Replace items; keeps the selection on the same entry (by key) if it's still there.
  setItems(items, { resetScroll = false } = {}) {
    const prevKey = this.selected >= 0 && this.items[this.selected] ? this.items[this.selected].key : null;
    this.items = items;
    this.selected = prevKey ? items.findIndex((it) => it.key === prevKey) : -1;
    this.spacer.style.height = items.length * this.rowH + 'px';
    if (resetScroll) this.el.scrollTop = 0;
    for (const [, row] of this.rows) { row.remove(); this.pool.push(row); }
    this.rows.clear();
    this.render();
  }

  select(index, scroll = true) {
    if (index < 0 || index >= this.items.length) return;
    this.selected = index;
    if (scroll) this.scrollToIndex(index);
    for (const [i, row] of this.rows) row.classList.toggle('selected', i === index);
    if (this.onSelect) this.onSelect(this.items[index], index);
  }

  scrollToIndex(index) {
    const top = index * this.rowH;
    const bottom = top + this.rowH;
    if (top < this.el.scrollTop) this.el.scrollTop = top;
    else if (bottom > this.el.scrollTop + this.el.clientHeight) this.el.scrollTop = bottom - this.el.clientHeight;
  }

  // Re-render a single row (e.g. after its playing/favorite state changed).
  refreshRow(index) {
    const row = this.rows.get(index);
    if (row) this.renderRow(this.items[index], row);
  }

  refreshAll() {
    for (const [i, row] of this.rows) this.renderRow(this.items[i], row);
  }

  render() {
    const h = this.el.clientHeight;
    const first = Math.max(0, Math.floor(this.el.scrollTop / this.rowH) - 5);
    const last = Math.min(this.items.length - 1, Math.ceil((this.el.scrollTop + h) / this.rowH) + 5);

    for (const [i, row] of this.rows) {
      if (i < first || i > last) { row.remove(); this.pool.push(row); this.rows.delete(i); }
    }
    for (let i = first; i <= last; i++) {
      if (this.rows.has(i)) continue;
      const row = this.pool.pop() || document.createElement('div');
      row.className = 'row';
      row.draggable = true;
      row.dataset.index = i;
      row.style.top = i * this.rowH + 'px';
      row.classList.toggle('selected', i === this.selected);
      this.renderRow(this.items[i], row);
      this.el.appendChild(row);
      this.rows.set(i, row);
    }
  }
};
