import { MovieItem, TvSeriesItem } from "../common";

export interface MovieDetailsResponse {
    title: string;
    description: string;
    type: string;
    poster: string; // Add this line
    episodeId?: string;
    stats: {name: string, value: string | string[]}[];
    related: (MovieItem | TvSeriesItem)[];    
}
