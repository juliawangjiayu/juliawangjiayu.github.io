import type { RoundReview } from './roundReview.ts';

type ReviewCardRow = Pick<RoundReview, 'round' | 'photoUrl' | 'guessLabel' | 'guessPosition' | 'answerLabel' | 'score'>;

export type ReviewCardData = {
  totalScore: number;
  totalRounds: 4 | 5;
  rows: ReviewCardRow[];
};

export function buildReviewCardData(reviews: RoundReview[], totalScore: number, totalRounds: 4 | 5 = 5): ReviewCardData {
  if (reviews.length !== totalRounds || reviews.some((review, index) => review.round !== index + 1)) {
    throw new Error(`Finish all ${totalRounds === 5 ? 'five' : 'four'} rounds before saving the review.`);
  }
  if (reviews.some((review) => review.locationPending)) {
    throw new Error('Wait for the nearby place lookup before saving the review.');
  }
  return {
    totalScore,
    totalRounds,
    rows: reviews.map(({ round, photoUrl, guessLabel, guessPosition, answerLabel, score }) => ({
      round, photoUrl, guessLabel, guessPosition, answerLabel, score,
    })),
  };
}

function loadPhoto(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

function drawPhoto(context: CanvasRenderingContext2D, image: HTMLImageElement | null, x: number, y: number) {
  const width = 210;
  const height = 146;
  context.fillStyle = '#ded6e4';
  context.fillRect(x, y, width, height);
  if (!image) return;
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const renderedWidth = image.naturalWidth * scale;
  const renderedHeight = image.naturalHeight * scale;
  context.drawImage(image, x + (width - renderedWidth) / 2, y + (height - renderedHeight) / 2, renderedWidth, renderedHeight);
}

export function wrapReviewText(text: string, maxWidth: number, measure: (value: string) => number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const character of Array.from(text)) {
    if (measure(line + character) > maxWidth && line) {
      const space = line.lastIndexOf(' ');
      if (space > 0) {
        lines.push(line.slice(0, space + 1));
        line = line.slice(space + 1) + character;
      } else {
        lines.push(line);
        line = character;
      }
    } else {
      line += character;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawLines(context: CanvasRenderingContext2D, lines: string[], x: number, y: number) {
  lines.forEach((line, index) => context.fillText(line.trim(), x, y + index * 30));
}

export async function renderReviewCard(data: ReviewCardData): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  let context = canvas.getContext('2d');
  if (!context) throw new Error('The review image could not be created.');

  context.font = '26px Arial, sans-serif';
  const measureContext = context;
  const layouts = data.rows.map((row) => {
    const measure = (value: string) => measureContext.measureText(value).width;
    const guessLines = wrapReviewText(row.guessLabel, 540, measure);
    const answerLines = wrapReviewText(row.answerLabel, 540, measure);
    const guessPositionY = 108 + (guessLines.length - 1) * 30 + 32;
    const answerLabelY = guessPositionY + 44;
    const answerTextY = answerLabelY + 31;
    const height = Math.max(222, answerTextY + (answerLines.length - 1) * 30 + 32);
    return { guessLines, answerLines, guessPositionY, answerLabelY, answerTextY, height };
  });
  canvas.height = 310 + layouts.reduce((total, layout) => total + layout.height, 0) + (layouts.length - 1) * 14 + 98;
  context = canvas.getContext('2d');
  if (!context) throw new Error('The review image could not be created.');

  context.fillStyle = '#f2edf4';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#3b3045';
  context.font = '26px Georgia, serif';
  context.fillText('Julia Wang · Guess Where', 76, 92);
  context.font = '72px Georgia, serif';
  context.fillText(`${data.totalRounds === 5 ? 'Five' : 'Four'} places, one journey.`, 76, 188);
  context.font = '28px Arial, sans-serif';
  context.fillText(`My ${data.totalRounds}-round review`, 80, 244);
  context.textAlign = 'right';
  context.font = '56px Georgia, serif';
  context.fillText(`${data.totalScore.toLocaleString()} / ${(data.totalRounds * 5000).toLocaleString()}`, 1120, 250);
  context.textAlign = 'left';

  const photos = await Promise.all(data.rows.map((row) => loadPhoto(row.photoUrl)));
  let top = 310;
  data.rows.forEach((row, index) => {
    const layout = layouts[index];
    context.fillStyle = '#fffafc';
    context.fillRect(64, top, 1072, layout.height);
    drawPhoto(context, photos[index] ?? null, 82, top + 30);
    context.fillStyle = '#755f85';
    context.font = 'bold 21px Arial, sans-serif';
    context.fillText(`ROUND ${String(row.round).padStart(2, '0')}`, 326, top + 38);
    context.fillStyle = '#55495e';
    context.font = '19px Arial, sans-serif';
    context.fillText('YOUR ANSWER', 326, top + 78);
    context.fillText('CORRECT ANSWER', 326, top + layout.answerLabelY);
    context.fillStyle = '#30283a';
    context.font = '26px Arial, sans-serif';
    drawLines(context, layout.guessLines, 326, top + 108);
    context.fillStyle = '#655477';
    context.font = '19px Arial, sans-serif';
    context.fillText(row.guessPosition, 326, top + layout.guessPositionY);
    context.fillStyle = '#30283a';
    context.font = '26px Arial, sans-serif';
    drawLines(context, layout.answerLines, 326, top + layout.answerTextY);
    context.textAlign = 'right';
    context.font = '43px Georgia, serif';
    context.fillText(`+${row.score.toLocaleString()}`, 1100, top + 114);
    context.font = '18px Arial, sans-serif';
    context.fillText('PTS', 1096, top + 144);
    context.textAlign = 'left';
    top += layout.height + 14;
  });

  context.fillStyle = '#655477';
  context.font = '22px Arial, sans-serif';
  context.fillText('Contains answers · share after friends play', 76, canvas.height - 47);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('The review image could not be saved.')), 'image/png');
  });
}

export async function downloadReviewCard(data: ReviewCardData): Promise<void> {
  const blob = await renderReviewCard(data);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `julia-wang-guess-where-review-${data.totalScore}.png`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
