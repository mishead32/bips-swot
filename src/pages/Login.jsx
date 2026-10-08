import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { SCHOOL_NAME, SCHOOL_PLACE } from '../lib/config';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [show, setShow] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error) setErr(error.message === 'Invalid login credentials' ? 'Wrong email or password. Please check and try again.' : error.message);
    setBusy(false);
  };

  return (
    <div className="login-wrap">
      <div className="login-art">
        <div className="orbs" aria-hidden="true"><i /><i /><i /><i /><i /></div>
        <div className="login-art-inner">
          <div className="logo3d-stage">
            <div className="logo3d">
              <img src="/logo.png" alt="BIPS — Discipline, Knowledge, Dignity" />
            </div>
            <div className="logo3d-shadow" />
          </div>
          <h1>SWOT Analysis<br />System</h1>
          <p>Observation &amp; evaluation to nurture our child — monthly skill ratings and academic records, one place.</p>
          <div className="login-quads">
            <span style={{ '--d': '0s' }}>Strengths</span><span style={{ '--d': '.6s' }}>Weaknesses</span><span style={{ '--d': '1.2s' }}>Opportunities</span><span style={{ '--d': '1.8s' }}>Threats</span>
          </div>
        </div>
      </div>
      <form className="login-form" onSubmit={submit}>
        <div className="login-school"><img className="login-school-logo" src="/logo.png" alt="" />
          <div className="login-school-name">{SCHOOL_NAME}</div>
          <div className="muted">{SCHOOL_PLACE}</div>
        </div>
        <h2>Login</h2>
        <p className="muted small">Admin and teachers use the same login. Your email is your username.</p>
        <label className="field">
          <span className="field-label">Email</span>
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="name@school.com" />
        </label>
        <label className="field">
          <span className="field-label">Password</span>
          <div className="pw-row">
            <input type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</button>
          </div>
        </label>
        {err && <div className="alert alert-err">{err}</div>}
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Signing in…' : 'Login'}</button>
        <p className="muted small">Forgot password? Ask the Admin (MIS) to reset it.</p>
      </form>
    </div>
  );
}
