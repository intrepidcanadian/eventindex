# Reading Events on Block Explorer

This guide will help you understand how to read events on a block explorer for your Conflux App project by setting up a backend database on supabase.

The advantages of storing blockchain data in a web2 server is quicker retrieval of data. While all the data is on the blockchain explorer, there are many events emitted and querying the blockchain data without a node can require many API calls to search and filter.

What is important to note is that the first array of the log is always the event signature hash (i.e. log.topics[0]). To access the indexed paramaters, you can slice off the first element to obtain the remaining indexed data. If the data is not indexed (can check the ABI to see which data is indexed), then they would be in the data field. 

For example, the below would be for the Mint function of a Defi App:

- log.topics[0] - Event signature hash
- log.topics[1] - sender (indexed address)
- log.topics[2] - owner (indexed address)
- log.topics[3] - tickLower (indexed int24)
- log.topics[4] - tickUpper (indexed int24)

With the remaining 3 non-indexed data in the data field (can check the ABI name to see what they are), in which case, this repo would have them representing amount, amount0, and amount1. To extract this information, you would need to decode it.

## Using the Script to Fetch Events

Here is an example of how to use script to fetch events and the breakdown of the code.

### Script Breakdown

1. **Environment Setup**: 
   - `require("dotenv").config();` loads environment variables from a `.env` file. This is where I place the following environmental variables. (1) The Supabase URL, (2) The Supabase Key and (3) The RPC URL where you can append the API key for higher rate limits. You do not need to pay to get a higher rate limit for the testnet - however you do need to obtain an API key. [Network Endpoints](https://doc.confluxnetwork.org/docs/espace/network-endpoints)
   - `const { ethers } = require("ethers");` and `const { createClient } = require("@supabase/supabase-js");` import necessary libraries. In this case, ethers is used to read the events (and set up the contract instances) and the supabase is used to create a connection with supabase. Think of supabase as essentially a SQL server.

```javascript
require("dotenv").config();
const { ethers } = require("ethers");
const { createClient } = require("@supabase/supabase-js");

// Initialize Supabase client
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

// Initialize Ethereum provider
const provider = new ethers.JsonRpcProvider(process.env.CONFLUXSCAN_URL);

// Initialize contracts
const poolContract = new ethers.Contract(poolContractAddress, poolABI, provider);
const nfpmContract = new ethers.Contract(
    nonFungiblePositionManagerContractAddress,
    nfpmABI,
    provider
);

// This is a helper function to decode int24 values
function decodeInt24(hexString) {
    let value = BigInt(hexString);
    value = value & BigInt(0xffffff);
    if (value > BigInt(0x7fffff)) {
        value -= BigInt(0x1000000);
    }
    return Number(value);
}

```

// Function to fetch transfer events
// The filter consists of the contract you want to get the logs from, the block range you want to grab logs, and the event topic
// the event topic consists of the function name and the outputs expected
// for example, for transfer, the abi will show the following:

```javascript
{
    anonymous: false,
    inputs: [
        {
            indexed: true,
            internalType: "address",
            name: "from",
            type: "address",
        },
        {
            indexed: true,
            internalType: "address",
            name: "to",
            type: "address",
        },
        {
            indexed: true,
            internalType: "uint256",
            name: "tokenId",
            type: "uint256",
        },
    ],
    name: "Transfer",
    type: "event",
}
```

const fetchTransferEvents = async (fromBlock, toBlock) => {
    const transferTopic = ethers.id("Transfer(address,address,uint256)");
    const filter = {
        address: nfpmcontract,
        fromBlock,
        toBlock,
        topics: [transferTopic],
    };

    const logs = await provider.getLogs(filter);
    for (const log of logs) {
        const [fromTopic, toTopic, tokenIdTopic] = log.topics.slice(1);
        const from = ethers.getAddress("0x" + fromTopic.slice(26));
        const to = ethers.getAddress("0x" + toTopic.slice(26));
        const tokenId = BigInt(tokenIdTopic).toString();

        console.log(`Transfer detected: TokenID ${tokenId} from ${from} to ${to}`);

        await supabase
            .from("lp_positions")
            .update({ owner: to })
            .eq("position_id", tokenId);
    }
};

// Function to fetch liquidity events
const fetchLiquidityEvents = async (fromBlock, toBlock) => {
    console.log("Fetching liquidity events...");
    const mintTopic = ethers.id(
        "Mint(address,address,int24,int24,uint128,uint256,uint256)"
    );
    const burnTopic = ethers.id(
        "Burn(address,int24,int24,uint128,uint256,uint256)"
    );
    const increaseLiquidityTopic = ethers.id(
        "IncreaseLiquidity(uint256,uint128,uint256,uint256)"
    );
    const decreaseLiquidityTopic = ethers.id(
        "DecreaseLiquidity(uint256,uint128,uint256,uint256)"
    );

    const mintfilter = {
        address: poolContractAddress,
        fromBlock: fromBlock,
        toBlock: toBlock,
        topics: [mintTopic],
    };

    const burnfilter = {
        address: poolContractAddress,
        fromBlock: fromBlock,
        toBlock: toBlock,
        topics: [burnTopic],
    };

    const filterIncreaseLiquidity = {
        address: nfpmcontract,
        fromBlock: fromBlock,
        toBlock: toBlock,
        topics: [increaseLiquidityTopic],
    };

    const filterDecreaseLiquidity = {
        address: nfpmcontract,
        fromBlock: fromBlock,
        toBlock: toBlock,
        topics: [decreaseLiquidityTopic],
    };

    try {
        const logsMint = await provider.getLogs(filterMint);
        const logsBurn = await provider.getLogs(filterBurn);
        const logsIncreaseLiquidity = await provider.getLogs(filterIncreaseLiquidity);
        const logsDecreaseLiquidity = await provider.getLogs(filterDecreaseLiquidity);

        console.log(`Found ${logsMint.length} for mint logs`);

        for (const log of logsMint) {
            const [ownerTopic, tickLowerTopic, tickUpperTopic] = log.topics.slice(1);

            const owner = ethers.getAddress("0x" + ownerTopic.slice(26));
            const tickLower = decodeInt24(tickLowerTopic);
            const tickUpper = decodeInt24(tickUpperTopic);

            console.log(owner, tickLower.toString(), tickUpper.toString());

            const abiCoder = new ethers.AbiCoder();
            const [sender, amount, amount0, amount1] = abiCoder.decode(
                ["address", "uint128", "uint256", "uint256"],
                log.data
            );

            console.log(amount.toString(), amount0.toString(), amount1.toString());

            const block = await provider.getBlock(log.blockNumber);

            console.log("Mint event detected:", {
                sender,
                owner,
                tickLower: tickLower.toString(),
                tickUpper: tickUpper.toString(),
                amount: amount.toString(),
                amount0: amount0.toString(),
                amount1: amount1.toString(),
                transactionHash: log.transactionHash,
                timestamp: new Date(block.timestamp * 1000).toISOString(),
            });

            const { data: insertedData, error } = await supabase
                .from("lp_positions")
                .insert([
                    {
                        position_id: log.transactionHash,
                        sender: sender,
                        owner: owner,
                        tick_lower: tickLower.toString(),
                        tick_upper: tickUpper.toString(),
                        liquidity: amount.toString(),
                        amount0: amount0.toString(),
                        amount1: amount1.toString(),
                        timestamp: new Date(block.timestamp * 1000),
                    },
                ]);

            if (error) {
                console.error("Error inserting data into Supabase:", error);
            } else {
                console.log("Data inserted into Supabase:", insertedData);
            }
        }
    } catch (error) {
        console.error("Error fetching logs:", error);
    }
};

// Function to fetch all events
const fetchEvents = async () => {
    try {
        console.log("Fetching events...");
        const latestBlock = await provider.getBlockNumber();
        const fromBlock = latestBlock - 500;

        console.log(
            `Fetching data from latest block: ${latestBlock} to ${fromBlock}`
        );

        await fetchTransferEvents(fromBlock, latestBlock);
        await fetchLiquidityEvents(fromBlock, latestBlock);
    } catch (error) {
        console.error("Error fetching events:", error);
    }
};

// Start the application and set interval to fetch events every 2 minutes
console.log("Starting application...");
setInterval(fetchEvents, 120000);
console.log("Application started. Fetching Mint events every 2 minutes.");
```


2. **Supabase Client Initialization**: 
   - `const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);` initializes the Supabase client using environment variables.

3. **Ethereum Provider Initialization**: 
   - `const provider = new ethers.JsonRpcProvider(process.env.CONFLUXSCAN_URL);` initializes the Ethereum provider.

4. **Contract Initialization**: 
   - `const contract = new ethers.Contract(poolContractAddress, poolABI, provider);` and `const nfpmcontract = new ethers.Contract(nonFungiblePositionManagerContractAddress, nfpmABI, provider);` initialize the contracts.

5. **Helper Function**: 
   - `function decodeInt24(hexString) { ... }` decodes `int24` values from hexadecimal strings.

6. **Fetch Transfer Events**: 
   - `const fetchTransferEvents = async (fromBlock, toBlock) => { ... }` fetches and processes transfer events.

7. **Fetch Liquidity Events**: 
   - `const fetchLiquidityEvents = async (fromBlock, toBlock) => { ... }` fetches and processes liquidity events.

8. **Fetch All Events**: 
   - `const fetchEvents = async () => { ... }` fetches both transfer and liquidity events.

9. **Application Start**: 
   - `setInterval(fetchEvents, 120000);` sets an interval to fetch events every 2 minutes.

