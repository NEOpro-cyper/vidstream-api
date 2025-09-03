import { HomePageResponse, SpotlightItem, MovieItem, TvSeriesItem } from "../types/controllers/homePage"; // Assuming types are defined here
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

        // --- Corrected Section Scraping (Trending, Latest, etc.) ---
        $("section.block_area_home").each((_, section) => {
            const sectionTitle = $(section).find("h2.cat-heading").text().trim();

            if (sectionTitle === "Trending") {
                // Scrape Trending Movies
                $(section).find("#trending-movies .flw-item").each((_, el) => {
                    response.trending.movies.push(extractMovie($, el));
                });
                // Scrape Trending TV Shows
                $(section).find("#trending-tv .flw-item").each((_, el) => {
                    response.trending.tvSeries.push(extractTvSeries($, el));
                });
            } else if (sectionTitle === "Latest Movies") {
                $(section).find(".flw-item").each((_, el) => {
                    response.latestMovies.push(extractMovie($, el));
                });
            } else if (sectionTitle === "Latest TV Shows") {
                $(section).find(".flw-item").each((_, el) => {
                    response.latestTvSeries.push(extractTvSeries($, el));
                });
            } else if (sectionTitle === "Coming Soon") {
                 $(section).find(".flw-item").each((_, el) => {
                    response.comingSoon.push(extractDetect($, el));
                });
            }
        });

        res.status(200).json(response);

    } catch(err) {
        console.error("Error scraping home page:", err);
        res.status(500).json({ error: "Failed to scrape data from the source." });
    }
}
