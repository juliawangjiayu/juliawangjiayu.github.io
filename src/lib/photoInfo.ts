import type { PublicPhoto } from '../content/types.ts';

export type PhotoInfoRow = {
  label: 'Captured' | 'Device' | 'Tags' | 'Description';
  value: string;
};

const monthNames = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatCaptureDate(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
  if (!match) return value;
  const month = monthNames[Number(match[2]) - 1];
  if (!month) return value;
  return match[3]
    ? `${month} ${Number(match[3])}, ${match[1]}`
    : `${month} ${match[1]}`;
}

export function photoInfoRows(photo: PublicPhoto): PhotoInfoRow[] {
  const rows: PhotoInfoRow[] = [];
  if (photo.takenAt) rows.push({ label: 'Captured', value: formatCaptureDate(photo.takenAt) });
  if (photo.device?.trim()) rows.push({ label: 'Device', value: photo.device.trim() });
  if (photo.tags.length > 0) rows.push({ label: 'Tags', value: photo.tags.join(' · ') });
  if (photo.description?.trim()) rows.push({ label: 'Description', value: photo.description.trim() });
  return rows;
}

