require('dotenv').config();
const axios = require('axios');
const fs = require('fs');

// Read config file
const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
const drepId = config.drepId;

if (!drepId) {
    console.error('DRep ID not found in config.json');
    process.exit(1);
}

async function getDRepVotes(drepId) {
    try {
        const apiKey = process.env.KOIOS_API_KEY;
        if (!apiKey) {
            throw new Error('KOIOS_API_KEY environment variable is not set');
        }

        const response = await axios.get(`https://api.koios.rest/api/v1/drep_votes?_drep_id=${drepId}`, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'accept': 'application/json'
            }
        });

        // Validate response data
        if (!Array.isArray(response.data)) {
            throw new Error('Invalid response format: expected an array');
        }

        // Process and validate each vote
        const votes = response.data.map(vote => {
            // Validate required fields
            if (!vote.proposal_id || !vote.vote || !vote.block_time) {
                throw new Error('Invalid vote data: missing required fields');
            }

            // Validate vote enum value
            const validVotes = ['Yes', 'No', 'Abstain'];
            if (!validVotes.includes(vote.vote)) {
                throw new Error(`Invalid vote value: ${vote.vote}. Must be one of: ${validVotes.join(', ')}`);
            }

            return {
                proposalId: vote.proposal_id,
                proposalTxHash: vote.proposal_tx_hash,
                proposalIndex: vote.proposal_index,
                voteTxHash: vote.vote_tx_hash,
                blockTime: new Date(vote.block_time * 1000).toISOString(), // Convert UNIX timestamp to ISO string
                vote: vote.vote,
                metaUrl: vote.meta_url,
                metaHash: vote.meta_hash
            };
        });

        console.log('DRep Votes:', JSON.stringify(votes, null, 2));
        return votes;
    } catch (error) {
        console.error('Error fetching DRep votes:', error.message);
        if (error.response) {
            console.error('API Response:', error.response.data);
        }
        process.exit(1);
    }
}

getDRepVotes(drepId); 