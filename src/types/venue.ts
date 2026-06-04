// Venue type definition - shared across components
export interface Venue {
  id: string;
  name: string;
  lat: number;
  lng: number;
  activity: number;
  category: string;
  neighborhood: string;
  imageUrl?: string;
  address?: string;
  googleRating?: number | null;
  googleTotalRatings?: number;
  googleReviews?: Array<{
    author: string;
    rating: number;
    text: string;
    time: string | null;
  }>;
  isOpen?: boolean | null;
  openingHours?: string[];
  phone?: string;
  website?: string;
}
