import { Request, Response } from "express";
import { EpisodeServerResponse } from "../types/controllers/movieEpisodeSources";
import { USER_AGENT_HEADER, ACCEPT_ENCODING_HEADER, ACCEPT_HEADER } from "../config/axois";
import axios from "axios";

// Validation function to ensure we never return invalid URLs
function validateM3U8Url(url: string): boolean {
    if (!url || typeof url !== 'string') return false;
    if (url === '.m3u8' || url === 'index.m3u8') return false;
    if (url.length < 20) return false;
    if (!url.startsWith('http')) return false;
    if (!url.includes('.m3u8')) return false;
    return true;
}

// Helper function to extract M3U8 URL from iframe
async function extractM3U8FromIframe(iframeUrl: string): Promise<{ m3u8Url: string | null, debugInfo: any }> {
    const debugInfo = {
        iframeUrl,
        htmlContentLength: 0,
        foundPatterns: [],
        apiEndpoints: [],
        errors: [],
        allMatches: [], // Track all potential matches
        m3u8Contexts: []
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
        
        // Save a larger sample for debugging
        debugInfo.htmlSample = htmlContent.substring(0, 2000);
        
        // Look for all .m3u8 occurrences for debugging
        const allM3u8Matches = htmlContent.match(/\.m3u8/g);
        if (allM3u8Matches) {
            console.log(`Found ${allM3u8Matches.length} .m3u8 occurrences in HTML`);
            
            // Find context around each .m3u8 occurrence
            const m3u8Contexts = [];
            let searchIndex = 0;
            let match;
            while ((match = htmlContent.indexOf('.m3u8', searchIndex)) !== -1) {
                const start = Math.max(0, match - 100);
                const end = Math.min(htmlContent.length, match + 100);
                const context = htmlContent.substring(start, end);
                m3u8Contexts.push(context);
                searchIndex = match + 5;
                if (m3u8Contexts.length >= 5) break; // Limit to first 5 occurrences
            }
            debugInfo.m3u8Contexts = m3u8Contexts;
        }

        // Enhanced regex patterns specifically for complex M3U8 URLs
        const m3u8Patterns = [
            // Most comprehensive pattern for complex URLs with special characters (~ + = etc)
            /["'`](https?:\/\/[^\s"'`<>{}|\\^[\]]+\.m3u8[^\s"'`<>{}|\\^[\]]*?)["'`]/gi,
            
            // Protocol-relative with complex characters
            /["'`](\/\/[^\s"'`<>{}|\\^[\]]+\.m3u8[^\s"'`<>{}|\\^[\]]*?)["'`]/gi,
            
            // Absolute paths with complex characters
            /["'`](\/[^\s"'`<>{}|\\^[\]]{10,}\.m3u8[^\s"'`<>{}|\\^[\]]*?)["'`]/gi,
            
            // JavaScript object properties - more flexible
            /(?:url|src|link|source|file|stream|playlist|video|hls)\s*[:\=]\s*["'`](https?:\/\/[^\s"'`<>{}|\\^[\]]+\.m3u8[^\s"'`<>{}|\\^[\]]*?)["'`]/gi,
            /(?:url|src|link|source|file|stream|playlist|video|hls)\s*[:\=]\s*["'`](\/\/[^\s"'`<>{}|\\^[\]]+\.m3u8[^\s"'`<>{}|\\^[\]]*?)["'`]/gi,
            /(?:url|src|link|source|file|stream|playlist|video|hls)\s*[:\=]\s*["'`](\/[^\s"'`<>{}|\\^[\]]+\.m3u8[^\s"'`<>{}|\\^[\]]*?)["'`]/gi,
            
            // Base64 patterns with better validation
            /(?:atob|window\.atob|Buffer\.from|decode)\s*\(\s*["'`]([A-Za-z0-9+\/=]{40,})["'`]\s*\)/gi,
            
            // Data attributes with flexible matching
            /data-[a-zA-Z0-9\-_]+\s*=\s*["'`](https?:\/\/[^\s"'`<>{}|\\^[\]]+\.m3u8[^\s"'`<>{}|\\^[\]]*?)["'`]/gi,
            /data-[a-zA-Z0-9\-_]+\s*=\s*["'`](\/\/[^\s"'`<>{}|\\^[\]]+\.m3u8[^\s"'`<>{}|\\^[\]]*?)["'`]/gi,
            /data-[a-zA-Z0-9\-_]+\s*=\s*["'`](\/[^\s"'`<>{}|\\^[\]]+\.m3u8[^\s"'`<>{}|\\^[\]]*?)["'`]/gi,
            
            // Function calls with flexible matching
            /(?:setSource|setSrc|loadVideo|playVideo|loadStream|play)\s*\(\s*["'`](https?:\/\/[^\s"'`<>{}|\\^[\]]+\.m3u8[^\s"'`<>{}|\\^[\]]*?)["'`]/gi,
            /(?:setSource|setSrc|loadVideo|playVideo|loadStream|play)\s*\(\s*["'`](\/\/[^\s"'`<>{}|\\^[\]]+\.m3u8[^\s"'`<>{}|\\^[\]]*?)["'`]/gi,
            /(?:setSource|setSrc|loadVideo|playVideo|loadStream|play)\s*\(\s*["'`](\/[^\s"'`<>{}|\\^[\]]+\.m3u8[^\s"'`<>{}|\\^[\]]*?)["'`]/gi,
            
            // Variable assignments
            /(?:var|let|const|=)\s+[a-zA-Z_$][a-zA-Z0-9_$]*\s*=\s*["'`](https?:\/\/[^\s"'`<>{}|\\^[\]]+\.m3u8[^\s"'`<>{}|\\^[\]]*?)["'`]/gi,
            /(?:var|let|const|=)\s+[a-zA-Z_$][a-zA-Z0-9_$]*\s*=\s*["'`](\/\/[^\s"'`<>{}|\\^[\]]+\.m3u8[^\s"'`<>{}|\\^[\]]*?)["'`]/gi,
            /(?:var|let|const|=)\s+[a-zA-Z_$][a-zA-Z0-9_$]*\s*=\s*["'`](\/[^\s"'`<>{}|\\^[\]]+\.m3u8[^\s"'`<>{}|\\^[\]]*?)["'`]/gi,
            
            // Generic pattern with very flexible character matching (last resort)
            /["'`]([^\s"'`<>{}|\\^[\]]{25,}\.m3u8[^\s"'`<>{}|\\^[\]]*?)["'`]/gi,
            
            // Fallback patterns for edge cases
            /m3u8["'`\s]*[:\=]["'`\s]*["'`]([^\s"'`<>{}|\\^[\]]+)["'`]/gi,
            /["'`]([^\s"'`<>{}|\\^[\]]*\.m3u8[^\s"'`<>{}|\\^[\]]{0,200})["'`]/gi
        ];

        let m3u8Url = null;
        let bestMatch = null;
        let bestScore = 0;

        // Try each pattern and collect debug info
        for (let i = 0; i < m3u8Patterns.length; i++) {
            const pattern = m3u8Patterns[i];
            let match;
            const patternMatches = [];
            
            // Reset regex lastIndex to avoid issues with global regex
            pattern.lastIndex = 0;
            
            while ((match = pattern.exec(htmlContent)) !== null) {
                let potentialUrl = match[1];
                patternMatches.push(potentialUrl);
                
                console.log(`Pattern ${i}: Found match "${potentialUrl.substring(0, 100)}${potentialUrl.length > 100 ? '...' : ''}"`);
                
                debugInfo.allMatches.push({
                    patternIndex: i,
                    match: potentialUrl.length > 200 ? potentialUrl.substring(0, 200) + '...' : potentialUrl,
                    fullLength: potentialUrl.length
                });
                
                // Enhanced validation - skip obviously invalid matches
                if (!potentialUrl || potentialUrl === '.m3u8') {
                    console.log(`❌ Invalid match: empty or just extension`);
                    continue;
                }
                
                // Handle base64 decoding for base64 patterns
                if (pattern.source.includes('atob') || pattern.source.includes('decode') || pattern.source.includes('Buffer')) {
                    try {
                        // Only decode if it looks like base64 and is long enough
                        if (potentialUrl.length > 30 && /^[A-Za-z0-9+\/=]+$/.test(potentialUrl)) {
                            const decoded = Buffer.from(potentialUrl, 'base64').toString('utf-8');
                            console.log('Base64 decoded:', decoded.substring(0, 200));
                            
                            // Look for M3U8 URLs in decoded content
                            const urlMatch = decoded.match(/(https?:\/\/[^\s"'`<>{}|\\^[\]]+\.m3u8[^\s"'`<>{}|\\^[\]]*)/);
                            if (urlMatch) {
                                potentialUrl = urlMatch[1];
                            } else {
                                // Try other patterns in decoded content
                                const altMatch = decoded.match(/(\/\/[^\s"'`<>{}|\\^[\]]+\.m3u8[^\s"'`<>{}|\\^[\]]*)/);
                                if (altMatch) {
                                    potentialUrl = 'https:' + altMatch[1];
                                } else {
                                    continue;
                                }
                            }
                        } else {
                            continue;
                        }
                    } catch (e) {
                        console.log('❌ Base64 decode failed:', e.message);
                        continue;
                    }
                }
                
                // Score the match quality
                let score = 0;
                
                // Must contain .m3u8
                if (!potentialUrl.includes('.m3u8')) {
                    console.log('❌ No .m3u8 in URL');
                    continue;
                }
                
                // Must be reasonable length
                if (potentialUrl.length < 15) {
                    console.log('❌ URL too short:', potentialUrl.length);
                    continue;
                }
                
                // Normalize URL
                if (potentialUrl.startsWith('//')) {
                    potentialUrl = 'https:' + potentialUrl;
                } else if (potentialUrl.startsWith('/') && !potentialUrl.startsWith('//')) {
                    const urlObj = new URL(iframeUrl);
                    potentialUrl = `${urlObj.protocol}//${urlObj.host}${potentialUrl}`;
                }
                
                // Must start with http/https after normalization
                if (!potentialUrl.startsWith('http')) {
                    console.log('❌ Not HTTP URL after normalization:', potentialUrl);
                    continue;
                }
                
                // Score based on URL characteristics
                if (potentialUrl.startsWith('https://')) score += 10;
                if (potentialUrl.length > 50) score += 5;
                if (potentialUrl.length > 100) score += 5;
                if (potentialUrl.includes('cdn') || potentialUrl.includes('stream') || potentialUrl.includes('video')) score += 5;
                if (potentialUrl.endsWith('.m3u8')) score += 10;
                if (potentialUrl.includes('1080') || potentialUrl.includes('720') || potentialUrl.includes('480')) score += 5;
                if (potentialUrl.includes('index.m3u8')) score += 15; // Higher score for index files
                
                // Bonus points for complex URLs (likely to be real streaming URLs)
                if (potentialUrl.length > 200) score += 10;
                if ((potentialUrl.match(/[~+=]/g) || []).length > 5) score += 8;
                
                console.log(`✅ Valid M3U8 URL found (score: ${score}):`, potentialUrl.substring(0, 100) + '...');
                
                // Keep the best match
                if (score > bestScore) {
                    bestScore = score;
                    bestMatch = potentialUrl;
                    debugInfo.foundPatterns.push({
                        patternIndex: i,
                        pattern: pattern.source.substring(0, 80) + '...',
                        match: potentialUrl.length > 200 ? potentialUrl.substring(0, 200) + '...' : potentialUrl,
                        score: score,
                        fullLength: potentialUrl.length
                    });
                }
                
                // Don't break - continue looking for better matches
            }
            
            if (patternMatches.length > 0) {
                debugInfo.foundPatterns.push({
                    patternIndex: i,
                    matches: patternMatches.map(m => m.length > 100 ? m.substring(0, 100) + '...' : m)
                });
            }
        }
        
        // Use the best match if it's valid
        if (bestMatch && validateM3U8Url(bestMatch)) {
            m3u8Url = bestMatch;
            console.log('🎉 Selected best M3U8 URL (score:', bestScore, '):', m3u8Url.substring(0, 100) + '...');
        }

        // Enhanced API endpoint discovery (if no direct URL found)
        if (!m3u8Url) {
            console.log('🔍 No direct M3U8 found, trying API endpoints...');
            
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
                        
                        // Search in API response using enhanced patterns
                        const searchText = typeof apiData === 'string' ? apiData : JSON.stringify(apiData);
                        
                        // Try multiple patterns on API response
                        for (const searchPattern of [
                            /["'`]([^\s"'`<>{}|\\^[\]]+\.m3u8[^\s"'`<>{}|\\^[\]]*?)["'`]/g,
                            /(https?:\/\/[^\s"'`<>{}|\\^[\]]+\.m3u8[^\s"'`<>{}|\\^[\]]*)/g,
                            /(\/\/[^\s"'`<>{}|\\^[\]]+\.m3u8[^\s"'`<>{}|\\^[\]]*)/g
                        ]) {
                            const m3u8Match = searchText.match(searchPattern);
                            if (m3u8Match) {
                                let foundUrl = m3u8Match[1] || m3u8Match[0];
                                
                                if (foundUrl.startsWith('//')) {
                                    foundUrl = 'https:' + foundUrl;
                                } else if (foundUrl.startsWith('/')) {
                                    const urlObj = new URL(apiUrl);
                                    foundUrl = `${urlObj.protocol}//${urlObj.host}${foundUrl}`;
                                }
                                
                                if (validateM3U8Url(foundUrl)) {
                                    m3u8Url = foundUrl;
                                    debugInfo.foundPatterns.push({
                                        source: 'api',
                                        apiUrl,
                                        match: foundUrl
                                    });
                                    break;
                                }
                            }
                        }
                        
                        if (m3u8Url) break;
                        
                    } catch (e) {
                        debugInfo.errors.push(`API call failed: ${apiUrl} - ${e.message}`);
                        continue;
                    }
                }
                if (m3u8Url) break;
            }
        }

        console.log('Final M3U8 URL:', m3u8Url ? m3u8Url.substring(0, 100) + '...' : 'null');
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
            
            // CRITICAL: Validate the extracted URL before setting it
            if (extractionResult.m3u8Url && validateM3U8Url(extractionResult.m3u8Url)) {
                responseData.m3u8 = extractionResult.m3u8Url;
                responseData.streamUrl = extractionResult.m3u8Url;
                responseData.extractionSuccess = true;
                console.log('✅ Successfully extracted valid M3U8:', extractionResult.m3u8Url.substring(0, 100) + '...');
            } else {
                console.log('❌ Could not extract valid M3U8 URL from iframe');
                responseData.m3u8 = null;
                responseData.streamUrl = null;
                responseData.extractionSuccess = false;
                responseData.note = 'Valid M3U8 URL could not be extracted from iframe';
                
                // Log what we found for debugging
                if (extractionResult.m3u8Url) {
                    console.log('❌ Invalid M3U8 URL rejected:', extractionResult.m3u8Url);
                }
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
