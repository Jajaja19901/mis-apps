// Micro-utilidades DOM: creación declarativa de elementos sin framework.
// Regla de oro: el texto siempre entra por textContent (nunca innerHTML),
// salvo en el renderizador de markdown que ya escapa todo.

type Child = Node | string | null | undefined | false;

export interface Attrs {
  className?: string;
  text?: string;
  title?: string;
  id?: string;
  type?: string;
  value?: string;
  placeholder?: string;
  disabled?: boolean;
  checked?: boolean;
  selected?: boolean;
  htmlFor?: string;
  tabIndex?: number;
  role?: string;
  ariaLabel?: string;
  dataset?: Record<string, string>;
  style?: Partial<CSSStyleDeclaration>;
  onClick?: (e: MouseEvent) => void;
  onInput?: (e: Event) => void;
  onChange?: (e: Event) => void;
  onKeyDown?: (e: KeyboardEvent) => void;
  onDblClick?: (e: MouseEvent) => void;
  onContextMenu?: (e: MouseEvent) => void;
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs.className) el.className = attrs.className;
  if (attrs.text !== undefined) el.textContent = attrs.text;
  if (attrs.title) el.title = attrs.title;
  if (attrs.id) el.id = attrs.id;
  if (attrs.role) el.setAttribute('role', attrs.role);
  if (attrs.ariaLabel) el.setAttribute('aria-label', attrs.ariaLabel);
  if (attrs.tabIndex !== undefined) el.tabIndex = attrs.tabIndex;
  if (attrs.dataset) for (const [k, v] of Object.entries(attrs.dataset)) el.dataset[k] = v;
  if (attrs.style) Object.assign(el.style, attrs.style);
  const anyEl = el as unknown as {
    type?: string;
    value?: string;
    placeholder?: string;
    disabled?: boolean;
    checked?: boolean;
    selected?: boolean;
    htmlFor?: string;
  };
  if (attrs.type !== undefined) anyEl.type = attrs.type;
  if (attrs.value !== undefined) anyEl.value = attrs.value;
  if (attrs.placeholder !== undefined) anyEl.placeholder = attrs.placeholder;
  if (attrs.disabled !== undefined) anyEl.disabled = attrs.disabled;
  if (attrs.checked !== undefined) anyEl.checked = attrs.checked;
  if (attrs.selected !== undefined) anyEl.selected = attrs.selected;
  if (attrs.htmlFor !== undefined) anyEl.htmlFor = attrs.htmlFor;
  if (attrs.onClick) el.addEventListener('click', attrs.onClick as EventListener);
  if (attrs.onInput) el.addEventListener('input', attrs.onInput);
  if (attrs.onChange) el.addEventListener('change', attrs.onChange);
  if (attrs.onKeyDown) el.addEventListener('keydown', attrs.onKeyDown as EventListener);
  if (attrs.onDblClick) el.addEventListener('dblclick', attrs.onDblClick as EventListener);
  if (attrs.onContextMenu) el.addEventListener('contextmenu', attrs.onContextMenu as EventListener);
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    el.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return el;
}

export function clear(el: HTMLElement): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/** Notificaciones no bloqueantes. */
let toastContainer: HTMLElement | null = null;

export function toast(message: string, kind: 'info' | 'ok' | 'error' = 'info', ms = 4200): void {
  if (!toastContainer) {
    toastContainer = h('div', { className: 'toasts' });
    document.body.append(toastContainer);
  }
  const el = h('div', { className: `toast ${kind === 'info' ? '' : kind}`.trim(), text: message, role: 'status' });
  toastContainer.append(el);
  setTimeout(() => el.remove(), ms);
}

/** Modal genérico; devuelve una función para cerrarlo. */
export function openModal(title: string, body: HTMLElement, foot?: HTMLElement): () => void {
  const close = () => backdrop.remove();
  const backdrop = h(
    'div',
    {
      className: 'modal-backdrop',
      onClick: (e) => {
        if (e.target === backdrop) close();
      }
    },
    h(
      'div',
      { className: 'modal', role: 'dialog', ariaLabel: title },
      h('div', { className: 'modal-head' }, title, h('button', { text: '✕', ariaLabel: 'Cerrar', onClick: close })),
      h('div', { className: 'modal-body' }, body),
      foot ? h('div', { className: 'modal-foot' }, foot) : null
    )
  );
  document.body.append(backdrop);
  return close;
}

/** Pregunta modal simple con confirmación. */
export function confirmModal(title: string, message: string, onConfirm: () => void): void {
  const body = h('div', {}, h('p', { text: message }));
  const foot = h('div', { style: { display: 'flex', gap: '8px' } });
  const close = openModal(title, body, foot);
  foot.append(
    h('button', { text: 'Cancelar', onClick: () => close() }),
    h('button', {
      className: 'primary',
      text: 'Confirmar',
      onClick: () => {
        close();
        onConfirm();
      }
    })
  );
}

/** Pide un texto al usuario en un modal; resuelve null si cancela. */
export function promptModal(title: string, label: string, initial = ''): Promise<string | null> {
  return new Promise((resolve) => {
    const input = h('input', { type: 'text', value: initial });
    const body = h('div', { className: 'field' }, h('label', { text: label }), input);
    const foot = h('div', { style: { display: 'flex', gap: '8px' } });
    const close = openModal(title, body, foot);
    const done = (value: string | null) => {
      close();
      resolve(value);
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') done(input.value.trim() || null);
      if (e.key === 'Escape') done(null);
    });
    foot.append(
      h('button', { text: 'Cancelar', onClick: () => done(null) }),
      h('button', { className: 'primary', text: 'Aceptar', onClick: () => done(input.value.trim() || null) })
    );
    setTimeout(() => input.focus(), 30);
  });
}
