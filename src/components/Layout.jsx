import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { SCHOOL_SHORT } from '../lib/config';
import { Field, Modal, useToast } from './ui';

function ChangePassword({ onClose }) {
  const toast = useToast();
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (p1.length < 6) return toast('Password must be at least 6 characters', 'err');
    if (p1 !== p2) return toast('Both passwords must match', 'err');
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: p1 });
    setBusy(false);
    if (error) return toast(error.message, 'err');
    toast('Password changed');
    onClose();
  };
  return (
    <Modal title="Change my password" onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={save}>Save password</button></>}>
      <Field label="New password"><input type="password" value={p1} onChange={(e) => setP1(e.target.value)} /></Field>
      <Field label="Type it again"><input type="password" value={p2} onChange={(e) => setP2(e.target.value)} /></Field>
    </Modal>
  );
}

export default function Layout({ children }) {
  const { profile, isAdmin, isHod, signOut, myClasses } = useAuth();
  const [pw, setPw] = useState(false);
  const [open, setOpen] = useState(false);
  const loc = useLocation();

  const nav = [
    { group: 'Students — SWOT' },
    { to: '/', label: 'Dashboard', icon: '◧', end: true },
    { to: '/entry', label: 'Fill SWOT Sheet', icon: '✎' },
    { to: '/report', label: 'Class Report (students)', icon: '▦' },
    { to: '/sheet', label: 'Student SWOT Sheet', icon: '▤' },
    { group: 'Teachers — Evaluation' },
    ...(isHod ? [
      { to: '/eval/pedagogy', label: 'Pedagogy', icon: '◎' },
      { to: '/eval/notebook', label: 'Notebook Inspection', icon: '▣' },
    ] : []),
    { to: '/eval-reports', label: isHod ? 'Evaluation Reports' : 'My Evaluations', icon: '▥' },
  ];
  if (isAdmin) nav.push({ group: 'Admin' }, { to: '/admin', label: 'Admin Panel', icon: '⚙' });

  return (
    <div className="app">
      <aside className={`side ${open ? 'side-open' : ''}`}>
        <div className="brand">
          <img className="brand-logo" src="/logo.png" alt="BIPS" />
          <div>
            <div className="brand-name">{SCHOOL_SHORT} SWOT</div>
            <div className="brand-sub">Nurture · Observe · Evaluate</div>
          </div>
        </div>
        <nav onClick={() => setOpen(false)}>
          {nav.map((n) => n.group ? <div key={n.group} className="nav-group">{n.group}</div> : (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <span className="nav-icon">{n.icon}</span>{n.label}
            </NavLink>
          ))}
        </nav>
        <div className="side-foot">
          <div className="me">
            <div className="avatar">{(profile.name || '?').slice(0, 1).toUpperCase()}</div>
            <div className="me-text">
              <div className="me-name">{profile.name}</div>
              <div className="me-role">{isAdmin ? 'Admin' : profile.role === 'hod' ? 'HOD' : `Teacher · ${myClasses.length} class${myClasses.length === 1 ? '' : 'es'}`}</div>
            </div>
          </div>
          <div className="me-actions">
            <button className="link-btn" onClick={() => setPw(true)}>Change password</button>
            <button className="link-btn" onClick={signOut}>Logout</button>
          </div>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setOpen(!open)} aria-label="Menu">☰</button>
          <div className="topbar-title">{titleFor(loc.pathname)}</div>
        </header>
        <main className="content">{children}</main>
      </div>
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
      {pw && <ChangePassword onClose={() => setPw(false)} />}
    </div>
  );
}

function titleFor(p) {
  if (p.startsWith('/entry')) return 'Fill SWOT Sheet';
  if (p.startsWith('/sheet')) return 'Student SWOT Sheet';
  if (p.startsWith('/report')) return 'Class Report — student wise';
  if (p.startsWith('/admin')) return 'Admin Panel';
  if (p.startsWith('/eval/pedagogy')) return 'Pedagogy — teacher evaluation';
  if (p.startsWith('/eval/notebook')) return 'Notebook Inspection — teacher evaluation';
  if (p.startsWith('/eval-reports')) return 'Teacher Evaluation Reports';
  return 'Dashboard';
}
