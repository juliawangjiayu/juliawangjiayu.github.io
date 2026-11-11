import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { MessageCircle, X } from 'lucide-react';
import { useVisitorIdentity } from './VisitorIdentityProvider.tsx';
import { browserCommentsClient, type CommentTargetType, type PublicComment } from '../lib/commentsApi.ts';

type Loaded = { key: string; comments: PublicComment[]; hasMore: boolean; loading: boolean };

export function CommentsPanel({ photoId, collectionId, onClose }: { photoId: string; collectionId: string; onClose: () => void }) {
  const client = useMemo(browserCommentsClient, []);
  const { visitor, status, runAuthenticated } = useVisitorIdentity();
  const [targetType, setTargetType] = useState<CommentTargetType>('photo');
  const targetId = targetType === 'photo' ? photoId : collectionId;
  const targetKey = `${targetType}:${targetId}`;
  const activeKey = useRef(targetKey);
  activeKey.current = targetKey;
  const [loaded, setLoaded] = useState<Loaded>({ key: '', comments: [], hasMore: false, loading: true });
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submissionKey = useRef<string | null>(null);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => { panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, []);

  useEffect(() => {
    let active = true;
    setError('');
    setDraft('');
    setEditingId(null);
    setDeletingId(null);
    submissionKey.current = null;
    setLoaded({ key: targetKey, comments: [], hasMore: false, loading: true });
    void client.list(targetType, targetId).then((page) => {
      if (active) setLoaded({ key: targetKey, ...page, loading: false });
    }).catch((caught) => {
      if (active) { setLoaded({ key: targetKey, comments: [], hasMore: false, loading: false }); setError(caught instanceof Error ? caught.message : 'Messages could not be loaded.'); }
    });
    return () => { active = false; };
  }, [client, targetKey, targetType, targetId]);

  const visible = loaded.key === targetKey ? loaded : { key: targetKey, comments: [], hasMore: false, loading: true };
  const refresh = async () => {
    const page = await client.list(targetType, targetId);
    if (activeKey.current === targetKey) setLoaded({ key: targetKey, ...page, loading: false });
  };
  const loadMore = async () => {
    if (busy || !visible.hasMore) return;
    setBusy(true);
    setError('');
    try {
      const page = await client.list(targetType, targetId, visible.comments.length);
      if (activeKey.current === targetKey) setLoaded({ key: targetKey, comments: [...visible.comments, ...page.comments], hasMore: page.hasMore, loading: false });
    } catch (caught) { if (activeKey.current === targetKey) setError(caught instanceof Error ? caught.message : 'More messages could not be loaded.'); }
    finally { setBusy(false); }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !draft.trim()) return;
    const text = draft;
    const key = submissionKey.current ?? crypto.randomUUID();
    submissionKey.current = key;
    setBusy(true);
    setError('');
    await runAuthenticated('leave a message', async () => {
      if (activeKey.current !== targetKey) { setBusy(false); return; }
      try {
        await client.create(targetType, targetId, text, key);
        submissionKey.current = null;
        setDraft('');
        await refresh();
      } catch (caught) { setError(caught instanceof Error ? caught.message : 'Your message could not be sent.'); }
      finally { setBusy(false); }
    });
    if (!visitor) setBusy(false);
  };
  const saveEdit = async () => {
    if (!editingId || busy) return;
    setBusy(true); setError('');
    try { await client.update(editingId, editText); setEditingId(null); await refresh(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Your change could not be saved.'); }
    finally { setBusy(false); }
  };
  const remove = async (id: string) => {
    if (busy) return;
    setBusy(true); setError('');
    try { await client.remove(id); setDeletingId(null); await refresh(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Your message could not be removed.'); }
    finally { setBusy(false); }
  };

  return (
    <section className="comments-panel" ref={panelRef} aria-label="Messages">
      <header className="comments-panel__header">
        <div><span className="comments-panel__eyebrow"><MessageCircle size={16} aria-hidden="true" /> A place to leave a thought</span><h2>Messages</h2></div>
        <button className="comments-panel__close" type="button" onClick={onClose} aria-label="Close messages"><X size={20} aria-hidden="true" /></button>
      </header>
      <div className="comments-panel__tabs" role="tablist" aria-label="Message target">
        <button type="button" role="tab" aria-selected={targetType === 'photo'} className={targetType === 'photo' ? 'is-active' : ''} onClick={() => setTargetType('photo')}>This photo</button>
        <button type="button" role="tab" aria-selected={targetType === 'collection'} className={targetType === 'collection' ? 'is-active' : ''} onClick={() => setTargetType('collection')}>Collection</button>
      </div>
      <p className="comments-panel__scope">{targetType === 'photo' ? 'Thoughts about this photograph.' : 'Thoughts about the whole Collection.'}</p>
      <form className="comments-panel__form" onSubmit={(event) => void submit(event)}>
        <label htmlFor="comment-draft">Leave a message</label>
        <textarea id="comment-draft" value={draft} onChange={(event) => { setDraft(event.target.value); submissionKey.current = null; }} maxLength={1000} rows={3} placeholder="What did this make you think of?" />
        <div className="comments-panel__form-footer"><span>{[...draft].length}/500 · Up to 3 messages per minute</span><button disabled={busy || status === 'loading' || !draft.trim() || [...draft].length > 500} type="submit">{visitor ? 'Post message' : 'Sign in & post'}</button></div>
      </form>
      {error && <p className="comments-panel__error" role="alert">{error} <button type="button" onClick={() => void refresh().then(() => setError('')).catch((caught) => setError(caught instanceof Error ? caught.message : 'Please try again.'))}>Refresh</button></p>}
      <div className="comments-panel__list" aria-live="polite">
        {visible.loading ? <p className="comments-panel__empty">Loading messages…</p> : visible.comments.length === 0 ? <p className="comments-panel__empty">No messages yet. You could leave the first one.</p> : visible.comments.map((comment) => (
          <article className="comment-entry" key={comment.id}>
            <header><strong>{comment.username}</strong><time dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</time></header>
            {editingId === comment.id ? <div className="comment-entry__edit"><textarea aria-label="Edit your message" value={editText} maxLength={1000} rows={3} onChange={(event) => setEditText(event.target.value)} />{comment.reply && <small>Editing removes Julia's reply from this message.</small>}<div><button type="button" onClick={() => void saveEdit()} disabled={busy || !editText.trim() || [...editText].length > 500}>Save</button><button type="button" onClick={() => setEditingId(null)}>Cancel</button></div></div> : <p>{comment.body}</p>}
            {comment.reply && <div className="comment-entry__reply"><strong>{comment.reply.author}</strong><p>{comment.reply.body}</p></div>}
            {comment.mine && editingId !== comment.id && <div className="comment-entry__actions">{deletingId === comment.id ? <><span>Remove this message?</span><button type="button" onClick={() => void remove(comment.id)} disabled={busy}>Remove</button><button type="button" onClick={() => setDeletingId(null)}>Cancel</button></> : <><button type="button" onClick={() => { setEditingId(comment.id); setEditText(comment.body); }}>Edit</button><button type="button" onClick={() => setDeletingId(comment.id)}>Delete</button></>}</div>}
          </article>
        ))}
      </div>
      {visible.hasMore && <button className="comments-panel__more" type="button" disabled={busy} onClick={() => void loadMore()}>Load more messages</button>}
    </section>
  );
}
