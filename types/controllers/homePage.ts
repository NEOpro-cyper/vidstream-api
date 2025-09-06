import { MovieItem, TvSeriesItem } from "../common";

export interface HomePageResponse {
    spotlight: SpotlightItem[];
    trending: {
        movies: MovieItem[];
        tvSeries: TvSeriesItem[];
    };
    latestMovies: MovieItem[];
    latestTvSeries: TvSeriesItem[];
    comingSoon: (MovieItem | TvSeriesItem)[]; // Updated to support both types
}

export interface SpotlightItem {
    id: string;
    title: string;
    banner: string;
    poster?: string; // Made optional
    description: string; // Added missing description field
    rating?: string;
    year?: string; // Made optional since it might not always be available
}
