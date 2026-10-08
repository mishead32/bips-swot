import { createContext, useCallback, useContext, useState } from 'react';

/* ---------- Toasts ---------- */
const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((msg, type = 'ok') => {
    const id = Math.random();
    setItems((x) => [...x, { id, msg, type }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), type === 'err' ? 7000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts">
        {items.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>{t.msg}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

/* ---------- Modal ---------- */
export function Modal({ title, children, onClose, footer, wide }) {
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-label={title}>
        <div className="modal-head">
          <h3>{title}</h3>
          {onClose && <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>}
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Confirm({ title, message, confirmText = 'Yes, continue', danger, onYes, onNo, busy }) {
  return (
    <Modal
      title={title}
      onClose={onNo}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onNo} disabled={busy}>Cancel</button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onYes} disabled={busy}>
            {busy ? 'Please wait…' : confirmText}
          </button>
        </>
      }
    >
      <p className="muted-strong">{message}</p>
    </Modal>
  );
}

/* ---------- Small pieces ---------- */
export function Field({ label, children, hint }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Spinner({ text = 'Loading…' }) {
  return <div className="spinner-wrap"><span className="spinner" /> {text}</div>;
}

export function Empty({ icon = '📋', title, children }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <div className="empty-title">{title}</div>
      {children && <div className="empty-text">{children}</div>}
    </div>
  );
}

export function StatusPill({ locked, hasData }) {
  if (locked) return <span className="pill pill-locked">🔒 Submitted &amp; locked</span>;
  if (hasData) return <span className="pill pill-draft">✎ Draft saved</span>;
  return <span className="pill pill-new">○ Not started</span>;
}
