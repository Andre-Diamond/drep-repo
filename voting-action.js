require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Read config file
const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
const drepId = config.drepId;
const organizationName = config.organizationName;

if (!drepId) {
    console.error('DRep ID not found in config.json');
    process.exit(1);
}

if (!organizationName) {
    console.error('Organization name not found in config.json');
    process.exit(1);
}

// Create voting-history directory if it doesn't exist
const votingHistoryDir = path.join(__dirname, 'voting-history');
if (!fs.existsSync(votingHistoryDir)) {
    fs.mkdirSync(votingHistoryDir, { recursive: true });
}

async function fetchMetadata(metaUrl) {
    try {
        const response = await axios.get(metaUrl);
        return response.data;
    } catch (error) {
        console.error(`Error fetching metadata from ${metaUrl}:`, error.message);
        return null;
    }
}

async function getProposalDetails(drepId) {
    try {
        const apiKey = process.env.KOIOS_API_KEY;
        if (!apiKey) {
            throw new Error('KOIOS_API_KEY environment variable is not set');
        }

        const response = await axios.get(`https://api.koios.rest/api/v1/voter_proposal_list?_voter_id=${drepId}`, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'accept': 'application/json'
            }
        });

        if (!Array.isArray(response.data)) {
            throw new Error('Invalid response format: expected an array');
        }

        console.log(`Found ${response.data.length} proposals in voter_proposal_list`);

        // Create a map of proposal details by proposal_id
        const proposalMap = response.data.reduce((acc, proposal) => {
            if (!proposal.proposal_id) {
                console.warn('Found proposal without proposal_id, skipping');
                return acc;
            }
            acc[proposal.proposal_id] = proposal;
            return acc;
        }, {});

        console.log(`Successfully mapped ${Object.keys(proposalMap).length} proposals`);
        return proposalMap;
    } catch (error) {
        console.error('Error fetching proposal details:', error.message);
        if (error.response) {
            console.error('API Response:', error.response.data);
        }
        return {};
    }
}

function generateMarkdown(vote, proposalDetails, metadata) {
    const voteEmoji = vote.vote === 'Yes' ? '✅' : vote.vote === 'No' ? '❌' : '⚪';
    const voteText = `${voteEmoji}${vote.vote}`;

    // Get proposal details
    const proposal = proposalDetails[vote.proposalId] || {};

    // Extract proposal title from proposal details first, then fallback to metadata
    const proposalTitle = proposal.meta_json?.body?.title || 'Unknown Proposal';

    // Format dates
    const submittedDate = vote.blockTime ? new Date(vote.blockTime).toLocaleDateString() : 'N/A';
    const proposedEpoch = proposal.proposed_epoch || 'N/A';
    const expirationEpoch = proposal.expiration || 'N/A';

    // Get proposal type
    const proposalType = proposal.proposal_type || 'Unknown';

    const markdown = `| ${organizationName}      | Cardano Governance Actions                                                                                                              |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Proposal Title | ${proposalTitle}                                                                                                   |
| Hash           | ${vote.metaHash || 'N/A'}                                                                      |
| Action ID      | ${vote.proposalId || 'N/A'}                                                                  |
| Type           | ${proposalType}                                                                                                                        |
| Proposed Epoch | ${proposedEpoch}                                                                                                                              |
| Expires Epoch  | ${expirationEpoch}                                                                                                                              |
| Vote           | ${voteText}                                                                                                                                   |
| Vote Submitted | ${submittedDate}                                                                                                                              |
| Rational       | ${metadata?.body?.comment || metadata?.body?.rationale || 'No rationale available'} |
|Link|https://adastat.net/transactions/${vote.proposalTxHash || 'N/A'}`;

    return markdown;
}

async function getDRepVotes(drepId) {
    try {
        const apiKey = process.env.KOIOS_API_KEY;
        if (!apiKey) {
            throw new Error('KOIOS_API_KEY environment variable is not set');
        }

        // Fetch proposal details first
        const proposalDetails = await getProposalDetails(drepId);

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
        for (const vote of response.data) {
            // Validate required fields
            if (!vote.proposal_id || !vote.vote || !vote.block_time) {
                console.error('Invalid vote data: missing required fields');
                continue;
            }

            // Validate vote enum value
            const validVotes = ['Yes', 'No', 'Abstain'];
            if (!validVotes.includes(vote.vote)) {
                console.error(`Invalid vote value: ${vote.vote}. Must be one of: ${validVotes.join(', ')}`);
                continue;
            }

            const processedVote = {
                proposalId: vote.proposal_id,
                proposalTxHash: vote.proposal_tx_hash,
                proposalIndex: vote.proposal_index,
                voteTxHash: vote.vote_tx_hash,
                blockTime: new Date(vote.block_time * 1000).toISOString(),
                vote: vote.vote,
                metaUrl: vote.meta_url,
                metaHash: vote.meta_hash
            };

            // Fetch metadata if metaUrl is available
            let metadata = null;
            if (processedVote.metaUrl) {
                metadata = await fetchMetadata(processedVote.metaUrl);
            }

            // Generate markdown
            const markdown = generateMarkdown(processedVote, proposalDetails, metadata);

            // Save markdown file
            const fileName = `${processedVote.proposalId}.md`;
            const filePath = path.join(votingHistoryDir, fileName);
            fs.writeFileSync(filePath, markdown);
            console.log(`Generated markdown file: ${fileName}`);
        }

        console.log('All votes processed successfully');
    } catch (error) {
        console.error('Error fetching DRep votes:', error.message);
        if (error.response) {
            console.error('API Response:', error.response.data);
        }
        process.exit(1);
    }
}

getDRepVotes(drepId); 