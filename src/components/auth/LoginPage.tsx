import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  Lock,
  Mail,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  Sparkles,
  Store,
  CheckCircle2,
  KeyRound,
  Info,
} from 'lucide-react';

export const LoginPage: React.FC = () => {
  const { signInWithEmail, signUpWithEmail, isSupabaseActive, authError, users } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setSuccessMessage(null);

    if (!email.trim() || !password.trim()) {
      setLocalError('Please enter both your email address and password.');
      return;
    }

    if (isSignUp) {
      if (!name.trim()) {
        setLocalError('Please enter your full name.');
        return;
      }
      if (password !== confirmPassword) {
        setLocalError('Passwords do not match.');
        return;
      }
      if (password.length < 6) {
        setLocalError('Password must be at least 6 characters.');
        return;
      }

      setIsLoading(true);
      try {
        const result = await signUpWithEmail(email.trim(), password, name);
        if (result.success) {
          if (result.message) {
            setSuccessMessage(result.message);
            // Switch to login if confirmation is required
            setIsSignUp(false);
            setPassword('');
            setConfirmPassword('');
          }
        } else if (result.error) {
          setLocalError(result.error);
        }
      } catch (err: any) {
        setLocalError(err?.message || 'An unexpected error occurred during sign up.');
      } finally {
        setIsLoading(false);
      }
    } else {
      setIsLoading(true);
      try {
        const result = await signInWithEmail(email.trim(), password);
        if (!result.success && result.error) {
          setLocalError(result.error);
        }
      } catch (err: any) {
        setLocalError(err?.message || 'An unexpected error occurred during sign in.');
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleFillDemo = (demoEmail: string) => {
    setIsSignUp(false);
    setEmail(demoEmail);
    setPassword('StockFlow2026!');
    setLocalError(null);
    setSuccessMessage(null);
  };

  const adminDemo = users.find((u) => u.role === 'ADMIN');
  const attendantDemo = users.find((u) => u.role === 'ATTENDANT');

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden selection:bg-emerald-500 selection:text-white">
      {/* Background radial accent glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-[400px] h-[400px] bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="flex items-center justify-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/20 border border-emerald-400/30">
            <Store className="w-6 h-6 text-white" />
          </div>
          <div>
            <span className="text-2xl font-black text-white tracking-tight">StockFlow</span>
            <span className="ml-2 text-xs px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-semibold uppercase tracking-wider">
              Terminal v2.1
            </span>
          </div>
        </div>

        <h2 className="text-center text-xl sm:text-2xl font-bold tracking-tight text-white">
          {isSignUp ? 'Create an account' : 'Sign in to your terminal'}
        </h2>
        <p className="mt-1 text-center text-xs text-slate-400">
          Multi-store POS, real-time inventory, and corporate sales engine
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10 px-4 sm:px-0">
        <div className="bg-slate-900/90 border border-slate-800 backdrop-blur-xl py-8 px-6 shadow-2xl rounded-2xl sm:px-10">
          {/* Supabase Status Pill */}
          <div className="mb-6 flex items-center justify-between p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 text-xs">
            <div className="flex items-center gap-2">
              <div className={`w-2.5 h-2.5 rounded-full ${isSupabaseActive ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              <span className="font-medium text-slate-300">
                {isSupabaseActive ? 'Supabase Auth & Database Connected' : 'Demo Local Mode Active'}
              </span>
            </div>
            <span className="text-[10px] text-slate-400 font-mono">PostgreSQL</span>
          </div>

          {(localError || authError) && (
            <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-3 animate-in fade-in duration-200">
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold text-rose-200">Authentication Alert</p>
                <p className="text-slate-300 leading-relaxed">{localError || authError}</p>
              </div>
            </div>
          )}

          {successMessage && (
            <div className="mb-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-start gap-3 animate-in fade-in duration-200">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold text-emerald-200">Success</p>
                <p className="text-slate-300 leading-relaxed">{successMessage}</p>
              </div>
            </div>
          )}

          <form className="space-y-5" onSubmit={handleSubmit}>
            {isSignUp && (
              <div className="animate-in slide-in-from-top-4 duration-300 fade-in">
                <label htmlFor="name" className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                  Full Name
                </label>
                <div className="relative rounded-xl shadow-xs">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <input
                    id="name"
                    name="name"
                    type="text"
                    required={isSignUp}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="John Doe"
                    className="block w-full pl-10 pr-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-hidden focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
                  />
                </div>
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                Staff Email Address
              </label>
              <div className="relative rounded-xl shadow-xs">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Mail className="h-4 w-4" />
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@stockflow.com or attendant@stockflow.com"
                  className="block w-full pl-10 pr-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-hidden focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                Password
              </label>
              <div className="relative rounded-xl shadow-xs">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete={isSignUp ? "new-password" : "current-password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="block w-full pl-10 pr-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-hidden focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
                />
              </div>
            </div>

            {isSignUp && (
              <div className="animate-in slide-in-from-top-4 duration-300 fade-in">
                <label htmlFor="confirmPassword" className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                  Confirm Password
                </label>
                <div className="relative rounded-xl shadow-xs">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                    <ShieldCheck className="h-4 w-4" />
                  </div>
                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    required={isSignUp}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="block w-full pl-10 pr-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-hidden focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
                  />
                </div>
              </div>
            )}

            <div>
              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-emerald-600/20 cursor-pointer"
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <span>{isSignUp ? 'Sign Up' : 'Sign In to Terminal'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
            
            <div className="text-center mt-4">
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setLocalError(null);
                  setSuccessMessage(null);
                }}
                className="text-sm text-emerald-400 hover:text-emerald-300 font-medium cursor-pointer"
              >
                {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
              </button>
            </div>
          </form>

          {/* Quick Demo Pre-fills for testing and verification */}
          <div className="mt-6 pt-6 border-t border-slate-800 space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-indigo-400" />
                Quick-Fill Demo Credentials
              </span>
              <span className="text-[10px] text-slate-400">1-Click Test</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {adminDemo && (
                <button
                  type="button"
                  onClick={() => handleFillDemo(adminDemo.email)}
                  className="text-left p-2.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-indigo-500/50 hover:bg-indigo-950/20 transition-all group"
                >
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-300 group-hover:text-indigo-200">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Super Admin</span>
                  </div>
                  <div className="text-[11px] text-slate-400 truncate mt-0.5">{adminDemo.email}</div>
                </button>
              )}

              {attendantDemo && (
                <button
                  type="button"
                  onClick={() => handleFillDemo(attendantDemo.email)}
                  className="text-left p-2.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-emerald-500/50 hover:bg-emerald-950/20 transition-all group"
                >
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-300 group-hover:text-emerald-200">
                    <Store className="w-3.5 h-3.5" />
                    <span>Attendant (Ikeja)</span>
                  </div>
                  <div className="text-[11px] text-slate-400 truncate mt-0.5">{attendantDemo.email}</div>
                </button>
              )}
            </div>

            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-slate-950 border border-slate-800/80 text-[11px] text-slate-400">
              <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <span>
                In Supabase, user profiles in <code className="text-emerald-300">public.profiles</code> determine role permissions and branch store isolation.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
