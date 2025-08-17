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

        // Simply fetch from FlixHQ API and return the result
        const flixhqResponse = await axios.get(
            `https://flixhq-tv.lol/ajax/episode/sources/${serverId}`,
            {
                headers: {
                    "User-Agent": USER_AGENT_HEADER,
                    "Accept-Encoding": ACCEPT_ENCODING_HEADER,
                    "Accept": HEADER,
                    "Referer": "https://flixhq-tv.lol/",
                    "X-Requested-With": "XMLHttpRequest"
                }
            }
        );

        // Add _debug=true to the iframe link (replace existing query params)
        const responseData = { ...flixhqResponse.data };
        if (responseData.link) {
            // Remove existing query parameters and add only _debug=true
            const baseUrl = responseData.link.split('?')[0];
            responseData.link = `${baseUrl}?_debug=true`;
        }

        // Return the modified response
        res.json(responseData);

    } catch (error) {
        console.error('Error fetching sources:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch video sources'
        });
    }
}
