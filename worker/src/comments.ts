export type CommentTargetType = 'photo' | 'collection';

export interface CommentRecord {
  id: string;
  visitorId: string;
  username: string;
  targetType: CommentTargetType;
  targetId: string;
  body: string;
  submissionKey: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  replyBody: string | null;
  replyUpdatedAt: string | null;
}

export function normalizeCommentBody(input: string): string {
  const body = input.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/g, '').trim();
  if (!body || [...body].length > 500) throw new Error('invalid_comment_body');
  return body;
}

export function publicComment(comment: CommentRecord, visitorId: string | null) {
  return {
    id: comment.id,
    targetType: comment.targetType,
    targetId: comment.targetId,
    username: comment.username,
    body: comment.body,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    mine: visitorId === comment.visitorId,
    reply: comment.replyBody ? { author: 'Julia Wang', body: comment.replyBody } : null,
  };
}
