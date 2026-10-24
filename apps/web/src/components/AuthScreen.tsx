import { FormEvent, useState } from 'react';
import { ArrowRight, ShieldCheck, Bike } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function AuthScreen() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault(); setLoading(true); setMessage(''); setError('');
    try {
      if (!supabase) throw new Error('Supabase is not configured. Add the project URL and publishable key.');
      if (mode === 'signup') {
        const { data, error: authError } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { full_name: name.trim() } } });
        if (authError) throw authError;
        if (!data.session) setMessage('Account created. Check your email to confirm the address, then sign in.');
        else setMessage('Account created successfully.');
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (authError) throw authError;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed. Please try again.');
    } finally { setLoading(false); }
  }

  return <div className="auth-shell">
    <section className="auth-story">
      <div className="brand brand-light"><span className="brand-mark"><Bike size={24} /></span><span>MotoSave</span></div>
      <div className="auth-story-content">
        <span className="eyebrow light-eyebrow">FINANCIAL CONFIDENCE FOR EVERY RIDE</span>
        <h1>Your hard work deserves a stronger future.</h1>
        <p>Keep your savings goals, financing requests, motorcycle records, and insurance reminders in one clear place.</p>
        <div className="auth-feature"><ShieldCheck size={18} /> Your records stay protected by account-level access controls.</div>
      </div>
      <div className="auth-story-footer">Built for the people who keep Rwanda moving.</div>
    </section>
    <section className="auth-form-wrap"><div className="auth-form-card">
      <div className="auth-form-heading"><span className="eyebrow">WELCOME TO MOTOSAVE</span><h2>{mode === 'signin' ? 'Sign in to your account' : 'Create your account'}</h2><p>{mode === 'signin' ? 'Pick up where your next goal begins.' : 'A few details to set up your financial workspace.'}</p></div>
      <form className="form-stack" onSubmit={submit}>
        {mode === 'signup' && <label>Full name<input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required minLength={2} placeholder="Your full name" /></label>}
        <label>Email address<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required placeholder="you@example.com" /></label>
        <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} required minLength={8} placeholder="At least 8 characters" /></label>
        {error && <div className="alert alert-error">{error}</div>}{message && <div className="alert alert-success">{message}</div>}
        <button className="button button-primary button-wide" disabled={loading} type="submit">{loading ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'} <ArrowRight size={17} /></button>
      </form>
      <div className="auth-switch">{mode === 'signin' ? 'New to MotoSave?' : 'Already have an account?'} <button className="text-button" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); setMessage(''); }}>{mode === 'signin' ? 'Create an account' : 'Sign in'}</button></div>
      <p className="small muted privacy-note">Never share your payment PIN, banking password, or verification code with anyone.</p>
    </div></section>
  </div>;
}
