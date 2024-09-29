# To start using the example repo

To use the repo, you need to provide the following to the env file.

- SUPABASE_URL
- SUPABASE_KEY
- CONFLUXRPC_URL

Add the schema of the data into your supabase (which uses PostgreSQL) to allow the events to be inserted into your database. Below is an example that records increase the mint event

```javascript
CREATE TABLE lp_positions (
  transactionHash VARCHAR(66) PRIMARY KEY,
  owner VARCHAR(42) NOT NULL,
  sender VARCHAR(42) NOT NULL,
  tickLower INT NOT NULL,
  tickUpper INT NOT NULL,
  liquidity DECIMAL(38, 18) NOT NULL,
  amount0 DECIMAL(38, 18) NOT NULL,
  amount1 DECIMAL(38, 18) NOT NULL,
  timestamp TIMESTAMP NOT NULL
);
```

# Reading Events & Logs on Block Explorer

This guide will help you understand how to read events on a block explorer for your Conflux App project by setting up a backend database on supabase.

While all the data is on the blockchain, the advantages of storing blockchain data (and making an additional copy of certain events) in a web2 server is quicker retrieval of data. 

Let's use this transaction hash and the event log as example. [Example Event Logs](https://evmtestnet.confluxscan.io/tx/0xf2485b451b4dafe79542da7eef666c6710921e1e9c51a041bffea65492b32fcc?tab=logs)

In this transaction hash, multiple contracts emit events during this transaction.

- The first log is a transfer on the USDC faucet contract address. The event shows that USDC has moved from one address to another.

- To query this particular event for the USDC contract, we need to specify the event signature below, and the contract address. 

```javascript
const transferTopic = ethers.id("Transfer(address,address,uint256)");
  const transferTokenFilter = {
    address: usdcContractAddress,
    fromBlock,
    toBlock,
    topics: [transferTopic],
  };
  const logs = await provider.getLogs(transferTokenFilter);
```

- Here, we are querying the blockchain explorer based on contract address, block range, and by the event signature. 

- In the id function, we are hashing the function and the types of the events in the transfer function. Note that at maximum, there are three indexed fields. In this case, the first being the event signature (which is the hash of "Transfer(address,address,uint256)", the second being the address from, and third being the address to).

- What is important to note is that the first array of the log is always the event signature hash. 

- To access the indexed paramaters, you can slice off the first element to obtain the remaining indexed data. If we were to use logs as the object retrieved, assuming there are multiple events in the block range.

```javascript
 for (const log of logs) {
    const from = log.topics[1];
    const to = log.topics[2];
    const fromAddress = ethers.getAddress("0x" + from.slice(26));
    const toAddress = ethers.getAddress("0x" + to.slice(26));
    console.log(`There has been a transfer of USDC from ${fromAddress} to ${toAddress})
    }
```

or

```javascript
for (const log of logs) {
    const [from, to] = log.topics.slice(1);
    const fromAddress = ethers.getAddress("0x" + from.slice(26));
    const toAddress = ethers.getAddress("0x" + to.slice(26));
    console.log(`There has been a transfer of USDC from ${fromAddress} to ${toAddress})
}
```

- Since the number o USDC tokens is not indexed, to extract the value, we would need to decode the data field. The data field of USDC is "uint256" and we need to specify that is what we are decoding for.

```javascript
    const abiCoder = new ethers.AbiCoder();
    const [value] = abiCoder.decode(["uint256"],log.data);
```

## Using the Script to Fetch Events

Here is an example of how to use script to fetch events and the breakdown of the code.

### Script Breakdown

1. **Environment Setup**: 
   - `require("dotenv").config();` loads environment variables from a `.env` file. This is where I place the following environmental variables. (1) The Supabase URL, (2) The Supabase Key and (3) The RPC URL where you can append the API key for higher rate limits to read the Conflux blockchain. You do not need to pay to get a higher rate limit for the testnet - however you do need to obtain an API key. [Network Endpoints](https://doc.confluxnetwork.org/docs/espace/network-endpoints)
   - `const { ethers } = require("ethers");` and `const { createClient } = require("@supabase/supabase-js");` import necessary libraries. In this case, the ethers library is used to read the events, extract event signatures, decode data and format numbers. There are numerous emitted per various contracts (i.e. pool address, and the non-fungible position manager) and the supabase is used to create a connection so that data can be inserted into its SQL server.

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
const provider = new ethers.JsonRpcProvider(process.env.CONFLUXRPC_URL);
```

2. **Fetching Events**: 

- To formulate the event signature, check the ABI of the contract compiled. For example, if the ABI for the mint function was the following:

```javascript
  {
      anonymous: false,
      inputs: [
        {
          indexed: true,
          internalType: "address",
          name: "sender",
          type: "address",
        },
        {
          indexed: true,
          internalType: "address",
          name: "owner",
          type: "address",
        },
        {
          indexed: true,
          internalType: "int24",
          name: "tickLower",
          type: "int24",
        },
        {
          indexed: true,
          internalType: "int24",
          name: "tickUpper",
          type: "int24",
        },
        {
          indexed: false,
          internalType: "uint128",
          name: "amount",
          type: "uint128",
        },
        {
          indexed: false,
          internalType: "uint256",
          name: "amount0",
          type: "uint256",
        },
        {
          indexed: false,
          internalType: "uint256",
          name: "amount1",
          type: "uint256",
        },
      ],
      name: "Mint",
      type: "event",
    },
```

- We can interpret that the "Mint" is an "event" 
- The following is extracted from the ABI: sender (address), owner (address), tickLower (int24), tickUpper (int24), amount (uint128), amount0 (uint256) and amount1 (uin256)
- To get the event signature, note that no spaces are allowed and we do not include the names. Just the types. Lastly, while sender is indexed, this is not going to be seen in topics[0] as the sender will be replaced by the event signature. The sender address can be retrieved from the data.

```javascript
    const mintTopic = ethers.id(
        "Mint(address,address,int24,int24,uint128,uint256,uint256)"
    );
```

- Below is an example of how to fetch the indexed events and data events for a mint event. In each case, we are formatting the data based on the ABI.

```javascript
const fetchLiquidityEvents = async (fromBlock, toBlock) => {

    // we first get the event signature for the mintTopic which reflects what is in the ABI for what is emitted in the event when the Mint function is used 
    const mintTopic = ethers.id(
        "Mint(address,address,int24,int24,uint128,uint256,uint256)"
    );
    
    // the filter then isolates where we are finding the event signature (the contract address) and the blocks we are searching for the event signature occuring

    const mintfilter = {
        address: poolContractAddress,
        fromBlock: fromBlock,
        toBlock: toBlock,
        topics: [mintTopic],
    };

    // we now use our provider to get the logs using ethers library and the getLogs function

    try {
        const logsMint = await provider.getLogs(filterMint);

        // for each of the Mint functions emitting events, we extract the owner, tickLower and tickUpper (excluding the first topic which is the event signature)

        for (const log of logsMint) {
            const [ownerTopic, tickLowerTopic, tickUpperTopic] = log.topics.slice(1);

            // We format the destructured array variables based on the ABI. 
            // For example, we know tickLower and tickUpper are int24
            const owner = ethers.getAddress("0x" + ownerTopic.slice(26));
            const tickLower = ethers.AbiCoder.defaultAbiCoder().decode(["int24"], tickLowerTopic)[0];
            const tickUpper = ethers.AbiCoder.defaultAbiCoder().decode(["int24"], tickUpperTopic)[0];

            // For the remaining being decoded, we search the data field instead of the indexed topics
            const abiCoder = new ethers.AbiCoder();
            const [sender, amount, amount0, amount1] = abiCoder.decode(
                ["address", "uint128", "uint256", "uint256"],
                log.data
            );

            // below is an example of what we may want to store into supabase

            console.log("Mint event detected:", {
                sender,
                owner,
                tickLower: tickLower.toString(),
                tickUpper: tickUpper.toString(),
                amount: ethers.formatUnits(amount,18),
                amount0: ethers.formatUnits(amount0,18),
                amount1: ethers.formatUnits(amount1,18),
            });

```
3. **Adding to Database**: 

- in order to insert into supabase, we need to create the table. Similar to databases, we need to specify the type for each database column and create a schema.

```javascript
CREATE TABLE lp_positions (
  position_id TEXT PRIMARY KEY,  -- This will store the transaction hash (event.transactionHash)
  owner TEXT NOT NULL,           -- The owner address
  sender TEXT NOT NULL,          -- The sender address 
  tick_lower INTEGER NOT NULL,   -- The lower tick boundary
  tick_upper INTEGER NOT NULL,   -- The upper tick boundary
  liquidity NUMERIC NOT NULL,    -- The amount of liquidity added
  amount0 NUMERIC NOT NULL,      -- The amount of token0 added
  amount1 NUMERIC NOT NULL,      -- The amount of token1 added
  timestamp TIMESTAMP NOT NULL   -- The timestamp of the event
);
```

- Once the table is created, we can add the following into the script so that we can insert it directly to the table "lp_positions"

```javascript

const { data: insertedData, error } = await supabase.from("lp_positions").insert([
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
```

4. **Other**: 
   - To get the current block, you can query the provider

```javascript
    const block = await provider.getBlock(log.blockNumber);
    const timestamp = new Date(block.timestamp * 1000).toISOString();
```

- the block retrieves the most current block that can be used in the filters that are used in the getLogs 
- pick the number of blocks to start extracting data in specifying the "from" block (i.e. how many blocks ago from current block. Instead of starting from genesis, can match this with the interval of frequency in which events are fetched

9. **Application Start**: 
   - `setInterval(fetchEvents, 60000);` sets an interval to fetch events every 1 minute or the interval you desire to capture the block range specified

