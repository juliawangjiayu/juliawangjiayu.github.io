import type { ChallengeSummary } from './gameApi.ts';
import { wrapReviewText } from './reviewCard.ts';

export type InvitationCardData = {
  url: string;
  score: number;
  totalRounds: 4 | 5;
};

export function buildInvitationCardData(challenge: ChallengeSummary, origin: string): InvitationCardData {
  if (!challenge.id.trim() || ![4, 5].includes(challenge.totalRounds)) {
    throw new Error('A completed challenge is required for the invitation.');
  }
  return {
    url: new URL(`/guess-where/challenge/${encodeURIComponent(challenge.id)}`, origin).toString(),
    score: challenge.score,
    totalRounds: challenge.totalRounds,
  };
}

export async function renderInvitationCard(data: InvitationCardData): Promise<Blob> {
  const { toCanvas } = await import('qrcode');
  const qr = document.createElement('canvas');
  await toCanvas(qr, data.url, {
    width: 408,
    margin: 2,
    color: { dark: '#342b3d', light: '#fffafc' },
    errorCorrectionLevel: 'M',
  });

  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  const measureContext = canvas.getContext('2d');
  if (!measureContext) throw new Error('The invitation image could not be created.');
  measureContext.font = '25px Arial, sans-serif';
  const urlLines = wrapReviewText(data.url, 920, (value) => measureContext.measureText(value).width);
  canvas.height = 1040 + Math.max(0, urlLines.length - 1) * 35;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('The invitation image could not be created.');

  context.fillStyle = '#f2edf4';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#755f85';
  context.font = '26px Georgia, serif';
  context.fillText('Julia Wang · Guess Where', 80, 102);
  context.font = '34px Georgia, serif';
  context.fillText('✦', 930, 111);
  context.fillText('✧', 972, 163);

  context.fillStyle = '#352d3e';
  context.font = '66px Georgia, serif';
  context.fillText(`${data.totalRounds === 5 ? 'Five' : 'Four'} places, one journey.`, 80, 212);
  context.font = '27px Arial, sans-serif';
  context.fillText(`Play the same ${data.totalRounds} photographs and see where they take you.`, 82, 264);

  context.fillStyle = '#fffafc';
  context.fillRect(80, 316, 920, 541);
  context.fillStyle = '#756684';
  context.font = 'bold 22px Arial, sans-serif';
  context.fillText('A LITTLE CHALLENGE FOR YOU', 113, 365);
  context.fillStyle = '#352d3e';
  context.font = '39px Georgia, serif';
  context.fillText(`${data.score.toLocaleString()} / ${(data.totalRounds * 5000).toLocaleString()} points to beat`, 113, 417);
  context.drawImage(qr, 336, 440, 408, 408);

  context.fillStyle = '#756684';
  context.font = 'bold 20px Arial, sans-serif';
  context.fillText('SCAN OR OPEN THE LINK', 82, 906);
  context.fillStyle = '#352d3e';
  context.font = '25px Arial, sans-serif';
  urlLines.forEach((line, index) => context.fillText(line.trim(), 82, 947 + index * 35));
  context.fillStyle = '#756684';
  context.font = '20px Arial, sans-serif';
  context.fillText('The answers stay hidden until each round is played.', 82, canvas.height - 49);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('The invitation image could not be saved.')), 'image/png');
  });
}

export async function downloadInvitationCard(data: InvitationCardData): Promise<void> {
  const blob = await renderInvitationCard(data);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `julia-wang-guess-where-invitation-${data.score}.png`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
