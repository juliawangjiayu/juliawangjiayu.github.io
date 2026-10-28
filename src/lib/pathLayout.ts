export type PathNode = {
  x: number;
  y: number;
};

type FinalCollectionCard = {
  width: number;
  height: number;
  hasDescription: boolean;
};

const xPattern = [24, 68, 39, 76, 31, 64, 22, 72];

export function buildPathLayout(count: number): PathNode[] {
  return Array.from({ length: Math.max(0, count) }, (_, index) => ({
    x: xPattern[index % xPattern.length],
    y: 210 + index * 470,
  }));
}

export function buildPathData(nodes: readonly PathNode[]): string {
  if (nodes.length === 0) return '';
  const segments = [`M ${nodes[0].x} ${nodes[0].y}`];

  for (let index = 1; index < nodes.length; index += 1) {
    const previous = nodes[index - 1];
    const current = nodes[index];
    const middleY = (previous.y + current.y) / 2;
    segments.push(`C ${previous.x} ${middleY}, ${current.x} ${middleY}, ${current.x} ${current.y}`);
  }

  return segments.join(' ');
}

export function calculateCollectionPathHeight(
  nodes: readonly PathNode[],
  finalCard?: FinalCollectionCard,
): number {
  const finalNode = nodes.at(-1);
  if (!finalNode) return 0;
  if (!finalCard || finalCard.width <= 0 || finalCard.height <= 0) return finalNode.y + 430;

  const isPortrait = finalCard.height > finalCard.width;
  const coverWidth = isPortrait ? 300 : 410;
  const coverHeight = coverWidth * finalCard.height / finalCard.width;
  const pointAndGap = 36;
  const titleAndSpacing = 52;
  const descriptionSpace = finalCard.hasDescription ? 58 : 0;
  const bottomGutter = 70;
  const requiredTail = pointAndGap + coverHeight + titleAndSpacing + descriptionSpace + bottomGutter;

  return Math.ceil(finalNode.y + Math.max(430, requiredTail));
}

