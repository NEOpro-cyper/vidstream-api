import axios from 'axios';
import { TMDB_CONFIG } from '../config/tmdb';
import { TMDBSearchResult, TMDBResponse } from '../types/tmdb';

export class TMDBService {
  private static instance: TMDBService;
  private cache = new Map<string, number>();

  static getInstance(): TMDBService {
    if (!TMDBService.instance) {
      TMDBService.instance = new TMDBService();
    }
    return TMDBService.instance;
  }

  private cleanTitle(title: string): string {
    // Remove common suffixes and clean the title for better matching
    return title
      .replace(/\s*\(.*?\)\s*/g, '') // Remove anything in parentheses
      .replace(/[^\w\s]/g, ' ') // Replace special characters with spaces
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .trim()
      .toLowerCase();
  }

  private extractYear(text: string): string | null {
    const yearMatch = text.match(/\b(19|20)\d{2}\b/);
    return yearMatch ? yearMatch[0] : null;
  }

  async searchMovie(title: string, year?: string): Promise<number | null> {
    try {
      if (!TMDB_CONFIG.API_KEY) {
        console.warn('TMDB API key not configured');
        return null;
      }

      const cacheKey = `movie_${title}_${year || ''}`;
      if (this.cache.has(cacheKey)) {
        return this.cache.get(cacheKey) || null;
      }

      const cleanedTitle = this.cleanTitle(title);
      let searchQuery = `${TMDB_CONFIG.BASE_URL}/search/movie`;
      const params: any = {
        api_key: TMDB_CONFIG.API_KEY,
        query: cleanedTitle,
        language: 'en-US',
        page: 1,
      };

      if (year) {
        params.year = year;
        params.primary_release_year = year;
      }

      const response = await axios.get<TMDBResponse>(searchQuery, { 
        params,
        timeout: 5000 // 5 second timeout
      });
      
      if (response.data.results && response.data.results.length > 0) {
        // Find the best match
        let bestMatch = response.data.results[0];
        
        // If we have a year, try to find a better match
        if (year) {
          const yearMatches = response.data.results.filter(result => 
            result.release_date && result.release_date.startsWith(year)
          );
          if (yearMatches.length > 0) {
            bestMatch = yearMatches[0];
          }
        }

        this.cache.set(cacheKey, bestMatch.id);
        return bestMatch.id;
      }
      
      return null;
    } catch (error) {
      console.error('Error searching TMDB for movie:', title, error);
      return null;
    }
  }

  async searchTVSeries(title: string, year?: string): Promise<number | null> {
    try {
      if (!TMDB_CONFIG.API_KEY) {
        console.warn('TMDB API key not configured');
        return null;
      }

      const cacheKey = `tv_${title}_${year || ''}`;
      if (this.cache.has(cacheKey)) {
        return this.cache.get(cacheKey) || null;
      }

      const cleanedTitle = this.cleanTitle(title);
      let searchQuery = `${TMDB_CONFIG.BASE_URL}/search/tv`;
      const params: any = {
        api_key: TMDB_CONFIG.API_KEY,
        query: cleanedTitle,
        language: 'en-US',
        page: 1,
      };

      if (year) {
        params.first_air_date_year = year;
      }

      const response = await axios.get<TMDBResponse>(searchQuery, { 
        params,
        timeout: 5000 // 5 second timeout
      });
      
      if (response.data.results && response.data.results.length > 0) {
        // Find the best match
        let bestMatch = response.data.results[0];
        
        // If we have a year, try to find a better match
        if (year) {
          const yearMatches = response.data.results.filter(result => 
            result.first_air_date && result.first_air_date.startsWith(year)
          );
          if (yearMatches.length > 0) {
            bestMatch = yearMatches[0];
          }
        }

        this.cache.set(cacheKey, bestMatch.id);
        return bestMatch.id;
      }
      
      return null;
    } catch (error) {
      console.error('Error searching TMDB for TV series:', title, error);
      return null;
    }
  }

  async searchMulti(title: string, year?: string): Promise<{tmdbId: number, type: 'movie' | 'tv'} | null> {
    try {
      if (!TMDB_CONFIG.API_KEY) {
        console.warn('TMDB API key not configured');
        return null;
      }

      const cacheKey = `multi_${title}_${year || ''}`;
      const cachedResult = this.cache.get(cacheKey);
      if (cachedResult) {
        // For multi search, we need to determine the type from cache or make another call
        // For simplicity, we'll just return the ID and default to movie
        return { tmdbId: cachedResult, type: 'movie' };
      }

      const cleanedTitle = this.cleanTitle(title);
      const params: any = {
        api_key: TMDB_CONFIG.API_KEY,
        query: cleanedTitle,
        language: 'en-US',
        page: 1,
      };

      const response = await axios.get<TMDBResponse>(`${TMDB_CONFIG.BASE_URL}/search/multi`, { 
        params,
        timeout: 5000 // 5 second timeout
      });
      
      if (response.data.results && response.data.results.length > 0) {
        let bestMatch = response.data.results[0];
        
        // Filter by year if provided
        if (year) {
          const yearMatches = response.data.results.filter(result => {
            const resultYear = result.release_date?.split('-')[0] || result.first_air_date?.split('-')[0];
            return resultYear === year;
          });
          if (yearMatches.length > 0) {
            bestMatch = yearMatches[0];
          }
        }

        const type = bestMatch.media_type === 'tv' ? 'tv' : 'movie';
        this.cache.set(cacheKey, bestMatch.id);
        return { tmdbId: bestMatch.id, type };
      }
      
      return null;
    } catch (error) {
      console.error('Error searching TMDB multi:', title, error);
      return null;
    }
  }

  // Clear cache method (useful for memory management)
  clearCache(): void {
    this.cache.clear();
  }

  // Get cache size (for monitoring)
  getCacheSize(): number {
    return this.cache.size;
  }
}
