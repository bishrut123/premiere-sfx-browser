/* Collapsible folder tree in the sidebar. */
'use strict';

window.FolderTree = class FolderTree {
  constructor(container, { onSelect, onRemoveRoot }) {
    this.el = container;
    this.onSelect = onSelect;         // (folder | null) => void ; null = All Sounds
    this.onRemoveRoot = onRemoveRoot; // (rootPath) => void
    this.selectedId = 'all';
    this.expanded = this.loadExpanded();

    this.el.addEventListener('click', (e) => {
      const item = e.target.closest('.tree-item');
      if (!item) return;
      if (e.target.closest('.tree-remove')) { this.confirmRemove(e.target.closest('.tree-remove'), item); return; }
      if (e.target.closest('.tree-twisty')) { this.toggle(item.dataset.id); return; }
      this.select(item.dataset.id);
    });
  }

  loadExpanded() {
    try { return new Set(JSON.parse(localStorage.getItem('sfx.expanded') || '[]')); } catch (_) { return new Set(); }
  }

  saveExpanded() {
    try { localStorage.setItem('sfx.expanded', JSON.stringify([...this.expanded])); } catch (_) { /* ignore */ }
  }

  // roots: output of Library.tree(); totalCount: number of sounds in library
  render(roots, totalCount) {
    this.nodes = new Map();
    const frag = document.createDocumentFragment();
    frag.appendChild(this.item({ id: 'all', label: 'All Sounds', count: totalCount, depth: 0, special: true }));

    const sortKids = (node) => [...node.children.values()].sort((a, b) => Library.collator.compare(a.name, b.name));

    const walk = (node, depth, parentEl) => {
      const id = node.rootIndex + '|' + node.dir;
      this.nodes.set(id, node);
      const kids = node.children.size ? sortKids(node) : [];
      const isRoot = depth === 0;
      parentEl.appendChild(this.item({
        id, label: node.name, count: node.count, depth, hasKids: kids.length > 0, isRoot,
        offline: isRoot && !node.root.online, title: isRoot ? node.root.path : node.dir,
      }));
      if (kids.length) {
        const box = document.createElement('div');
        box.className = 'tree-children';
        box.dataset.parent = id;
        box.hidden = !this.expanded.has(id);
        kids.forEach((k) => walk(k, depth + 1, box));
        parentEl.appendChild(box);
      }
    };
    roots.forEach((r) => walk(r, 0, frag));

    this.el.textContent = '';
    this.el.appendChild(frag);
    if (!this.el.querySelector(`[data-id="${CSS.escape(this.selectedId)}"]`)) this.selectedId = 'all';
    this.highlight();
  }

  item({ id, label, count, depth, hasKids, isRoot, offline, special, title }) {
    const el = document.createElement('div');
    el.className = 'tree-item' + (isRoot ? ' root' : '') + (offline ? ' offline' : '') + (special ? ' special' : '');
    el.dataset.id = id;
    el.style.paddingLeft = 4 + depth * 12 + 'px';
    if (title) el.title = title;

    const tw = document.createElement('span');
    tw.className = 'tree-twisty';
    tw.textContent = hasKids ? (this.expanded.has(id) ? '▾' : '▸') : '';
    el.appendChild(tw);

    const name = document.createElement('span');
    name.className = 'tree-label';
    name.textContent = label + (offline ? ' (offline)' : '');
    el.appendChild(name);

    const c = document.createElement('span');
    c.className = 'tree-count';
    c.textContent = count;
    el.appendChild(c);

    if (isRoot) {
      const rm = document.createElement('button');
      rm.className = 'tree-remove';
      rm.title = 'Remove from panel (files are not touched)';
      rm.textContent = '×';
      el.appendChild(rm);
    }
    return el;
  }

  // First click arms the button, second click within 3s removes the root from the panel.
  confirmRemove(btn, item) {
    if (btn.classList.contains('armed')) {
      this.onRemoveRoot(this.nodes.get(item.dataset.id).root.path);
      return;
    }
    btn.classList.add('armed');
    btn.textContent = 'Remove?';
    setTimeout(() => { btn.classList.remove('armed'); btn.textContent = '×'; }, 3000);
  }

  toggle(id) {
    if (this.expanded.has(id)) this.expanded.delete(id); else this.expanded.add(id);
    this.saveExpanded();
    const box = this.el.querySelector(`.tree-children[data-parent="${CSS.escape(id)}"]`);
    if (box) box.hidden = !this.expanded.has(id);
    const tw = this.el.querySelector(`[data-id="${CSS.escape(id)}"] .tree-twisty`);
    if (tw) tw.textContent = this.expanded.has(id) ? '▾' : '▸';
  }

  select(id) {
    this.selectedId = id;
    this.highlight();
    this.onSelect(id === 'all' ? null : this.nodes.get(id));
  }

  // Visually clear the selection (e.g. while a search is active).
  highlight(active = true) {
    for (const el of this.el.querySelectorAll('.tree-item.selected')) el.classList.remove('selected');
    if (!active) return;
    const el = this.el.querySelector(`[data-id="${CSS.escape(this.selectedId)}"]`);
    if (el) el.classList.add('selected');
  }

  get selectedFolder() {
    return this.selectedId === 'all' ? null : this.nodes.get(this.selectedId) || null;
  }
};
