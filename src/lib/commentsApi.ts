import { browserIdentityClient, type createIdentityClient } from './identityApi.ts';

export type CommentTargetType = 'photo' | 'collection';
export type PublicComment = {
  id: string;
  targetType: CommentTargetType;
  targetId: string;
  username: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  mine: boolean;
  reply: { author: 'Julia Wang'; body: string } | null;
};
export type CommentPage = { comments: PublicComment[]; hasMore: boolean };

type IdentityRequest = Pick<ReturnType<typeof createIdentityClient>, 'request'>;

export function createCommentsClient(identity: IdentityRequest) {
  return {
    list(targetType: CommentTargetType, targetId: string, offset = 0): Promise<CommentPage> {
      const query = new URLSearchParams({ targetType, targetId, offset: String(offset) });
      return identity.request<CommentPage>(`/api/comments?${query}`);
    },
    create(targetType: CommentTargetType, targetId: string, body: string, key: string): Promise<{ comment: PublicComment }> {
      return identity.request('/api/comments', {
        method: 'POST', headers: { 'idempotency-key': key }, body: JSON.stringify({ targetType, targetId, body }),
      });
    },
    update(id: string, body: string): Promise<{ comment: PublicComment }> {
      return identity.request(`/api/comments/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ body }) });
    },
    remove(id: string): Promise<void> {
      return identity.request(`/api/comments/${encodeURIComponent(id)}`, { method: 'DELETE' });
    },
  };
}

export function browserCommentsClient() { return createCommentsClient(browserIdentityClient()); }
