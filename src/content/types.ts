export type PublicImage = {
  src: string;
  thumbnail: string;
  width: number;
  height: number;
};

export type PublicPhoto = {
  id: string;
  takenAt: string;
  description: string | null;
  device: string | null;
  image: PublicImage;
  collections: string[];
  tags: string[];
  featured: boolean;
};

export type PublicCollection = {
  id: string;
  title: string;
  description: string;
};

export type CollectionView = PublicCollection & {
  photos: PublicPhoto[];
};

