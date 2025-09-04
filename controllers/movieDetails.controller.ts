import { Request, Response } from "express";
import { MovieDetailsResponse } from "../types/controllers/movieDetails";
import { USER_AGENT_HEADER, ACCEPT_ENCODING_HEADER, ACCEPT_HEADER, SRC_AJAX_URL, SRC_BASE_URL } from "../config/axois";
import axios from "axios";
import { load, CheerioAPI } from "cheerio";
import { extractDetect } from "../utils/extractMovieTvSeriesItem";

// GET /movie/:id
export default async function (req: Request, res: Response) {
    const response: MovieDetailsResponse = {
        title: "",
        description: "",
        type: "",
        episodeId: "", // Moved below type
        poster: "",
        stats: [],
        related: [],
    };
    
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
    
    response.title = $(".heading-name a").text().trim() || $("h2.heading-name").text().trim();
    response.description = $(".description").text().trim();
    
    // Extract poster URL - try multiple selectors
    response.poster = $(".m_i-d-poster .film-poster .film-poster-img").attr("src") || 
                     $(".film-poster .film-poster-img").attr("src") || 
                     $(".poster img").attr("src") || "";
    
    // Extract stats from the elements section
    $(".elements .row-line").each((_, el) => {
        const typeText = $(el).find(".type").text().trim();
        if (typeText) {
            const stat: any = {
                name: typeText,
                value: []
            };
            
            const anchorTags = $(el).find("a");
            if (anchorTags.length) {
                anchorTags.each((_, anchor) => {
                    const text = $(anchor).text().trim();
                    if (text) stat.value.push(text);
                });
            } else {
                const valueText = $(el).clone().children(".type").remove().end().text().trim();
                if (valueText) stat.value = valueText;
            }
            
            if (stat.value.length > 0 || stat.value) {
                response.stats.push(stat);
            }
        }
    });
    
    // Extract related movies from the "You May Also Like" section
    $(".film-related .flw-item").each((_, el) => {
        const relatedItem = {
            id: "",
            title: "",
            poster: "",
            link: "",
            stats: {
                year: "",
                duration: "", 
                type: ""
            }
        };
        
        // Extract title and link
        const titleLink = $(el).find(".film-name a").first();
        relatedItem.title = titleLink.text().trim();
        relatedItem.link = titleLink.attr("href") || "";
        
        // Extract ID from link (e.g., /movie/watch-superman-127954 -> 127954)
        const linkMatch = relatedItem.link.match(/watch-[\w-]+-(\d+)$/);
        if (linkMatch) {
            relatedItem.id = linkMatch[1];
        }
        
        // Extract poster
        relatedItem.poster = $(el).find(".film-poster-img").attr("src") || 
                            $(el).find(".film-poster-img").attr("data-src") || "";
        
        // Extract year, duration, and type from fd-infor
        const infoItems = $(el).find(".fd-infor .fdi-item");
        infoItems.each((idx, infoEl) => {
            const text = $(infoEl).text().trim();
            if (/^\d{4}$/.test(text)) {
                relatedItem.stats.year = text;
            } else if (text.includes("m")) {
                relatedItem.stats.duration = text;
            }
        });
        
        // Extract type from float-right
        relatedItem.stats.type = $(el).find(".fd-infor .fdi-type").text().trim() || "Movie";
        
        if (relatedItem.title) {
            response.related.push(relatedItem);
        }
    });
    
    const axiosResponseLines = axiosResponse.data.split("\n");
    for (let i = axiosResponseLines.length - 1; i > 0; i--) {
        if (axiosResponseLines[i].includes("const movie = {")) {
            response.type = (axiosResponseLines[i + 2].includes("type: '1'")) ? "movie" : "tvSeries";
            if (response.type === "movie") response.episodeId = axiosResponseLines[i + 4].split("'")[1];
        }
    }
    
    res.send(response);
}
