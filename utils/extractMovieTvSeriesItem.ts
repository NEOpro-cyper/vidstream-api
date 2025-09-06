import { CheerioAPI, Element } from "cheerio";
import { MovieItem, TvSeriesItem } from "../types/common";
import { TMDBService } from './tmdb';

const tmdbService = TMDBService.getInstance();

/**
 * Detects if an element is a TV Series or a Movie based on the HTML structure.
 * It checks for the text content of the ".fdi-type" span.
 */
export async function extractDetect($: CheerioAPI, el: Element): Promise<MovieItem | TvSeriesItem> {
    if ($(el).find(".fdi-type").text().trim() === "TV") {
        return await extractTvSeries($, el);
    } else {
        return await extractMovie($, el);
    }
}

/**
 * Extracts movie data from a ".flw-item" element with TMDB ID.
 * Selectors are updated for the flixhq.to structure.
 */
export async function extractMovie($: CheerioAPI, el: Element): Promise<MovieItem> {
    const link = $(el).find("h3.film-name a").attr("href") || "";
    const id = link.split('-').pop() || "";
    const title = $(el).find("h3.film-name a").attr("title") as string;
    const year = $(el).find(".fd-infor .fdi-item").first().text().trim();
    
    // Get TMDB ID
    let tmdbId: number | undefined;
    try {
        tmdbId = await tmdbService.searchMovie(title, year) || undefined;
    } catch (error) {
        console.error('Failed to get TMDB ID for movie:', title, error);
        tmdbId = undefined;
    }

    return {
        id,
        title,
        poster: $(el).find("img.film-poster-img").attr("data-src") || $(el).find("img.film-poster-img").attr("src"),
        tmdbId,
        stats: {
            year,
            duration: $(el).find(".fd-infor .fdi-duration").text().trim(),
            rating: "", // Rating is not available in the list view, so it is set to empty
        }
    };
}

/**
 * Extracts TV series data from a ".flw-item" element with TMDB ID.
 * Selectors are updated for the flixhq.to structure.
 */
export async function extractTvSeries($: CheerioAPI, el: Element): Promise<TvSeriesItem> {
    const link = $(el).find("h3.film-name a").attr("href") || "";
    const id = link.split('-').pop() || "";
    const title = $(el).find("h3.film-name a").attr("title") as string;
    
    // Try to extract year from various places
    const yearText = $(el).find(".fd-infor .fdi-item").first().text().trim();
    const yearMatch = yearText.match(/\b(19|20)\d{2}\b/);
    const year = yearMatch ? yearMatch[0] : undefined;
    
    // Get TMDB ID
    let tmdbId: number | undefined;
    try {
        tmdbId = await tmdbService.searchTVSeries(title, year) || undefined;
    } catch (error) {
        console.error('Failed to get TMDB ID for TV series:', title, error);
        tmdbId = undefined;
    }

    return {
        id,
        title,
        poster: $(el).find("img.film-poster-img").attr("data-src") || $(el).find("img.film-poster-img").attr("src"),
        tmdbId,
        stats: {
            // Extracts season ("SS 2") and episodes ("EPS 8")
            seasons: $(el).find(".fd-infor > span:nth-child(1)").text().trim(),
            episodes: $(el).find(".fd-infor > span:nth-child(3)").text().trim(),
            rating: "", // Rating is not available in the list view, so it is set to empty
        }
    };
}
