import { Request, Response } from "express";
import { EpisodeServerResponse } from "../types/controllers/movieEpisodeSources";
import { USER_AGENT_HEADER, ACCEPT_ENCODING_HEADER, ACCEPT_HEADER } from "../config/axois";
import axios from "axios";

// GET /movie/:id/sources?serverId=string&episodeId=string
export default async function (req: any, res: Response) {
    try {
        const { serverId, episodeId } = req.query;
        const { id: movieId } = req.params;
        
        if (!serverId) {
            return res.status(400).json({ 
                success: false, 
                error: 'Server ID is required' 
            });
        }

        // Get the iframe link from FlixHQ
        const sourcesResponse = await axios.get(
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

        let serverName = "Unknown Server";
        let episodeName = "Unknown Episode";
        let episodeNumber = null;

        // Try to get server name and episode info if episodeId is provided
        if (episodeId && movieId) {
            try {
                // Get available servers to find server name
                const serversResponse = await axios.get(
                    `https://flixhq-tv.lol/ajax/episode/servers/${episodeId}`,
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

                // Find the server name by matching serverId
                if (serversResponse.data && serversResponse.data.html) {
                    const serverMatch = serversResponse.data.html.match(
                        new RegExp(`data-id="${serverId}"[^>]*>([^<]+)<`, 'i')
                    );
                    if (serverMatch) {
                        serverName = serverMatch[1].trim();
                    }
                }

                // Get episode information
                const episodeInfoResponse = await axios.get(
                    `https://flixhq-tv.lol/ajax/episode/info/${episodeId}`,
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

                if (episodeInfoResponse.data) {
                    episodeName = episodeInfoResponse.data.title || episodeName;
                    episodeNumber = episodeInfoResponse.data.number || episodeInfoResponse.data.episode;
                }

            } catch (serverError) {
                console.log('Could not fetch server/episode info:', serverError.message);
            }
        }

        // Return enhanced response with server and episode info
        res.json({
            ...sourcesResponse.data,
            server: {
                id: serverId,
                name: serverName
            },
            episode: {
                id: episodeId || null,
                name: episodeName,
                number: episodeNumber
            },
            movieId: movieId
        });

    } catch (error) {
        console.error('Error fetching sources:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch video sources'
        });
    }
}
