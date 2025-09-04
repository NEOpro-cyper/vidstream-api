import { Request, Response } from "express";
import { MovieDetailsResponse } from "../types/controllers/movieDetails";
import { USER_AGENT_HEADER, ACCEPT_ENCODING_HEADER, ACCEPT_HEADER, SRC_AJAX_URL, SRC_BASE_URL } from "../config/axois";
import axios from "axios";
import { load, CheerioAPI } from "cheerio";
import { extractDetect } from "../utils/extractMovieTvSeriesItem";

// GET /movie/:id
export default async function (req: Request, res: Response) {
    const response: MovieDetailsResponse = {
        episodeId: "", // Moved to top
        title: "",
        description: "",
        poster: "", // Added poster field
        type: "",
        stats: [],
        related: [],
    };
    
    try {
        const axiosResponse = await axios.get(`${SRC_BASE_URL}/watch-movie/watch-${req.params.id}` as string, {
            headers: {
                "Alt-Used": "vidstream.to",
                "Host": "vidstream.to",
                "Referer": `https://vidstream.to/watch-movie/watch-${req.params.id}`,
                "User-Agent": USER_AGENT_HEADER,
                "Accept-Encoding": ACCEPT_ENCODING_HEADER,
                Accept: ACCEPT_HEADER,
            },
        });
        
        const $: CheerioAPI = load(axiosResponse.data);
        
        // Extract basic info
        response.title = $(".movie-detail h3.movie-name").text().trim();
        response.description = $(".movie-detail .is-description .dropdown-menu .dropdown-text").text().trim();
        
        // Extract poster - try multiple selectors
        response.poster = $(".movie-detail .movie-image img").attr("src") || 
                         $(".movie-detail .movie-image img").attr("data-src") ||
                         $(".movie-poster img").attr("src") ||
                         $(".movie-poster img").attr("data-src") ||
                         $(".film-poster img").attr("src") ||
                         $(".film-poster img").attr("data-src") ||
                         "";
        
        // Extract stats
        $(".movie-detail .is-sub > div").each((_, el) => {
            const stat: any = {
                name: $(el).find(".name").text(),
                value: []
            };
            const anchorTags = $(el).find(".value a");
            if (anchorTags.length) {
                anchorTags.each((_, anchor) => {
                    stat.value.push($(anchor).text());
                });
            } else {
                stat.value = $(el).find(".value").text().trim();
            }
            response.stats.push(stat);
        });
        
        // Extract related content from vidstream.to
        $vidstream(".section-related .item").each((_, el) => {
            const $el = $vidstream(el);
            
            // Extract href and ID
            let href = $el.find("a").first().attr("href") || 
                      $el.find(".film-poster-ahref").attr("href") || "";
            
            let id = "";
            if (href) {
                const hrefParts = href.split("-");
                id = hrefParts[hrefParts.length - 1] || "";
            }
            
            // Extract title
            const title = $el.find(".film-name").text().trim() ||
                         $el.find(".movie-name").text().trim() ||
                         $el.find("h3").text().trim() ||
                         $el.find(".title").text().trim() || "";
            
            // Extract poster
            const poster = $el.find("img").attr("src") ||
                          $el.find("img").attr("data-src") ||
                          $el.find(".film-poster-img").attr("src") ||
                          $el.find(".film-poster-img").attr("data-src") || "";
            
            // Extract stats from vidstream structure
            const year = $el.find(".fdi-item").first().text().trim() ||
                        $el.find(".year").text().trim() || "";
            
            const duration = $el.find(".fdi-duration").text().trim() ||
                           $el.find(".duration").text().trim() || "";
            
            const rating = $el.find(".fdi-rating").text().trim() ||
                          $el.find(".rating").text().trim() ||
                          $el.find(".imdb").text().trim() || "";
            
            // Only add if we have at least an ID and title
            if (id && title) {
                response.related.push({
                    id: id,
                    title: title,
                    poster: poster,
                    href: href,
                    stats: {
                        year: year,
                        duration: duration,
                        rating: rating
                    }
                });
            }
        });
        
        // Extract type and episodeId from JavaScript
        const axiosResponseLines = axiosResponse.data.split("\n");
        for (let i = axiosResponseLines.length - 1; i > 0; i--) {
            if (axiosResponseLines[i].includes("const movie = {")) {
                response.type = (axiosResponseLines[i + 2].includes("type: '1'")) ? "movie" : "tvSeries";
                if (response.type === "movie") {
                    const episodeIdLine = axiosResponseLines[i + 4];
                    if (episodeIdLine && episodeIdLine.includes("'")) {
                        response.episodeId = episodeIdLine.split("'")[1];
                    }
                }
                break;
            }
        }
        
    } catch (error) {
        console.error('Error fetching movie details:', error);
        return res.status(500).json({ error: 'Failed to fetch movie details' });
    }
    
    res.send(response);
}
