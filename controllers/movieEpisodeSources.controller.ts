import { Request, Response } from "express";
import { EpisodeServerResponse } from "../types/controllers/movieEpisodeSources";
import { USER_AGENT_HEADER, ACCEPT_ENCODING_HEADER, ACCEPT_HEADER } from "../config/axois";
import axios from "axios";

// Helper function to extract M3U8 URL from iframe
async function extractM3U8FromIframe(iframeUrl: string): Promise<string | null> {
    try {
        console.log('Fetching iframe content from:', iframeUrl);
        
        const iframeResponse = await axios.get(iframeUrl, {
            headers: {
                "User-Agent": USER_AGENT_HEADER,
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.5",
                "Accept-Encoding": "gzip, deflate, br",
                "Referer": "https://flixhq-tv.lol/",
                "Upgrade-Insecure-Requests": "1"
            },
            timeout: 10000
        });

        const htmlContent = iframeResponse.data;
        
        // Multiple regex patterns to find M3U8 URLs
        const m3u8Patterns = [
            // Direct M3U8 URLs
            /["']([^"']*\.m3u8[^"']*?)["']/gi,
            // Base64 encoded URLs
            /atob\(["']([^"']+)["']\)/gi,
            // URL constructors
            /new\s+URL\(["']([^"']*\.m3u8[^"']*?)["']/gi,
            // Source URLs in video tags
            /<source[^>]+src=["']([^"']*\.m3u8[^"']*?)["']/gi,
            // JavaScript variable assignments
            /(?:src|url|link|source)\s*[:=]\s*["']([^"']*\.m3u8[^"']*?)["']/gi,
            // HLS playlist URLs
            /["']([^"']*(?:playlist|master|index)\.m3u8[^"']*?)["']/gi
        ];

        let m3u8Url = null;

        // Try each pattern
        for (const pattern of m3u8Patterns) {
            let match;
            while ((match = pattern.exec(htmlContent)) !== null) {
                let potentialUrl = match[1];
                
                // If it's base64 encoded, decode it
                if (pattern.source.includes('atob')) {
                    try {
                        potentialUrl = Buffer.from(potentialUrl, 'base64').toString('utf-8');
                    } catch (e) {
                        continue;
                    }
                }
                
                // Validate if it's a proper M3U8 URL
                if (potentialUrl.includes('.m3u8')) {
                    // If it's a relative URL, make it absolute
                    if (potentialUrl.startsWith('/')) {
                        const urlObj = new URL(iframeUrl);
                        potentialUrl = `${urlObj.protocol}//${urlObj.host}${potentialUrl}`;
                    } else if (potentialUrl.startsWith('http')) {
                        m3u8Url = potentialUrl;
                        break;
                    }
                }
            }
            if (m3u8Url) break;
        }

        // If no M3U8 found in HTML, try looking for API endpoints
        if (!m3u8Url) {
            const apiPatterns = [
                /["']([^"']*\/api\/[^"']*?)["']/gi,
                /["']([^"']*\/source\/[^"']*?)["']/gi,
                /["']([^"']*\/stream\/[^"']*?)["']/gi
            ];

            for (const pattern of apiPatterns) {
                let match;
                while ((match = pattern.exec(htmlContent)) !== null) {
                    const apiUrl = match[1];
                    try {
                        // Try to fetch from the API endpoint
                        const apiResponse = await axios.get(apiUrl.startsWith('http') ? apiUrl : `https://videostr.net${apiUrl}`, {
                            headers: {
                                "User-Agent": USER_AGENT_HEADER,
                                "Referer": iframeUrl,
                                "Accept": "application/json, text/plain, */*"
                            },
                            timeout: 5000
                        });

                        const apiData = apiResponse.data;
                        
                        // Look for M3U8 in API response
                        if (typeof apiData === 'object') {
                            const jsonStr = JSON.stringify(apiData);
                            const m3u8Match = jsonStr.match(/["']([^"']*\.m3u8[^"']*?)["']/);
                            if (m3u8Match) {
                                m3u8Url = m3u8Match[1];
                                break;
                            }
                        }
                    } catch (e) {
                        console.log('Failed to fetch API endpoint:', apiUrl);
                        continue;
                    }
                }
                if (m3u8Url) break;
            }
        }

        console.log('Extracted M3U8 URL:', m3u8Url);
        return m3u8Url;

    } catch (error) {
        console.error('Error extracting M3U8 from iframe:', error.message);
        return null;
    }
}

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

        // Fetch from FlixHQ API
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

        const responseData = { ...flixhqResponse.data };
        
        if (responseData.link) {
            // Add _debug=true to the iframe link
            const baseUrl = responseData.link.split('?')[0];
            responseData.link = `${baseUrl}?_debug=true`;
            
            // Extract M3U8 URL from iframe
            const m3u8Url = await extractM3U8FromIframe(responseData.link);
            
            if (m3u8Url) {
                responseData.m3u8 = m3u8Url;
                responseData.streamUrl = m3u8Url; // Alternative key name
                console.log('Successfully extracted M3U8:', m3u8Url);
            } else {
                console.log('Could not extract M3U8 URL from iframe');
                responseData.m3u8 = null;
                responseData.note = 'M3U8 URL could not be extracted from iframe';
            }
        }

        // Return the enhanced response
        res.json(responseData);

    } catch (error) {
        console.error('Error fetching sources:', error);
        console.error('Error details:', {
            message: error.message,
            status: error.response?.status,
            statusText: error.response?.statusText,
            data: error.response?.data,
            url: `https://flixhq-tv.lol/ajax/episode/sources/${req.query.serverId}`
        });
        
        res.status(500).json({
            success: false,
            error: 'Failed to fetch video sources',
            debug: {
                serverId: req.query.serverId,
                url: `https://flixhq-tv.lol/ajax/episode/sources/${req.query.serverId}`,
                errorMessage: error.message,
                statusCode: error.response?.status
            }
        });
    }
}
