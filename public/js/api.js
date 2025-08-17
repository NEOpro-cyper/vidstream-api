// API Configuration and Functions
class MovieAPI {
    constructor(baseUrl = 'https://vidstream-api-eb68.vercel.app') {
        this.baseUrl = baseUrl;
    }

    // Helper method for making API requests
    async makeRequest(endpoint) {
        try {
            const response = await fetch(`${this.baseUrl}${endpoint}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error('API Request failed:', error);
            throw error;
        }
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

    // Get seasons for a TV series
    async getSeasons(movieId) {
        if (!movieId) {
            throw new Error('Movie ID is required');
        }
        return await this.makeRequest(`/movie/${movieId}/seasons`);
    }

    // Get episodes for a specific season
    async getEpisodes(movieId, seasonId) {
        if (!movieId || !seasonId) {
            throw new Error('Movie ID and Season ID are required');
        }
        return await this.makeRequest(`/movie/${movieId}/episodes?seasonId=${seasonId}`);
    }

    // Get available servers for an episode
    async getServers(movieId, episodeId) {
        if (!movieId || !episodeId) {
            throw new Error('Movie ID and Episode ID are required');
        }
        return await this.makeRequest(`/movie/${movieId}/servers?episodeId=${episodeId}`);
    }

    // Get video sources from a specific server
    async getSources(movieId, serverId) {
        if (!movieId || !serverId) {
            throw new Error('Movie ID and Server ID are required');
        }
        return await this.makeRequest(`/movie/${movieId}/sources?serverId=${serverId}`);
    }

    // Get homepage content (if available)
    async getHomePage() {
        try {
            return await this.makeRequest('/');
        } catch (error) {
            console.warn('Homepage endpoint not available:', error);
            return null;
        }
    }

    // Complete workflow for playing a movie
    async getMoviePlaybackData(movieId, episodeId) {
        try {
            // Get available servers
            const serversData = await this.getServers(movieId, episodeId);
            
            if (!serversData.servers || serversData.servers.length === 0) {
                throw new Error('No servers available');
            }

            // Get sources from the first available server
            const firstServer = serversData.servers[0];
            const sourcesData = await this.getSources(movieId, firstServer.id);

            return {
                servers: serversData.servers,
                currentServer: firstServer,
                videoUrl: sourcesData.link,
                type: sourcesData.type
            };
        } catch (error) {
            console.error('Failed to get playback data:', error);
            throw error;
        }
    }

    // Complete workflow for playing a TV series episode
    async getEpisodePlaybackData(movieId, episodeId) {
        return await this.getMoviePlaybackData(movieId, episodeId);
    }

    // Switch to a different server
    async switchServer(movieId, serverId) {
        try {
            const sourcesData = await this.getSources(movieId, serverId);
            return {
                videoUrl: sourcesData.link,
                type: sourcesData.type
            };
        } catch (error) {
            console.error('Failed to switch server:', error);
            throw error;
        }
    }

    // Validate video URL format
    isValidVideoUrl(url) {
        if (!url) return false;
        
        // Check if it's a proper URL
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    }

    // Extract content type from API response
    getContentType(movieData) {
        return movieData.type === 'movie' ? 'Movie' : 'TV Series';
    }

    // Format duration string
    formatDuration(duration) {
        if (!duration) return 'N/A';
        
        // Handle different duration formats
        if (typeof duration === 'string') {
            return duration;
        }
        
        if (typeof duration === 'number') {
            const hours = Math.floor(duration / 60);
            const minutes = duration % 60;
            return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
        }
        
        return 'N/A';
    }

    // Extract genres from stats array
    getGenres(stats) {
        const genresObj = stats.find(stat => stat.name === 'Genres:');
        return genresObj ? genresObj.value : [];
    }

    // Extract cast from stats array
    getCast(stats) {
        const castObj = stats.find(stat => stat.name === 'Cast:');
        return castObj ? castObj.value : [];
    }

    // Extract duration from stats array
    getDuration(stats) {
        const durationObj = stats.find(stat => stat.name === 'Duration:');
        return durationObj ? durationObj.value : 'N/A';
    }

    // Extract production info from stats array
    getProduction(stats) {
        const productionObj = stats.find(stat => stat.name === 'Production:');
        return productionObj ? productionObj.value : [];
    }

    // Extract country from stats array
    getCountry(stats) {
        const countryObj = stats.find(stat => stat.name === 'Country:');
        return countryObj ? countryObj.value : [];
    }

    // Generate fallback poster URL
    getFallbackPoster(width = 300, height = 400) {
        return `data:image/svg+xml;base64,${btoa(`
            <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="${width}" height="${height}" fill="#333"/>
                <text x="${width/2}" y="${height/2}" fill="#667" text-anchor="middle" font-family="Arial" font-size="18">No Image</text>
            </svg>
        `)}`;
    }

    // Check if content is a movie or TV series
    isMovie(movieData) {
        return movieData.type === 'movie';
    }

    // Check if content is a TV series
    isTVSeries(movieData) {
        return movieData.type === 'tvSeries';
    }

    // Format rating for display
    formatRating(rating) {
        if (!rating) return 'N/A';
        
        const numRating = parseFloat(rating);
        if (isNaN(numRating)) return rating;
        
        return numRating.toFixed(1);
    }

    // Generate search suggestions (basic implementation)
    generateSearchSuggestions(query, results) {
        if (!query || !results || !results.items) return [];
        
        return results.items
            .filter(item => item.title.toLowerCase().includes(query.toLowerCase()))
            .slice(0, 5)
            .map(item => ({
                id: item.id,
                title: item.title,
                type: item.type || 'movie'
            }));
    }

    // Error handling helper
    handleAPIError(error) {
        console.error('API Error:', error);
        
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
