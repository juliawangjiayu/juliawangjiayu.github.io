export type PathNode = {
  x: number;
  y: number;
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

