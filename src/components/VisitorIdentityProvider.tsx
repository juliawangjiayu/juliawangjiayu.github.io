import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { IdentityActionCoordinator } from '../lib/identityAction.ts';
import { browserIdentityClient, type PublicVisitor } from '../lib/identityApi.ts';
import { IdentityDialog } from './IdentityDialog.tsx';

type VisitorIdentityContext = {
  visitor: PublicVisitor | null;
  status: 'loading' | 'anonymous' | 'authenticated';
  runAuthenticated: (reason: string, action: () => Promise<void>) => Promise<void>;
  signOut: () => Promise<void>;
};

const IdentityContext = createContext<VisitorIdentityContext | null>(null);

export function useVisitorIdentity(): VisitorIdentityContext {
  const value = useContext(IdentityContext);
  if (!value) throw new Error('VisitorIdentityProvider is missing.');
  return value;
}

export function VisitorIdentityProvider({ children }: { children: ReactNode }) {
  const client = useMemo(browserIdentityClient, []);
  const coordinator = useRef(new IdentityActionCoordinator());
  const [visitor, setVisitor] = useState<PublicVisitor | null>(null);
  const [status, setStatus] = useState<VisitorIdentityContext['status']>('loading');
  const [reason, setReason] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [signOutError, setSignOutError] = useState('');

  useEffect(() => {
    let active = true;
    if (!client.token()) {
      setStatus('anonymous');
      return;
    }
    void client.me().then((resolved) => {
      if (active) { setVisitor(resolved); setStatus('authenticated'); }
    }).catch(() => {
      if (active) setStatus('anonymous');
    });
    return () => { active = false; };
  }, [client]);

  const runAuthenticated = async (actionReason: string, action: () => Promise<void>) => {
    setError('');
    await coordinator.current.run(Boolean(visitor && client.token()), actionReason, action);
    setReason(coordinator.current.reason);
  };

  const cancel = () => {
    coordinator.current.cancel();
    setReason(null);
    setError('');
  };

  const signIn = async (username: string, email: string) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const resolved = await client.signIn(username, email);
      setVisitor(resolved);
      setStatus('authenticated');
      await coordinator.current.resume();
      setReason(coordinator.current.reason);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Sign-in could not be completed.');
      if (!client.token()) { setVisitor(null); setStatus('anonymous'); }
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    setSignOutError('');
    try {
      await client.signOut();
      setVisitor(null);
      setStatus('anonymous');
      cancel();
    } catch {
      if (!client.token()) {
        setVisitor(null);
        setStatus('anonymous');
      } else {
        setSignOutError('Sign-out could not reach the server. Your session is still active. Please retry.');
      }
    }
  };

  return (
    <IdentityContext.Provider value={{ visitor, status, runAuthenticated, signOut }}>
      {children}
      <IdentityDialog busy={busy} error={error} onCancel={cancel} onSubmit={signIn} reason={reason} />
      {signOutError && <div className="identity-signout-error" role="alert">{signOutError} <button onClick={() => void signOut()} type="button">Retry sign-out</button></div>}
    </IdentityContext.Provider>
  );
}
