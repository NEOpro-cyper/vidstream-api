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
        allMatches: [],
        m3u8Contexts: [],
        htmlSample: '',
        jsVariables: [],
        allUrls: [],
        potentialBase64: []
    };

    try {
        console.log('🔍 Fetching iframe content from:', iframeUrl);
        
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
        
        console.log('📄 HTML content length:', htmlContent.length);
        console.log('📄 HTML preview (first 500 chars):', htmlContent.substring(0, 500));
        
        // Save larger sample for debugging
        debugInfo.htmlSample = htmlContent.substring(0, 5000); // Increased size
        
        // 🔍 DETAILED ANALYSIS
        
        // 1. Look for ALL URLs in the content
        console.log('\n🌐 === ANALYZING ALL URLS ===');
        const allUrlMatches = htmlContent.match(/(https?:\/\/[^\s"'<>]+)/gi) || [];
        console.log(`Found ${allUrlMatches.length} HTTP URLs:`);
        allUrlMatches.forEach((url, i) => {
            console.log(`  ${i + 1}. ${url}`);
            debugInfo.allUrls.push(url);
        });
        
        // 2. Look for ALL .m3u8 occurrences with context
        console.log('\n🎬 === ANALYZING .m3u8 OCCURRENCES ===');
        const allM3u8Matches = htmlContent.match(/\.m3u8/g);
        if (allM3u8Matches) {
            console.log(`Found ${allM3u8Matches.length} .m3u8 occurrences:`);
            
            const m3u8Contexts = [];
            let searchIndex = 0;
            let match;
            let contextIndex = 1;
            while ((match = htmlContent.indexOf('.m3u8', searchIndex)) !== -1) {
                const start = Math.max(0, match - 200);
                const end = Math.min(htmlContent.length, match + 200);
                const context = htmlContent.substring(start, end);
                console.log(`\n  Context ${contextIndex}:`);
                console.log(`  ${context}`);
                console.log('  ' + '-'.repeat(80));
                
                m3u8Contexts.push(context);
                searchIndex = match + 5;
                contextIndex++;
                if (m3u8Contexts.length >= 10) break; // Show more contexts
            }
            debugInfo.m3u8Contexts = m3u8Contexts;
        } else {
            console.log('❌ NO .m3u8 occurrences found in HTML!');
        }
        
        // 3. Look for JavaScript variables that might contain URLs
        console.log('\n📜 === ANALYZING JAVASCRIPT VARIABLES ===');
        const jsVarPatterns = [
            /(?:var|let|const)\s+(\w+)\s*=\s*["'`]([^"'`]{20,})["'`]/gi,
            /(\w+)\s*[:\=]\s*["'`]([^"'`]{20,})["'`]/gi,
            /["'`](\w+)["'`]\s*:\s*["'`]([^"'`]{20,})["'`]/gi
        ];
        
        jsVarPatterns.forEach((pattern, patternIndex) => {
            let match;
            while ((match = pattern.exec(htmlContent)) !== null) {
                const varName = match[1];
                const varValue = match[2];
                console.log(`  Variable: ${varName} = "${varValue.substring(0, 100)}${varValue.length > 100 ? '...' : ''}"`);
                debugInfo.jsVariables.push({
                    name: varName,
                    value: varValue.length > 200 ? varValue.substring(0, 200) + '...' : varValue,
                    fullLength: varValue.length
                });
            }
        });
        
        // 4. Look for potential Base64 encoded content
        console.log('\n🔐 === ANALYZING POTENTIAL BASE64 ===');
        const base64Pattern = /["'`]([A-Za-z0-9+\/=]{30,})["'`]/gi;
        let base64Match;
        let base64Index = 1;
        while ((base64Match = base64Pattern.exec(htmlContent)) !== null && base64Index <= 10) {
            const base64String = base64Match[1];
            console.log(`\n  Base64 candidate ${base64Index}: ${base64String.substring(0, 50)}... (length: ${base64String.length})`);
            
            try {
                const decoded = Buffer.from(base64String, 'base64').toString('utf-8');
                console.log(`  Decoded: ${decoded.substring(0, 200)}${decoded.length > 200 ? '...' : ''}`);
                
                debugInfo.potentialBase64.push({
                    original: base64String.substring(0, 100) + '...',
                    decoded: decoded.length > 300 ? decoded.substring(0, 300) + '...' : decoded,
                    containsM3u8: decoded.includes('.m3u8'),
                    containsHttp: decoded.includes('http')
                });
                
                // Check if decoded content contains M3U8 URLs
                if (decoded.includes('.m3u8')) {
                    console.log(`  🎯 DECODED CONTENT CONTAINS .m3u8!`);
                }
                
            } catch (e) {
                console.log(`  ❌ Failed to decode: ${e.message}`);
            }
            base64Index++;
        }
        
        // 5. Look for script tags and their content
        console.log('\n📋 === ANALYZING SCRIPT TAGS ===');
        const scriptMatches = htmlContent.match(/<script[^>]*>([\s\S]*?)<\/script>/gi) || [];
        console.log(`Found ${scriptMatches.length} script tags:`);
        scriptMatches.forEach((script, i) => {
            const scriptContent = script.replace(/<\/?script[^>]*>/gi, '');
            console.log(`\n  Script ${i + 1} (length: ${scriptContent.length}):`);
            console.log(`  ${scriptContent.substring(0, 300)}${scriptContent.length > 300 ? '...' : ''}`);
            
            // Check if this script contains .m3u8
            if (scriptContent.includes('.m3u8')) {
                console.log(`  🎯 THIS SCRIPT CONTAINS .m3u8!`);
            }
        });
        
        // NOW TRY THE ENHANCED PATTERNS
        console.log('\n🔧 === TRYING ENHANCED PATTERNS ===');
        
        const m3u8Patterns = [
            // Super comprehensive patterns
            /["'`](https?:\/\/[^\s"'`<>{}|\\^[\]]+\.m3u8[^\s"'`<>{}|\\^[\]]*?)["'`]/gi,
            /["'`](\/\/[^\s"'`<>{}|\\^[\]]+\.m3u8[^\s"'`<>{}|\\^[\]]*?)["'`]/gi,
            /["'`](\/[^\s"'`<>{}|\\^[\]]{10,}\.m3u8[^\s"'`<>{}|\\^[\]]*?)["'`]/gi,
            
            // Look for any string that ends with .m3u8
            /([^\s"'`<>{}|\\^[\]]{10,}\.m3u8[^\s"'`<>{}|\\^[\]]*)/gi,
            
            // Base64 patterns
            /(?:atob|window\.atob|Buffer\.from|decode)\s*\(\s*["'`]([A-Za-z0-9+\/=]{40,})["'`]\s*\)/gi,
            
            // Any quoted string longer than 50 chars (might catch obfuscated URLs)
            /["'`]([^\s"'`]{50,})["'`]/gi,
            
            // Look in object properties
            /(?:url|src|link|source|file|stream|playlist|video|hls)\s*[:\=]\s*["'`]([^"'`]+)["'`]/gi,
        ];

        let m3u8Url = null;
        let bestMatch = null;
        let bestScore = 0;

        for (let i = 0; i < m3u8Patterns.length; i++) {
            const pattern = m3u8Patterns[i];
            console.log(`\n🔍 Trying pattern ${i + 1}/${m3u8Patterns.length}: ${pattern.source.substring(0, 80)}...`);
            
            let match;
            let matchCount = 0;
            pattern.lastIndex = 0;
            
            while ((match = pattern.exec(htmlContent)) !== null && matchCount < 20) {
                matchCount++;
                let potentialUrl = match[1];
                
                console.log(`  Match ${matchCount}: "${potentialUrl.substring(0, 150)}${potentialUrl.length > 150 ? '...' : ''}"`);
                
                debugInfo.allMatches.push({
                    patternIndex: i,
                    match: potentialUrl.length > 200 ? potentialUrl.substring(0, 200) + '...' : potentialUrl,
                    fullLength: potentialUrl.length
                });
                
                // Handle base64 decoding
                if (pattern.source.includes('atob') || pattern.source.includes('decode')) {
                    try {
                        const decoded = Buffer.from(potentialUrl, 'base64').toString('utf-8');
                        console.log(`    Base64 decoded: ${decoded.substring(0, 200)}...`);
                        
                        const urlMatch = decoded.match(/(https?:\/\/[^\s"'`<>{}|\\^[\]]+\.m3u8[^\s"'`<>{}|\\^[\]]*)/);
                        if (urlMatch) {
                            potentialUrl = urlMatch[1];
                            console.log(`    🎯 Found M3U8 in decoded: ${potentialUrl}`);
                        } else {
                            continue;
                        }
                    } catch (e) {
                        console.log(`    ❌ Base64 decode failed: ${e.message}`);
                        continue;
                    }
                }
                
                // Skip if doesn't contain .m3u8
                if (!potentialUrl.includes('.m3u8')) {
                    console.log(`    ❌ No .m3u8 found`);
                    continue;
                }
                
                // Scoring and validation
                let score = 0;
                
                if (potentialUrl.length < 15) {
                    console.log(`    ❌ Too short: ${potentialUrl.length}`);
                    continue;
                }
                
                // URL normalization
                let normalizedUrl = potentialUrl;
                if (potentialUrl.startsWith('//')) {
                    normalizedUrl = 'https:' + potentialUrl;
                } else if (potentialUrl.startsWith('/') && !potentialUrl.startsWith('//')) {
                    const urlObj = new URL(iframeUrl);
                    normalizedUrl = `${urlObj.protocol}//${urlObj.host}${potentialUrl}`;
                }
                
                if (!normalizedUrl.startsWith('http')) {
                    console.log(`    ❌ Not HTTP after normalization: ${normalizedUrl}`);
                    continue;
                }
                
                // Scoring
                if (normalizedUrl.startsWith('https://')) score += 10;
                if (normalizedUrl.length > 50) score += 5;
                if (normalizedUrl.length > 100) score += 5;
                if (normalizedUrl.includes('1080') || normalizedUrl.includes('720')) score += 5;
                if (normalizedUrl.endsWith('.m3u8')) score += 10;
                if (normalizedUrl.length > 200) score += 10;
                
                console.log(`    ✅ Valid candidate (score: ${score}): ${normalizedUrl.substring(0, 100)}...`);
                
                if (score > bestScore && validateM3U8Url(normalizedUrl)) {
                    bestScore = score;
                    bestMatch = normalizedUrl;
                    console.log(`    🏆 NEW BEST MATCH (score: ${score})`);
                }
            }
            
            console.log(`  Pattern ${i + 1} found ${matchCount} matches`);
        }
        
        if (bestMatch) {
            m3u8Url = bestMatch;
            console.log(`\n🎉 FINAL RESULT: ${m3u8Url.substring(0, 100)}...`);
        } else {
            console.log(`\n❌ NO VALID M3U8 URL FOUND`);
        }

        return { m3u8Url, debugInfo };

    } catch (error) {
        debugInfo.errors.push(`Main extraction error: ${error.message}`);
        console.error('❌ Error extracting M3U8 from iframe:', error.message);
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
            
            console.log(`\n🚀 Starting M3U8 extraction for: ${responseData.link}`);
            
            // Extract M3U8 URL from iframe
            const extractionResult = await extractM3U8FromIframe(responseData.link);
            
            // Validate the extracted URL
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
                
                if (extractionResult.m3u8Url) {
                    console.log('❌ Invalid M3U8 URL rejected:', extractionResult.m3u8Url);
                }
            }
            
            // Always include debug info when debug is requested
            if (req.query._debug === 'true' || process.env.NODE_ENV === 'development') {
                responseData.debugInfo = extractionResult.debugInfo;
            }
        }

        res.json(responseData);

    } catch (error) {
        console.error('Error fetching sources:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch video sources',
            debug: {
                serverId: req.query.serverId,
                errorMessage: error.message,
                statusCode: error.response?.status
            }
        });
    }
}
