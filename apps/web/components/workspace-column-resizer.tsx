'use client';

import { useEffect } from 'react';

const MIN_COLUMN_WIDTH = 72;
const MAX_COLUMN_WIDTH = 960;
const HANDLE_CLASS = 'workspace-column-resize-handle';
const READY_ATTR = 'data-column-resize-ready';
const ORIGINAL_WIDTH_ATTR = 'data-column-resize-original-width';
const ORIGINAL_LAYOUT_ATTR = 'data-column-resize-original-layout';

type ActiveResize = {
  handle: HTMLElement;
  table: HTMLTableElement;
  index: number;
  startX: number;
  startWidth: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function headerCells(table: HTMLTableElement) {
  const row = table.tHead?.rows[0];
  if (!row) return [];
  return [...row.cells].filter(
    (cell) => cell instanceof HTMLTableCellElement && cell.colSpan === 1,
  );
}

function ensureColGroup(table: HTMLTableElement, cells: HTMLTableCellElement[]) {
  const existing = table.querySelector(':scope > colgroup[data-column-resize-group="true"]');
  if (existing instanceof HTMLElement) return existing;

  table.setAttribute(ORIGINAL_WIDTH_ATTR, table.style.width);
  table.setAttribute(ORIGINAL_LAYOUT_ATTR, table.style.tableLayout);

  const group = document.createElement('colgroup');
  group.dataset.columnResizeGroup = 'true';
  cells.forEach(() => group.appendChild(document.createElement('col')));
  table.insertBefore(group, table.tHead ?? table.firstChild);

  // Freeze the initial geometry before switching to fixed layout. This keeps
  // the current Seller/Admin table layout and makes each drag deterministic.
  const columns = [...group.children].filter(
    (column): column is HTMLTableColElement => column instanceof HTMLTableColElement,
  );
  cells.forEach((cell, index) => {
    const width = Math.round(cell.getBoundingClientRect().width);
    if (width > 0 && columns[index]) columns[index].style.width = `${width}px`;
  });
  table.style.tableLayout = 'fixed';
  return group;
}

function widthForColumn(table: HTMLTableElement, index: number) {
  const group = table.querySelector(':scope > colgroup[data-column-resize-group="true"]');
  const column = group?.children[index];
  return column instanceof HTMLTableColElement ? column : null;
}

function setColumnWidth(table: HTMLTableElement, index: number, width: number) {
  const cells = headerCells(table);
  const cell = cells[index];
  const column = widthForColumn(table, index) ?? ensureColGroup(table, cells).children[index];
  if (!(column instanceof HTMLTableColElement) || !cell) return;
  const currentColumnWidth =
    Number.parseFloat(column.style.width) || cell.getBoundingClientRect().width;
  const currentTableWidth = table.getBoundingClientRect().width;
  const nextWidth = clamp(width, MIN_COLUMN_WIDTH, MAX_COLUMN_WIDTH);
  column.style.width = `${Math.round(nextWidth)}px`;
  cell.style.width = `${Math.round(nextWidth)}px`;
  const viewportWidth = table.parentElement?.clientWidth ?? 0;
  table.style.width = `${Math.max(viewportWidth, currentTableWidth + nextWidth - currentColumnWidth)}px`;
}

function removeHandles(table: HTMLTableElement) {
  table.querySelectorAll(`:scope > thead .${HANDLE_CLASS}`).forEach((handle) => handle.remove());
}

function syncHandleHeight(table: HTMLTableElement) {
  const headerRow = table.tHead?.rows[0];
  if (!headerRow) return;
  const tableRect = table.getBoundingClientRect();
  const headerRect = headerRow.getBoundingClientRect();
  const height = Math.max(1, Math.round(tableRect.bottom - headerRect.top));

  table.querySelectorAll<HTMLElement>(`:scope > thead .${HANDLE_CLASS}`).forEach((handle) => {
    const cell = handle.parentElement;
    if (!(cell instanceof HTMLTableCellElement)) return;
    const cellRect = cell.getBoundingClientRect();
    handle.style.top = `${Math.round(headerRect.top - cellRect.top)}px`;
    handle.style.height = `${height}px`;
    handle.style.bottom = 'auto';
  });
}

function installTable(table: HTMLTableElement) {
  if (table.getAttribute(READY_ATTR) === 'true') return;
  const cells = headerCells(table);
  if (cells.length < 2) return;

  ensureColGroup(table, cells);
  removeHandles(table);
  cells.forEach((cell, index) => {
    if (index === cells.length - 1) return;
    if (!cell.style.position) cell.style.position = 'relative';
    const handle = document.createElement('span');
    handle.className = HANDLE_CLASS;
    handle.dataset.columnIndex = String(index);
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-orientation', 'vertical');
    handle.setAttribute(
      'aria-label',
      `Điều chỉnh độ rộng cột ${cell.textContent?.trim() || index + 1}`,
    );
    handle.tabIndex = 0;
    cell.appendChild(handle);
  });
  table.setAttribute(READY_ATTR, 'true');
}

function refreshTables(root: HTMLElement, tableObserver?: ResizeObserver) {
  root.querySelectorAll<HTMLTableElement>('table').forEach((table) => {
    installTable(table);
    syncHandleHeight(table);
    tableObserver?.observe(table);
  });
}

export function WorkspaceColumnResizer({
  rootSelector,
}: {
  rootSelector: '.seller-workspace' | '.admin-workspace';
}) {
  useEffect(() => {
    const roots = [...document.querySelectorAll<HTMLElement>(rootSelector)];
    if (!roots.length) return undefined;

    let active: ActiveResize | null = null;
    const tableResizeObserver =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver((entries) => {
            entries.forEach((entry) => {
              if (entry.target instanceof HTMLTableElement) syncHandleHeight(entry.target);
            });
          });

    const finishResize = () => {
      active?.handle.classList.remove('is-active');
      active = null;
      document.body.classList.remove('is-resizing-column');
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!active) return;
      setColumnWidth(active.table, active.index, active.startWidth + event.clientX - active.startX);
    };

    const onPointerUp = () => finishResize();

    const onPointerDown = (event: PointerEvent) => {
      const target =
        event.target instanceof Element ? event.target.closest(`.${HANDLE_CLASS}`) : null;
      if (!(target instanceof HTMLElement)) return;
      const cell = target.parentElement;
      const table = cell?.closest('table');
      if (!(cell instanceof HTMLTableCellElement) || !(table instanceof HTMLTableElement)) return;
      const index = Number(target.dataset.columnIndex);
      if (!Number.isInteger(index) || index < 0) return;
      const column =
        widthForColumn(table, index) ?? ensureColGroup(table, headerCells(table)).children[index];
      if (!(column instanceof HTMLTableColElement)) return;
      event.preventDefault();
      active = {
        handle: target,
        table,
        index,
        startX: event.clientX,
        startWidth: cell.getBoundingClientRect().width,
      };
      document.body.classList.add('is-resizing-column');
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.target instanceof HTMLElement) || !event.target.classList.contains(HANDLE_CLASS))
        return;
      const cell = event.target.parentElement;
      const table = cell?.closest('table');
      if (!(cell instanceof HTMLTableCellElement) || !(table instanceof HTMLTableElement)) return;
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const current = cell.getBoundingClientRect().width;
      const index = Number(event.target.dataset.columnIndex);
      if (!Number.isInteger(index) || index < 0) return;
      setColumnWidth(table, index, current + (event.key === 'ArrowRight' ? 16 : -16));
    };

    roots.forEach((root) => {
      refreshTables(root, tableResizeObserver);
      root.addEventListener('pointerdown', onPointerDown);
      root.addEventListener('keydown', onKeyDown);
    });
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);

    const observer = new MutationObserver(() =>
      roots.forEach((root) => refreshTables(root, tableResizeObserver)),
    );
    roots.forEach((root) => observer.observe(root, { childList: true, subtree: true }));

    return () => {
      observer.disconnect();
      tableResizeObserver?.disconnect();
      roots.forEach((root) => {
        root.removeEventListener('pointerdown', onPointerDown);
        root.removeEventListener('keydown', onKeyDown);
        root.querySelectorAll(`.${HANDLE_CLASS}`).forEach((handle) => handle.remove());
        root.querySelectorAll<HTMLTableElement>(`table[${READY_ATTR}]`).forEach((table) => {
          table.removeAttribute(READY_ATTR);
          table.style.width = table.getAttribute(ORIGINAL_WIDTH_ATTR) ?? '';
          table.style.tableLayout = table.getAttribute(ORIGINAL_LAYOUT_ATTR) ?? '';
          table.removeAttribute(ORIGINAL_WIDTH_ATTR);
          table.removeAttribute(ORIGINAL_LAYOUT_ATTR);
          table.querySelector(':scope > colgroup[data-column-resize-group="true"]')?.remove();
          table.querySelectorAll('th').forEach((cell) => {
            cell.style.position = '';
            cell.style.width = '';
          });
        });
      });
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      finishResize();
    };
  }, [rootSelector]);

  return null;
}
