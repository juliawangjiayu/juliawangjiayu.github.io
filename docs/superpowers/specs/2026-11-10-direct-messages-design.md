# Direct visitor messages — revised design

This replaces only the message and moderation decisions in the 2026-10-28 visitor-identity/comments design. The existing visitor identity, Collections album, Guess Where, and share-card decisions remain in force.

Visitors may read messages anonymously and sign in with the existing username/email flow when they submit. Each message belongs either to one public photograph or to its Collection. The photo viewer offers a message control near its tools; opening messages shows two tabs, `This photo` and `Collection`, below the photograph without shrinking it. On mobile the panel is one column.

New messages appear publicly as soon as the Worker accepts them. There is no pending state, approval queue, or Photo Booth moderation workflow. The Worker enforces at most **three new messages per visitor in any rolling 60 seconds**, across all photos and Collections. The limit includes messages later deleted. A fourth submission returns HTTP 429 with a clear retry message. Retries with the same idempotency key return the original message and do not count as another submission.

A visitor may edit or delete only their own messages. Edits remain public and clear any existing Julia reply so that the reply cannot appear under a changed message. Deleted messages disappear from public lists. Bodies are trimmed plain text, 1–500 Unicode code points after control-character normalization; URLs remain inert text. Do not render HTML or Markdown.

Julia may remove any message and write, edit, or remove one reply signed `Julia Wang`. These are administrator actions through the existing Worker admin authentication; Photo Booth may offer a simple Messages workspace for these actions, but no review status or approval controls. D1 is the source of truth; Photo Booth must not copy message bodies to its SQLite database or expose admin credentials in its browser bundle.

The public API returns only a message ID, username, body, timestamp, ownership flag for the requesting visitor, and optional Julia reply. It never returns email, email verifier, session token, IP, administrator credential, or private Guess Where answer data. Targets use the stable IDs already present in the static photo catalog. Public lists are paginated newest first.
