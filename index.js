require("dotenv").config();
const { ethers } = require("ethers");
const { createClient } = require("@supabase/supabase-js");

const {
  poolContractAddress,
  nonFungiblePositionManagerContractAddress,
  usdcContractAddress,
  usdtContractAddress,
} = require("./constant/constant.js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const provider = new ethers.JsonRpcProvider(process.env.CONFLUXSCAN_URL);

const fetchTransferEvents = async (fromBlock, toBlock) => {
  const transferTopic = ethers.id("Transfer(address,address,uint256)");
  const filter = {
    address: nonFungiblePositionManagerContractAddress,
    fromBlock,
    toBlock,
    topics: [transferTopic],
  };

  const logs = await provider.getLogs(filter);
  if (logs.length > 0) {
    try {
      for (const log of logs) {
        const [fromTopic, toTopic, tokenIdTopic] = log.topics.slice(1);
        const from = ethers.getAddress("0x" + fromTopic.slice(26));
        const to = ethers.getAddress("0x" + toTopic.slice(26));
        const tokenId = BigInt(tokenIdTopic).toString();

        console.log(
          `Transfer detected: TokenID ${tokenId} from ${from} to ${to}`
        );

        const block = await provider.getBlock(log.blockNumber);
        const timestamp = new Date(block.timestamp * 1000).toISOString();

        const { data: insertedData, error } = await supabase
          .from("transfer")
          .insert([
            {
              token_id: tokenId,
              from_address: from,
              to_address: to,
              transaction_hash: log.transactionHash,
              timestamp: timestamp,
            },
          ]);
      }
    } catch (error) {
      console.error("Error fetching transfer logs:", error);
    }
  }
};


const fetchTransferTokenEventsAmount0 = async (fromBlock, toBlock) => {
  const transferTopic = ethers.id("Transfer(address,address,uint256)");
  const transferTokenFilter = {
    address: usdcContractAddress,
    fromBlock,
    toBlock,
    topics: [transferTopic],
  };
  const logs = await provider.getLogs(transferTokenFilter);

  for (const log of logs) {
    const from = log.topics[1];
    const to = log.topics[2];

    const abiCoder = new ethers.AbiCoder();
    const [value] = abiCoder.decode(["uint256"], log.data);

    const block = await provider.getBlock(log.blockNumber);
    const timestamp = new Date(block.timestamp * 1000).toISOString();

    const fromAddress = ethers.getAddress("0x" + from.slice(26));
    const toAddress = ethers.getAddress("0x" + to.slice(26));

    console.log(
      `USDC added to liquidity by ${fromAddress} to ${toAddress} with value ${ethers.formatUnits(
        value,
        18
      )}`
    );

    console.log("Tokens transferred to liquidity detected:", {
      from: fromAddress,
      to: toAddress,
      value: ethers.formatUnits(value, 18),
      transactionHash: log.transactionHash,
      timestamp: timestamp,
    });
  }
};

const fetchTransferTokenEventsAmount1 = async (fromBlock, toBlock) => {
  const transferTopic = ethers.id("Transfer(address,address,uint256)");
  const transferTokenFilter = {
    address: usdtContractAddress,
    fromBlock,
    toBlock,
    topics: [transferTopic],
  };

  const logs = await provider.getLogs(transferTokenFilter);

  for (const log of logs) {
    const from = log.topics[1];
    const to = log.topics[2];

    const fromAddress = ethers.getAddress("0x" + from.slice(26));
    const toAddress = ethers.getAddress("0x" + to.slice(26));

    const abiCoder = new ethers.AbiCoder();
    const [value] = abiCoder.decode(["uint256"], log.data);

    const block = await provider.getBlock(log.blockNumber);
    const timestamp = new Date(block.timestamp * 1000).toISOString();

    console.log(
      `USDT added to liquidity by ${fromAddress} to ${toAddress} with value ${ethers.formatUnits(
        value,
        18
      )}`
    );

    console.log("Tokens transferred to liquidity detected:", {
      from: fromAddress,
      to: toAddress,
      value: ethers.formatUnits(value, 18),
      transactionHash: log.transactionHash,
      timestamp: timestamp,
    });
  }
};

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
  const swapTopic = ethers.id(
    "Swap(address,address,int256,int256,uint160,uint128,int24)"
  );

  const filterMint = {
    address: poolContractAddress,
    fromBlock: fromBlock,
    toBlock: toBlock,
    topics: [mintTopic],
  };

  const filterBurn = {
    address: poolContractAddress,
    fromBlock: fromBlock,
    toBlock: toBlock,
    topics: [burnTopic],
  };

  const filterIncreaseLiquidity = {
    address: nonFungiblePositionManagerContractAddress,
    fromBlock: fromBlock,
    toBlock: toBlock,
    topics: [increaseLiquidityTopic],
  };

  const filterDecreaseLiquidity = {
    address: nonFungiblePositionManagerContractAddress,
    fromBlock: fromBlock,
    toBlock: toBlock,
    topics: [decreaseLiquidityTopic],
  };

  const filterSwap = {
    address: poolContractAddress,
    fromBlock: fromBlock,
    toBlock: toBlock,
    topics: [swapTopic],
  };

  const logsMint = await provider.getLogs(filterMint);
  const logsIncreaseLiquidity = await provider.getLogs(filterIncreaseLiquidity);
  const logsSwap = await provider.getLogs(filterSwap);

  console.log(`Found ${logsMint.length} for mint logs`);
  console.log(`Found ${logsIncreaseLiquidity.length} for increase liquidity logs`);
  console.log(`Found ${logsSwap.length} for swap logs`);

  if (logsMint.length > 0) {
    try {
      for (const log of logsMint) {
        const [ownerTopic, tickLowerTopic, tickUpperTopic] =
          log.topics.slice(1);
        const owner = ethers.getAddress("0x" + ownerTopic.slice(26));

        const tickLower = ethers.AbiCoder.defaultAbiCoder().decode(["int24"], tickLowerTopic)[0];
        const tickUpper = ethers.AbiCoder.defaultAbiCoder().decode(["int24"], tickUpperTopic)[0];
  
        const abiCoder = new ethers.AbiCoder();
        const [sender, amount, amount0, amount1] = abiCoder.decode(
          ["address", "uint128", "uint256", "uint256"],
          log.data
        );

        const block = await provider.getBlock(log.blockNumber);

        console.log("Mint event detected:", {
          sender,
          owner,
          tickLower: tickLower.toString(),
          tickUpper: tickUpper.toString(),
          amount: ethers.formatUnits(amount, 18),
          amount0: ethers.formatUnits(amount0, 18),
          amount1: ethers.formatUnits(amount1, 18),
          transactionHash: log.transactionHash,
          timestamp: new Date(block.timestamp * 1000).toISOString(),
        });
      }
    } catch (error) {
      console.error("Error fetching mint logs:", error);
    }
  }

  if (logsSwap.length > 0) {
    try {
      for (const log of logsSwap) {
        const [senderTopic, recipientTopic] = log.topics.slice(1);
        const sender = ethers.getAddress("0x" + senderTopic.slice(26));
        const recipient = ethers.getAddress("0x" + recipientTopic.slice(26));
        const abiCoder = new ethers.AbiCoder();
        const [amount0, amount1, sqrtPriceX96, liquidity, tick] =
          abiCoder.decode(
            ["int256", "int256", "uint160", "uint128", "int24"],
            log.data
          );

        const block = await provider.getBlock(log.blockNumber);

        console.log("Swap event detected:", {
          sender,
          recipient,
          amount0: ethers.formatUnits(amount0, 18),
          amount1: ethers.formatUnits(amount1, 18),
          sqrtPriceX96: sqrtPriceX96.toString(),
          liquidity: ethers.formatUnits(liquidity,18),
          tick: tick.toString(),
          transactionHash: log.transactionHash,
          timestamp: new Date(block.timestamp * 1000).toISOString(),
        });
      }
    } catch (error) {
      console.error("Error fetching mint logs:", error);
    }
  }

if (logsIncreaseLiquidity.length > 0) {

  try {

    for (const log of logsIncreaseLiquidity)  {
      const [tokenIdTopic] = log.topics.slice(1);
      const tokenId = ethers.AbiCoder.defaultAbiCoder().decode(["uint256"], tokenIdTopic)[0];

      const abiCoder = new ethers.AbiCoder();

      const [liquidity, amount0, amount1] = abiCoder.decode(["uint128","uint256","uint256"], log.data);

      const block = await provider.getBlock(log.blockNumber);
      const timestamp = new Date(block.timestamp * 1000).toISOString();

      console.log("Increase liquidity event detected:", {
        tokenId: tokenId.toString(),
        liquidity: ethers.formatUnits(liquidity,18),
        amount0: ethers.formatUnits(amount0,18),
        amount1: ethers.formatUnits(amount1,18),
        transactionHash: log.transactionHash,
        timestamp: timestamp,
      });
    }
  } catch (error) {
    console.error("Error fetching increase liquidity logs:", error);
  }
}

};

const fetchEvents = async () => {
  try {
    console.log("Fetching events...");
    const latestBlock = await provider.getBlockNumber();
    const fromBlock = latestBlock - 500;

    console.log(
      `Fetching data from latest block: ${latestBlock} to ${fromBlock}`
    );

    await fetchTransferEvents(fromBlock, latestBlock);
    await fetchTransferTokenEventsAmount0(fromBlock, latestBlock);
    await fetchTransferTokenEventsAmount1(fromBlock, latestBlock);
    await fetchLiquidityEvents(fromBlock, latestBlock);
  } catch (error) {
    console.error("Error fetching events:", error);
  }
};

console.log("Starting application...");
setInterval(fetchEvents, 30000);
console.log("Application started. Fetching events every 30 seconds.");
