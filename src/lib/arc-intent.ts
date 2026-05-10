export type ArcOperation =
  | "swap"
  | "bridge"
  | "send"
  | "balance"
  | "explorer";

export type ArcExplorerQuery =
  | "overview"
  | "totalTransactions"
  | "recentTransactions"
  | "tokenHoldings"
  | "transactionStatus";

export type ArcChainKey =
  | "Arc_Testnet"
  | "Ethereum_Sepolia"
  | "Base_Sepolia"
  | "Arbitrum_Sepolia";

export type ArcIntent = {
  operation: ArcOperation;
  explorerQuery?: ArcExplorerQuery;
  amount?: string;
  token?: string;
  tokenIn?: string;
  tokenOut?: string;
  fromChain?: ArcChainKey;
  toChain?: ArcChainKey;
  recipient?: string;
  address?: string;
  txHash?: string;
  rawMessage: string;
};

const ADDRESS_PATTERN = /0x[a-fA-F0-9]{40}/;
const TX_HASH_PATTERN = /0x[a-fA-F0-9]{64}/;
const AMOUNT_TOKEN_PATTERN = /(\d*\.?\d+)\s+([a-zA-Z]{2,10})/;
const SWAP_PATTERN =
  /(?:swap|convert|exchange)\s+(\d*\.?\d+)\s+([a-zA-Z]{2,10})\s+(?:to|into|for)\s+([a-zA-Z]{2,10})/i;

export function parseArcIntent(message: string): ArcIntent {
  const normalizedMessage = message.replace(/\s+/g, " ").trim();
  const lowerMessage = normalizedMessage.toLowerCase();
  const recipient = normalizedMessage.match(ADDRESS_PATTERN)?.[0];
  const txHash = normalizedMessage.match(TX_HASH_PATTERN)?.[0];
  const fromChain = resolveDirectionalChain(lowerMessage, "from");
  const toChain = resolveDirectionalChain(lowerMessage, "to");

  if (isExplorerIntent(lowerMessage, txHash)) {
    return {
      operation: "explorer",
      explorerQuery: resolveExplorerQuery(lowerMessage, txHash),
      address: recipient,
      txHash,
      fromChain: "Arc_Testnet",
      rawMessage: normalizedMessage,
    };
  }

  if (lowerMessage.includes("balance")) {
    return {
      operation: "balance",
      token: resolveBalanceToken(normalizedMessage),
      fromChain: fromChain ?? resolveStandaloneChain(lowerMessage),
      rawMessage: normalizedMessage,
    };
  }

  if (lowerMessage.includes("bridge")) {
    const transfer = normalizedMessage.match(AMOUNT_TOKEN_PATTERN);

    return {
      operation: "bridge",
      amount: transfer?.[1],
      token: transfer?.[2]?.toUpperCase() ?? "USDC",
      fromChain: fromChain ?? "Arc_Testnet",
      toChain:
        toChain ?? resolveStandaloneChain(lowerMessage) ?? "Ethereum_Sepolia",
      rawMessage: normalizedMessage,
    };
  }

  if (lowerMessage.includes("send") || lowerMessage.includes("transfer")) {
    const transfer = normalizedMessage.match(AMOUNT_TOKEN_PATTERN);

    return {
      operation: "send",
      amount: transfer?.[1],
      token: transfer?.[2]?.toUpperCase() ?? "USDC",
      recipient,
      fromChain:
        fromChain ?? resolveStandaloneChain(lowerMessage) ?? "Arc_Testnet",
      rawMessage: normalizedMessage,
    };
  }

  const swapMatch = normalizedMessage.match(SWAP_PATTERN);

  return {
    operation: "swap",
    amount: swapMatch?.[1],
    tokenIn: swapMatch?.[2]?.toUpperCase(),
    tokenOut: swapMatch?.[3]?.toUpperCase(),
    fromChain: "Arc_Testnet",
    recipient,
    rawMessage: normalizedMessage,
  };
}

function isExplorerIntent(message: string, txHash?: string) {
  if (txHash && /(tx|transaction|status|check|lookup|explorer)/i.test(message)) {
    return true;
  }

  return [
    "total transaction",
    "total tx",
    "transaction count",
    "recent transaction",
    "latest transaction",
    "recent tx",
    "latest tx",
    "wallet overview",
    "wallet summary",
    "address overview",
    "token holding",
    "token holdings",
    "wallet tokens",
    "portfolio",
    "explorer",
    "activity",
    "history",
    "mera total transaction",
    "mere total transaction",
    "kitna transaction",
    "kitni transaction",
  ].some((keyword) => message.includes(keyword));
}

function resolveExplorerQuery(
  message: string,
  txHash?: string,
): ArcExplorerQuery {
  if (txHash) {
    return "transactionStatus";
  }

  if (
    message.includes("total transaction") ||
    message.includes("total tx") ||
    message.includes("transaction count") ||
    message.includes("mera total transaction") ||
    message.includes("mere total transaction") ||
    message.includes("kitna transaction") ||
    message.includes("kitni transaction")
  ) {
    return "totalTransactions";
  }

  if (
    message.includes("token holding") ||
    message.includes("token holdings") ||
    message.includes("wallet tokens") ||
    message.includes("portfolio")
  ) {
    return "tokenHoldings";
  }

  if (
    message.includes("recent transaction") ||
    message.includes("latest transaction") ||
    message.includes("recent tx") ||
    message.includes("latest tx") ||
    message.includes("activity") ||
    message.includes("history")
  ) {
    return "recentTransactions";
  }

  return "overview";
}

function resolveBalanceToken(message: string) {
  const explicitMatch = message.match(
    /(?:my|show|check|what is my)\s+([a-zA-Z]{2,10})\s+balance/i,
  );

  return explicitMatch?.[1]?.toUpperCase() ?? "USDC";
}

function resolveStandaloneChain(message: string): ArcChainKey | undefined {
  if (message.includes("arc")) {
    return "Arc_Testnet";
  }

  if (message.includes("ethereum")) {
    return "Ethereum_Sepolia";
  }

  if (message.includes("base")) {
    return "Base_Sepolia";
  }

  if (message.includes("arbitrum") || message.includes("arb")) {
    return "Arbitrum_Sepolia";
  }

  return undefined;
}

function resolveDirectionalChain(
  message: string,
  direction: "from" | "to",
): ArcChainKey | undefined {
  const pattern = new RegExp(`${direction}\\s+(arc|ethereum|base|arbitrum|arb)`, "i");
  const match = message.match(pattern)?.[1]?.toLowerCase();

  if (!match) {
    return undefined;
  }

  if (match === "arc") {
    return "Arc_Testnet";
  }

  if (match === "ethereum") {
    return "Ethereum_Sepolia";
  }

  if (match === "base") {
    return "Base_Sepolia";
  }

  return "Arbitrum_Sepolia";
}
