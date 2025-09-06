export interface TMDBSearchResult {
  id: number;
  title?: string; // for movies
  name?: string; // for TV series
  release_date?: string; // for movies
  first_air_date?: string; // for TV series
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  media_type?: 'movie' | 'tv';
}

export interface TMDBResponse {
  page: number;
  results: TMDBSearchResult[];
  total_results: number;
  total_pages: number;
}
