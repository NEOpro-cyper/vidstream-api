import { CheerioAPI, Element } from "cheerio";
import { MovieItem, TvSeriesItem } from "../types/common"; // Make sure your type definitions are imported

/**
 * Detects if an element is a TV Series or a Movie based on the HTML structure.
 * It checks for the text content of the ".fdi-type" span.
 */
export function extractDetect($: CheerioAPI, el: Element): MovieItem | TvSeriesItem {
    if ($(el).find(".fdi-type").text().trim() === "TV") {
        return extractTvSeries($, el);
    } else {
        return extractMovie($, el);
    }
}

/**
 * Extracts movie data from a ".flw-item" element.
 * Selectors are updated for the flixhq.to structure.
 */
export function extractMovie($: CheerioAPI, el: Element): MovieItem {
    const link = $(el).find("h3.film-name a").attr("href") || "";
    const id = link.split('-').pop() || "";

    return {
        id,
        title: $(el).find("h3.film-name a").attr("title") as string,
        poster: $(el).find("img.film-poster-img").attr("data-src") || $(el).find("img.film-poster-img").attr("src"),
        stats: {
            year: $(el).find(".fd-infor .fdi-item").first().text().trim(),
            duration: $(el).find(".fd-infor .fdi-duration").text().trim(),
            rating: "", // Rating is not available in the list view, so it is set to empty
        }
    };
}

/**
 * Extracts TV series data from a ".flw-item" element.
 * Selectors are updated for the flixhq.to structure.
 */
export function extractTvSeries($: CheerioAPI, el: Element): TvSeriesItem {
    const link = $(el).find("h3.film-name a").attr("href") || "";
    const id = link.split('-').pop() || "";

    return {
        id,
        title: $(el).find("h3.film-name a").attr("title") as string,
        poster: $(el).find("img.film-poster-img").attr("data-src") || $(el).find("img.film-poster-img").attr("src"),
        stats: {
            // Extracts season ("SS 2") and episodes ("EPS 8")
            seasons: $(el).find(".fd-infor > span:nth-child(1)").text().trim(),
            episodes: $(el).find(".fd-infor > span:nth-child(3)").text().trim(),
            rating: "", // Rating is not available in the list view, so it is set to empty
        }
    };
}
