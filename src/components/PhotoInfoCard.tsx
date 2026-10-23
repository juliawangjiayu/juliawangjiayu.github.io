import { X } from 'lucide-react';
import type { PublicPhoto } from '../content/types.ts';
import { photoInfoRows } from '../lib/photoInfo.ts';

type PhotoInfoCardProps = {
  photo: PublicPhoto;
  onClose: () => void;
};

export function PhotoInfoCard({ photo, onClose }: PhotoInfoCardProps) {
  const rows = photoInfoRows(photo);

  return (
    <aside className="photo-info-card" aria-label="Photo information">
      <div className="photo-info-card__header">
        <span>Photo information</span>
        <button type="button" onClick={onClose} aria-label="Close photo information">
          <X size={20} strokeWidth={1.6} />
        </button>
      </div>
      <dl>
        {rows.map((row) => (
          <div className="photo-info-card__row" key={row.label}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}

