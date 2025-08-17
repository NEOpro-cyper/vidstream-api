import { Request, Response } from "express";
import { EpisodeServerResponse } from "../types/controllers/movieEpisodeSources";
import { USER_AGENT_HEADER, ACCEPT_ENCODING_HEADER, ACCEPT_HEADER } from "../config/axois";
import axios from "axios";

// GET /movie/:id/sources?serverId=string
export default async function (req: any, res: Response) {
    try {
        const { serverId } = req.query;
        
        if (!serverId) {
            return res.status(400).json({ 
                success: false, 
                error: 'Server ID is required' 
            });
        }

        // Fetch from FlixHQ API directly instead of old vidstream
        const flixhqResponse = await axios.get(
            `https://flixhq-tv.lol/ajax/episode/sources/${serverId}`,
            {
                headers: {
                    "User-Agent": USER_AGENT_HEADER,
                    "Accept-Encoding": ACCEPT_ENCODING_HEADER,
                    "Accept": ACCEPT_HEADER,
                    "Referer": "https://flixhq-tv.lol/",
                    "X-Requested-With": "XMLHttpRequest"
                }
            }
        );

        const { type, link } = flixhqResponse.data;

        if (type === 'iframe' && link) {
            // Extract video sources from iframe without using RabbitStream parser
            const videoSources = await extractVideoSourcesSimple(link);
            
            res.json({
                success: true,
                sources: videoSources,
                subtitle: [], // Add subtitles if available
                intro: {
                    start: 0,
                    end: 0
                },
                outro: {
                    start: 0,
                    end: 0
                }
            });
        } else {
            res.json({
                success: false,
                error: 'No iframe source found'
            });
        }

    } catch (error) {
        console.error('Error fetching sources:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch video sources'
        });
    }
}

// Simple extraction function without JWT plugin
async function extractVideoSourcesSimple(iframeUrl: string) {
    try {
        const response = await axios.get(iframeUrl, {
            headers: {
                "User-Agent": USER_AGENT_HEADER,
                "Referer": "https://flixhq-tv.lol/"
            }
        });

        const html = response.data;
        const sources = [];

        // Look for m3u8 URLs (HLS streams)
        const m3u8Regex = /(https?:\/\/[^\s"']+\.m3u8[^\s"']*)/gi;
        let match;
        
        while ((match = m3u8Regex.exec(html)) !== null) {
            sources.push({
                url: match[1],
                quality: "auto",
                isM3U8: true
            });
        }

        // Look for mp4 URLs
        const mp4Regex = /(https?:\/\/[^\s"']+\.mp4[^\s"']*)/gi;
        while ((match = mp4Regex.exec(html)) !== null) {
            sources.push({
                url: match[1],
                quality: "720p", // Default quality
                isM3U8: false
            });
        }

        // If no sources found, try to extract from JavaScript variables
        if (sources.length === 0) {
            const jsVarRegex = /(?:file|src|source)["']?\s*[:=]\s*["']([^"']+)["']/gi;
            while ((match = jsVarRegex.exec(html)) !== null) {
                const url = match[1];
                if (url.includes('.m3u8') || url.includes('.mp4')) {
                    sources.push({
                        url: url,
                        quality: url.includes('.m3u8') ? "auto" : "720p",
                        isM3U8: url.includes('.m3u8')
                    });
                }
            }
        }

        return sources;

    } catch (error) {
        console.error('Error extracting video sources:', error);
        return [];
    }
}
