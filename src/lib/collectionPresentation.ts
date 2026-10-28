export function collectionDescription(value: string): string | null {
  const description = value.trim();
  return description || null;
}

export function collectionNodeId(collectionId: string): string {
  return `collection-${collectionId}`;
}

export function collectionNodeHref(collectionId: string): string {
  return `#${encodeURIComponent(collectionNodeId(collectionId))}`;
}
