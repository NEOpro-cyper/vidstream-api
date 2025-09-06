import { HomePageResponse, SpotlightItem } from "../types/controllers/homePage";
import { MovieItem, TvSeriesItem } from "../types/common";
import { Request, Response } from "express";
import { SRC_HOME_URL, USER_AGENT_HEADER, ACCEPT_ENCODING_HEADER, ACCEPT_HEADER } from "../config/axois";
import axios from "axios";
import { load, CheerioAPI } from "cheerio";
import { extractMovie, extractTvSeries, extractDetect } from "../utils/extractMovieTvSeriesItem";

// GET /home
export default async function (req: Request, res: Response) {
    try {
        const response: HomePageResponse = {
            spotlight: [],
            trending: {
                movies: [],
                tvSeries: [],
            },
            latestMovies: [],
            latestTvSeries: [],
            comingSoon: [],
        };

        const mainPage = await axios.get(SRC_HOME_URL as string, {
            headers: {
                "User-Agent": USER_AGENT_HEADER,
                "Accept-Encoding": ACCEPT_ENCODING_HEADER,
                Accept: ACCEPT_HEADER,
            },
        });

        const $: CheerioAPI = load(mainPage.data);

        // --- Corrected Spotlight Scraping ---
        $("#slider .swiper-wrapper .swiper-slide:not(.swiper-slide-duplicate)").each((_, el) => {
            const slideLink = $(el).find("a.slide-link");
            const href = slideLink.attr("href") || "";
            const id = href.split('-').pop() || "";
            
            const bannerStyle = $(el).attr("style") || "";
            const bannerMatch = bannerStyle.match(/url\(['"]?(.*?)['"]?\)/);
            const banner = bannerMatch ? bannerMatch[1] : "";
            
            response.spotlight.push({
                id,
                title: $(el).find("h3.film-title a").text().trim(),
                description: $(el).find("p.sc-desc").text().trim(),
                banner,
                rating: $(el).find(".scd-item:contains('IMDB') strong").text().trim(),
            } as SpotlightItem);
        });

        // --- Corrected Section Scraping (Trending, Latest, etc.) with TMDB Integration ---
        const sections = $("section.block_area_home");
        
        for (let i = 0; i < sections.length; i++) {
            const section = sections.eq(i);
            const sectionTitle = section.find("h2.cat-heading").text().trim();
            
            if (sectionTitle === "Trending") {
                // Scrape Trending Movies with TMDB IDs
                const movieElements = section.find("#trending-movies .flw-item").toArray();
                for (const el of movieElements) {
                    const movieItem = await extractMovie($, el);
                    response.trending.movies.push(movieItem);
                }
                
                // Scrape Trending TV Shows with TMDB IDs
                const tvElements = section.find("#trending-tv .flw-item").toArray();
                for (const el of tvElements) {
                    const tvItem = await extractTvSeries($, el);
                    response.trending.tvSeries.push(tvItem);
                }
            } else if (sectionTitle === "Latest Movies") {
                const elements = section.find(".flw-item").toArray();
                for (const el of elements) {
                    const movieItem = await extractMovie($, el);
                    response.latestMovies.push(movieItem);
                }
            } else if (sectionTitle === "Latest TV Shows") {
                const elements = section.find(".flw-item").toArray();
                for (const el of elements) {
                    const tvItem = await extractTvSeries($, el);
                    response.latestTvSeries.push(tvItem);
                }
            } else if (sectionTitle === "Coming Soon") {
                const elements = section.find(".flw-item").toArray();
                for (const el of elements) {
                    const item = await extractDetect($, el);
                    response.comingSoon.push(item);
                }
            }
        }

        res.status(200).json(response);
    } catch(err) {
        console.error("Error scraping home page:", err);
        res.status(500).json({ error: "Failed to scrape data from the source." });
    }
}
