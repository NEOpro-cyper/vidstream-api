export interface MovieItem {
    id: string;
    title: string;
    poster: string;
    tmdbId?: number; // Added TMDB ID
    stats: MovieItemStats;
}

interface MovieItemStats {
    year: string;
    duration: string;
    rating: string;
}

export interface TvSeriesItem {
    id: string;
    title: string;
    poster: string;
    tmdbId?: number; // Added TMDB ID
    stats: TvSeriesItemStats;
}

interface TvSeriesItemStats {
    seasons: string;
    episodes: string; // Fixed: This was missing in your original code
    rating: string;
}
