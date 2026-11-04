import { useEffect, useRef, useState, type FormEvent } from 'react';

type IdentityDialogProps = {
  reason: string | null;
  busy: boolean;
  error: string;
  onCancel: () => void;
  onSubmit: (username: string, email: string) => Promise<void>;
};

export function IdentityDialog({ reason, busy, error, onCancel, onSubmit }: IdentityDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (reason) {
      previousFocus.current = document.activeElement as HTMLElement | null;
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
      previousFocus.current?.focus();
    }
  }, [reason]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await onSubmit(username.trim(), email);
    } finally {
      setEmail('');
    }
  };

  return (
    <dialog
      aria-labelledby="visitor-identity-title"
      className="identity-dialog"
      onCancel={(event) => { event.preventDefault(); if (!busy) onCancel(); }}
      ref={dialogRef}
    >
      <form onSubmit={(event) => void submit(event)}>
        <p className="page-kicker">A name for your journey</p>
        <h2 id="visitor-identity-title">Sign in to {reason ?? 'continue'}</h2>
        <p>Choose a unique public username. Your email is used only to return under the same name and is never shown publicly.</p>
        <p className="identity-dialog__notice">This is a lightweight identity without email verification. Anyone who knows your username and email could use it; please do not use this for private information.</p>
        <label>Username
          <input autoComplete="nickname" maxLength={100} onChange={(event) => setUsername(event.target.value)} required value={username} />
        </label>
        <label>Email
          <input autoComplete="email" maxLength={254} onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
        </label>
        {error && <p className="guess-error" role="alert">{error}</p>}
        <div className="identity-dialog__actions">
          <button disabled={busy} onClick={onCancel} type="button">Cancel</button>
          <button disabled={busy} type="submit">{busy ? 'Signing in…' : 'Continue'}</button>
        </div>
      </form>
    </dialog>
  );
}
