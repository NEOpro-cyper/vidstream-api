// API Configuration and Functions - FIXED VERSION
class MovieAPI {
    constructor(baseUrl = 'https://vidstream-api-eb68.vercel.app') {
        this.baseUrl = baseUrl;
        this.cache = new Map(); // Add caching for better performance
        this.requestQueue = Promise.resolve(); // Queue requests to prevent overwhelming API
    }

    // Helper method for making API requests with improved error handling and caching
    async makeRequest(endpoint, useCache = true) {
        // Check cache first
        if (useCache && this.cache.has(endpoint)) {
            console.log('Cache hit for:', endpoint);
            return this.cache.get(endpoint);
        }

        // Queue the request to prevent overwhelming the API
        return this.requestQueue = this.requestQueue.then(async () => {
            try {
                console.log('Making API request to:', `${this.baseUrl}${endpoint}`);
                
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
                
                const response = await fetch(`${this.baseUrl}${endpoint}`, {
                    signal: controller.signal,
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    }
                });
                
                clearTimeout(timeoutId);
                
                if (!response.ok) {
                    const errorText = await response.text();
                    console.error(`HTTP ${response.status} error for ${endpoint}:`, errorText);
                    throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
                }
                
                const data = await response.json();
                console.log('API Response for', endpoint, ':', data);
                
                // Cache successful responses
                if (useCache && data) {
                    this.cache.set(endpoint, data);
                    // Auto-expire cache after 5 minutes
                    setTimeout(() => this.cache.delete(endpoint), 5 * 60 * 1000);
                }
                
                return data;
            } catch (error) {
                if (error.name === 'AbortError') {
                    throw new Error('Request timeout - API is taking too long to respond');
                }
                console.error('API Request failed for', endpoint, ':', error);
                throw error;
            }
        });
    }

    // Search for movies and TV shows
    async search(query) {
        if (!query || query.trim() === '') {
            throw new Error('Search query is required');
        }
        return await this.makeRequest(`/search?q=${encodeURIComponent(query.trim())}`);
    }

    // Get movie/TV show details
    async getMovieDetails(movieId) {
        if (!movieId) {
            throw new Error('Movie ID is required');
        }
        return await this.makeRequest(`/movie/${movieId}`);
    }

    // FIXED: Get seasons for a TV series with better error handling
    async getSeasons(movieId) {
        if (!movieId) {
            throw new Error('Movie ID is required');
        }
        
        try {
            console.log(`Fetching seasons for movie ID: ${movieId}`);
            const result = await this.makeRequest(`/movie/${movieId}/seasons`);
            
            // Better response validation
            if (!result) {
                console.warn('Empty response from seasons endpoint');
                return { seasons: [] };
            }
            
            // Handle different response formats
            if (result.seasons) {
                console.log(`Found ${result.seasons.length} seasons`);
                return result;
            } else if (Array.isArray(result)) {
                console.log(`Found ${result.length} seasons (array format)`);
                return { seasons: result };
            } else {
                console.warn('Unexpected seasons response format:', result);
                return { seasons: [] };
            }
        } catch (error) {
            console.error('Failed to fetch seasons:', error);
            // Don't throw, return empty result to prevent UI crashes
            return { seasons: [] };
        }
    }

    // IMPROVED: Get episodes for a specific season with validation
    async getEpisodes(movieId, seasonId) {
        if (!movieId || !seasonId) {
            throw new Error('Movie ID and Season ID are required');
        }
        
        try {
            console.log(`Fetching episodes for movie ID: ${movieId}, season ID: ${seasonId}`);
            const result = await this.makeRequest(`/movie/${movieId}/episodes?seasonId=${seasonId}`);
            
            if (!result) {
                return { episodes: [] };
            }
            
            if (result.episodes) {
                return result;
            } else if (Array.isArray(result)) {
                return { episodes: result };
            } else {
                console.warn('Unexpected episodes response format:', result);
                return { episodes: [] };
            }
        } catch (error) {
            console.error('Failed to fetch episodes:', error);
            return { episodes: [] };
        }
    }

    // IMPROVED: Get available servers for an episode
    async getServers(movieId, episodeId) {
        if (!movieId || !episodeId) {
            throw new Error('Movie ID and Episode ID are required');
        }
        
        try {
            console.log(`Fetching servers for movie ID: ${movieId}, episode ID: ${episodeId}`);
            const result = await this.makeRequest(`/movie/${movieId}/servers?episodeId=${episodeId}`);
            
            if (!result) {
                return { servers: [] };
            }
            
            if (result.servers) {
                return result;
            } else if (Array.isArray(result)) {
                return { servers: result };
            } else {
                console.warn('Unexpected servers response format:', result);
                return { servers: [] };
            }
        } catch (error) {
            console.error('Failed to fetch servers:', error);
            return { servers: [] };
        }
    }

    // IMPROVED: Get video sources from a specific server
    async getSources(movieId, serverId) {
        if (!movieId || !serverId) {
            throw new Error('Movie ID and Server ID are required');
        }
        
        try {
            console.log(`Fetching sources for movie ID: ${movieId}, server ID: ${serverId}`);
            const result = await this.makeRequest(`/movie/${movieId}/sources?serverId=${serverId}`, false); // Don't cache video sources
            
            if (!result) {
                throw new Error('No video sources available');
            }
            
            if (!result.link) {
                throw new Error('No video link in response');
            }
            
            return result;
        } catch (error) {
            console.error('Failed to fetch sources:', error);
            throw error;
        }
    }

    // NEW: Check if content is a TV series and has seasons
    async checkIfTVSeries(movieId) {
        try {
            const details = await this.getMovieDetails(movieId);
            return details && (details.type === 'tvSeries' || details.type === 'tv');
        } catch (error) {
            console.error('Failed to check content type:', error);
            return false;
        }
    }

    // IMPROVED: Complete workflow for TV series with better validation
    async getTVSeriesData(movieId) {
        try {
            // First check if it's actually a TV series
            const isTVSeries = await this.checkIfTVSeries(movieId);
            if (!isTVSeries) {
                throw new Error('This content is not a TV series');
            }
            
            // Get seasons
            const seasonsData = await this.getSeasons(movieId);
            console.log('Seasons data:', seasonsData);
            
            if (!seasonsData.seasons || seasonsData.seasons.length === 0) {
                throw new Error('No seasons available for this TV series');
            }
            
            return seasonsData;
        } catch (error) {
            console.error('Failed to get TV series data:', error);
            throw error;
        }
    }

    // IMPROVED: Complete workflow for playing an episode
    async getEpisodePlaybackData(movieId, episodeId) {
        try {
            console.log(`Getting playback data for episode ${episodeId} of movie ${movieId}`);
            
            // Get available servers
            const serversData = await this.getServers(movieId, episodeId);
            
            if (!serversData.servers || serversData.servers.length === 0) {
                throw new Error('No servers available for this episode');
            }

            // Try to get sources from the first available server
            let sourcesData = null;
            let workingServer = null;
            
            for (const server of serversData.servers) {
                try {
                    console.log(`Trying server: ${server.name} (ID: ${server.id})`);
                    sourcesData = await this.getSources(movieId, server.id);
                    workingServer = server;
                    break;
                } catch (serverError) {
                    console.warn(`Server ${server.name} failed:`, serverError);
                    continue;
                }
            }
            
            if (!sourcesData || !workingServer) {
                throw new Error('No working servers available');
            }

            return {
                servers: serversData.servers,
                currentServer: workingServer,
                videoUrl: sourcesData.link,
                type: sourcesData.type
            };
        } catch (error) {
            console.error('Failed to get episode playback data:', error);
            throw error;
        }
    }

    // Keep all other existing methods unchanged for movies...
    async getMoviePlaybackData(movieId, episodeId) {
        try {
            // For movies, episodeId might not be needed
            const serversData = await this.getServers(movieId, episodeId);
            
            if (!serversData.servers || serversData.servers.length === 0) {
                throw new Error('No servers available');
            }

            const firstServer = serversData.servers[0];
            const sourcesData = await this.getSources(movieId, firstServer.id);

            return {
                servers: serversData.servers,
                currentServer: firstServer,
                videoUrl: sourcesData.link,
                type: sourcesData.type
            };
        } catch (error) {
            console.error('Failed to get movie playback data:', error);
            throw error;
        }
    }

    // Clear cache method for debugging
    clearCache() {
        this.cache.clear();
        console.log('Cache cleared');
    }

    // Get cache status for debugging
    getCacheStatus() {
        return {
            size: this.cache.size,
            keys: Array.from(this.cache.keys())
        };
    }

    // ALL OTHER EXISTING METHODS REMAIN THE SAME...
    getHomePage() { /* existing code */ }
    switchServer(movieId, serverId) { /* existing code */ }
    isValidVideoUrl(url) { /* existing code */ }
    getContentType(movieData) { /* existing code */ }
    formatDuration(duration) { /* existing code */ }
    getGenres(stats) { /* existing code */ }
    getCast(stats) { /* existing code */ }
    getDuration(stats) { /* existing code */ }
    getProduction(stats) { /* existing code */ }
    getCountry(stats) { /* existing code */ }
    getFallbackPoster(width = 300, height = 400) { /* existing code */ }
    isMovie(movieData) { /* existing code */ }
    isTVSeries(movieData) { /* existing code */ }
    formatRating(rating) { /* existing code */ }
    generateSearchSuggestions(query, results) { /* existing code */ }
    
    // IMPROVED error handling
    handleAPIError(error) {
        console.error('API Error:', error);
        
        if (error.message.includes('timeout')) {
            return 'Request timed out. The server is responding slowly.';
        }
        
        if (error.message.includes('Failed to fetch')) {
            return 'Network error. Please check your internet connection.';
        }
        
        if (error.message.includes('404')) {
            return 'Content not found.';
        }
        
        if (error.message.includes('500')) {
            return 'Server error. Please try again later.';
        }
        
        return error.message || 'An unexpected error occurred.';
    }
}

// Create global API instance
const movieAPI = new MovieAPI();

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MovieAPI;
}
