import { Request, Response } from "express";
import { EpisodeServerResponse } from "../types/controllers/movieEpisodeSources";
import { USER_AGENT_HEADER, ACCEPT_ENCODING_HEADER, ACCEPT_HEADER } from "../config/axois";
import axios from "axios";

// Helper function to extract M3U8 URL from iframe
async function extractM3U8FromIframe(iframeUrl: string): Promise<{ m3u8Url: string | null, debugInfo: any }> {
    const debugInfo = {
        iframeUrl,
        htmlContentLength: 0,
        foundPatterns: [],
        apiEndpoints: [],
        errors: []
    };

    try {
        console.log('Fetching iframe content from:', iframeUrl);
        
        const iframeResponse = await axios.get(iframeUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
                "Accept-Encoding": "gzip, deflate, br",
                "Referer": "https://flixhq-tv.lol/",
                "Sec-Fetch-Dest": "iframe",
                "Sec-Fetch-Mode": "navigate",
                "Sec-Fetch-Site": "cross-site",
                "Upgrade-Insecure-Requests": "1",
                "Cache-Control": "no-cache"
            },
            timeout: 15000,
            maxRedirects: 5,
            validateStatus: (status) => status < 400
        });

        const htmlContent = iframeResponse.data;
        debugInfo.htmlContentLength = htmlContent.length;
        
        console.log('HTML content preview:', htmlContent.substring(0, 500));

        // Enhanced regex patterns for M3U8 extraction
        const m3u8Patterns = [
            // Direct M3U8 URLs - more comprehensive
            /["'`]([^"'`]*\.m3u8[^"'`]*?)["'`]/gi,
            // Base64 encoded - various forms
            /atob\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/gi,
            /btoa\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/gi,
            /window\.atob\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/gi,
            // URL in data attributes
            /data-[^=]*=\s*["'`]([^"'`]*\.m3u8[^"'`]*?)["'`]/gi,
            // JavaScript object properties
            /(?:url|src|link|source|file|stream)\s*:\s*["'`]([^"'`]*\.m3u8[^"'`]*?)["'`]/gi,
            // Function calls with M3U8
            /(?:setSource|setSrc|loadVideo|playVideo)\s*\(\s*["'`]([^"'`]*\.m3u8[^"'`]*?)["'`]/gi,
            // Encrypted or obfuscated patterns
            /\w+\s*=\s*["'`]([^"'`]*(?:aHR0c|http)[^"'`]*\.m3u8[^"'`]*?)["'`]/gi,
        ];

        let m3u8Url = null;

        // Try each pattern and collect debug info
        for (let i = 0; i < m3u8Patterns.length; i++) {
            const pattern = m3u8Patterns[i];
            let match;
            const patternMatches = [];
            
            while ((match = pattern.exec(htmlContent)) !== null) {
                let potentialUrl = match[1];
                patternMatches.push(potentialUrl);
                
                // Handle base64 decoding
                if (pattern.source.includes('atob') || pattern.source.includes('btoa')) {
                    try {
                        // Try base64 decode
                        const decoded = Buffer.from(potentialUrl, 'base64').toString('utf-8');
                        if (decoded.includes('.m3u8')) {
                            potentialUrl = decoded;
                        }
                    } catch (e) {
                        // Try URL decode in case it's URL encoded base64
                        try {
                            const urlDecoded = decodeURIComponent(potentialUrl);
                            const decoded = Buffer.from(urlDecoded, 'base64').toString('utf-8');
                            if (decoded.includes('.m3u8')) {
                                potentialUrl = decoded;
                            }
                        } catch (e2) {
                            continue;
                        }
                    }
                }
                
                // Validate and normalize URL
                if (potentialUrl.includes('.m3u8')) {
                    if (potentialUrl.startsWith('//')) {
                        potentialUrl = 'https:' + potentialUrl;
                    } else if (potentialUrl.startsWith('/')) {
                        const urlObj = new URL(iframeUrl);
                        potentialUrl = `${urlObj.protocol}//${urlObj.host}${potentialUrl}`;
                    }
                    
                    if (potentialUrl.startsWith('http')) {
                        m3u8Url = potentialUrl;
                        debugInfo.foundPatterns.push({
                            patternIndex: i,
                            pattern: pattern.source.substring(0, 50) + '...',
                            match: potentialUrl
                        });
                        break;
                    }
                }
            }
            
            if (patternMatches.length > 0) {
                debugInfo.foundPatterns.push({
                    patternIndex: i,
                    matches: patternMatches
                });
            }
            
            if (m3u8Url) break;
        }

        // Enhanced API endpoint discovery
        if (!m3u8Url) {
            const apiPatterns = [
                // Common API patterns for video streaming
                /["'`]([^"'`]*\/(?:api|ajax|source|stream|player|embed)\/[^"'`]*?)["'`]/gi,
                // Video ID based endpoints
                /["'`]([^"'`]*\/[a-zA-Z0-9]{8,}\/[^"'`]*?)["'`]/gi,
                // CDN endpoints
                /["'`](https?:\/\/[^"'`]*(?:cdn|stream|video|player)[^"'`]*?)["'`]/gi,
                // JavaScript fetch/xhr calls
                /(?:fetch|xhr\.open|axios\.get)\s*\(\s*["'`]([^"'`]+)["'`]/gi
            ];

            for (const pattern of apiPatterns) {
                let match;
                while ((match = pattern.exec(htmlContent)) !== null) {
                    let apiUrl = match[1];
                    
                    // Make URL absolute
                    if (apiUrl.startsWith('/')) {
                        const urlObj = new URL(iframeUrl);
                        apiUrl = `${urlObj.protocol}//${urlObj.host}${apiUrl}`;
                    }
                    
                    if (!apiUrl.startsWith('http')) continue;
                    
                    debugInfo.apiEndpoints.push(apiUrl);
                    
                    try {
                        console.log('Trying API endpoint:', apiUrl);
                        const apiResponse = await axios.get(apiUrl, {
                            headers: {
                                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                                "Referer": iframeUrl,
                                "Accept": "application/json, text/plain, */*",
                                "Origin": new URL(iframeUrl).origin,
                                "X-Requested-With": "XMLHttpRequest"
                            },
                            timeout: 8000
                        });

                        const apiData = apiResponse.data;
                        console.log('API response:', typeof apiData === 'string' ? apiData.substring(0, 200) : JSON.stringify(apiData).substring(0, 200));
                        
                        // Search in API response
                        const searchText = typeof apiData === 'string' ? apiData : JSON.stringify(apiData);
                        const m3u8Match = searchText.match(/["'`]([^"'`]*\.m3u8[^"'`]*?)["'`]/);
                        
                        if (m3u8Match) {
                            let foundUrl = m3u8Match[1];
                            if (foundUrl.startsWith('/')) {
                                const urlObj = new URL(apiUrl);
                                foundUrl = `${urlObj.protocol}//${urlObj.host}${foundUrl}`;
                            }
                            m3u8Url = foundUrl;
                            debugInfo.foundPatterns.push({
                                source: 'api',
                                apiUrl,
                                match: foundUrl
                            });
                            break;
                        }
                        
                    } catch (e) {
                        debugInfo.errors.push(`API call failed: ${apiUrl} - ${e.message}`);
                        continue;
                    }
                }
                if (m3u8Url) break;
            }
        }

        console.log('Final M3U8 URL:', m3u8Url);
        return { m3u8Url, debugInfo };

    } catch (error) {
        debugInfo.errors.push(`Main extraction error: ${error.message}`);
        console.error('Error extracting M3U8 from iframe:', error.message);
        return { m3u8Url: null, debugInfo };
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
            const extractionResult = await extractM3U8FromIframe(responseData.link);
            
            if (extractionResult.m3u8Url) {
                responseData.m3u8 = extractionResult.m3u8Url;
                responseData.streamUrl = extractionResult.m3u8Url;
                responseData.extractionSuccess = true;
                console.log('Successfully extracted M3U8:', extractionResult.m3u8Url);
            } else {
                console.log('Could not extract M3U8 URL from iframe');
                responseData.m3u8 = null;
                responseData.extractionSuccess = false;
                responseData.note = 'M3U8 URL could not be extracted from iframe';
            }
            
            // Add debug information in development/debug mode
            if (req.query._debug === 'true' || process.env.NODE_ENV === 'development') {
                responseData.debugInfo = extractionResult.debugInfo;
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
