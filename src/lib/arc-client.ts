import { AppKit } from "@circle-fin/app-kit";
import {
  ArbitrumSepolia,
  ArcTestnet,
  BaseSepolia,
  EthereumSepolia,
} from "@circle-fin/app-kit/chains";
import { createViemAdapterFromProvider } from "@circle-fin/adapter-viem-v2";
import { erc20Abi, formatUnits, parseUnits } from "viem";
import type { EIP1193Provider } from "viem";

import type {
  ArcChainKey,
  ArcIntent,
} from "@/lib/arc-intent";

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
  }
}

type ArcExecutionResponse = {
  summary: string;
  details: Array<{ label: string; value: string }>;
};

const ARC_KIT_KEY = process.env.NEXT_PUBLIC_ARC_KIT_KEY;
const CIRCLE_API_BASE_URL = "https://api.circle.com";
const LOCAL_CIRCLE_PROXY_PATH = "/api/circle-proxy";

const chainMap = {
  Arc_Testnet: ArcTestnet,
  Ethereum_Sepolia: EthereumSepolia,
  Base_Sepolia: BaseSepolia,
  Arbitrum_Sepolia: ArbitrumSepolia,
} as const;

const chainLabelMap: Record<ArcChainKey, string> = {
  Arc_Testnet: "Arc Testnet",
  Ethereum_Sepolia: "Ethereum Sepolia",
  Base_Sepolia: "Base Sepolia",
  Arbitrum_Sepolia: "Arbitrum Sepolia",
};

export async function executeArcIntent(
  intent: ArcIntent,
): Promise<ArcExecutionResponse> {
  if (!window.ethereum) {
    throw new Error("No browser wallet provider found.");
  }

  const adapter = await createViemAdapterFromProvider({
    provider: window.ethereum,
    capabilities: {
      addressContext: "user-controlled",
      supportedChains: [
        ArcTestnet,
        EthereumSepolia,
        BaseSepolia,
        ArbitrumSepolia,
      ],
    },
  });

  const kit = new AppKit();

  switch (intent.operation) {
    case "balance":
      return getBalance(intent, adapter);
    case "explorer":
      return getExplorerData(intent, adapter);
    case "send":
      return sendFunds(intent, kit, adapter);
    case "bridge":
      return bridgeFunds(intent, kit, adapter);
    case "swap":
      try {
        return await withCircleProxy(() => swapFunds(intent, kit, adapter));
      } catch (error) {
        throw enrichSwapError(error);
      }
  }
}

async function getExplorerData(
  intent: ArcIntent,
  adapter: Awaited<ReturnType<typeof createViemAdapterFromProvider>>,
) {
  const chainKey = "Arc_Testnet";
  const chain = chainMap[chainKey];
  const address = intent.address ?? (await adapter.getAddress(chain));

  const response = await fetch("/api/explorer", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: intent.explorerQuery,
      address,
      txHash: intent.txHash,
    }),
  });

  if (!response.ok) {
    throw new Error("Explorer lookup failed. Please try again.");
  }

  return (await response.json()) as ArcExecutionResponse;
}

async function getBalance(
  intent: ArcIntent,
  adapter: Awaited<ReturnType<typeof createViemAdapterFromProvider>>,
) {
  const chainKey = intent.fromChain ?? "Arc_Testnet";
  const chain = chainMap[chainKey];
  const address = await adapter.getAddress(chain);
  const token = (intent.token ?? "USDC").toUpperCase();

  if (token === "NATIVE") {
    const balance = await adapter.readNativeBalance(address, chain);

    return {
      summary: `${chainLabelMap[chainKey]} wallet balance fetched.`,
      details: [
        { label: "Action", value: "Balance" },
        { label: "Chain", value: chainLabelMap[chainKey] },
        { label: "Token", value: chain.nativeCurrency.symbol },
        {
          label: "Balance",
          value: formatUnits(balance, chain.nativeCurrency.decimals),
        },
        { label: "Wallet", value: address },
      ],
    };
  }

  const tokenAddress = resolveTokenAddress(token, chain);
  const decimals = await adapter.getTokenDecimals(tokenAddress, chain);
  const balance = await adapter.readContract<bigint>(
    {
      address: tokenAddress,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address],
    },
    chain,
  );

  return {
    summary: `${token} balance fetched from ${chainLabelMap[chainKey]}.`,
    details: [
      { label: "Action", value: "Balance" },
      { label: "Chain", value: chainLabelMap[chainKey] },
      { label: "Token", value: token },
      { label: "Balance", value: formatUnits(balance, decimals) },
      { label: "Wallet", value: address },
    ],
  };
}

async function sendFunds(
  intent: ArcIntent,
  kit: AppKit,
  adapter: Awaited<ReturnType<typeof createViemAdapterFromProvider>>,
) {
  if (!intent.amount || !intent.recipient) {
    throw new Error("Send needs amount and recipient address.");
  }

  const chainKey = intent.fromChain ?? "Arc_Testnet";
  const token = (intent.token ?? "USDC").toUpperCase();
  const params = {
    from: { adapter, chain: chainKey },
    to: intent.recipient,
    amount: intent.amount,
    token,
  };

  const estimate = await kit.estimateSend(params);
  const result = await kit.send(params);
  const txHashes = collectTxHashes(result);

  return {
    summary: `Send executed from ${chainLabelMap[chainKey]}.`,
    details: [
      { label: "Action", value: "Send" },
      { label: "Chain", value: chainLabelMap[chainKey] },
      { label: "Amount", value: `${intent.amount} ${token}` },
      { label: "Recipient", value: intent.recipient },
      { label: "Estimate", value: safeJson(estimate) },
      { label: "State", value: readState(result) },
      { label: "Tx Hashes", value: txHashes.join(", ") || "Not returned" },
    ],
  };
}

async function bridgeFunds(
  intent: ArcIntent,
  kit: AppKit,
  adapter: Awaited<ReturnType<typeof createViemAdapterFromProvider>>,
) {
  if (!intent.amount) {
    throw new Error("Bridge needs an amount.");
  }

  const token = (intent.token ?? "USDC").toUpperCase();

  if (token !== "USDC") {
    throw new Error("Bridge currently supports USDC only in Arc App Kit.");
  }

  const fromChain = intent.fromChain ?? "Arc_Testnet";
  const toChain = intent.toChain ?? "Ethereum_Sepolia";
  const params = {
    from: { adapter, chain: fromChain },
    to: { adapter, chain: toChain },
    amount: intent.amount,
  };

  const estimate = await kit.estimateBridge(params);
  const result = await kit.bridge(params);
  const txHashes = collectTxHashes(result);

  return {
    summary: `Bridge executed from ${chainLabelMap[fromChain]} to ${chainLabelMap[toChain]}.`,
    details: [
      { label: "Action", value: "Bridge" },
      { label: "From", value: chainLabelMap[fromChain] },
      { label: "To", value: chainLabelMap[toChain] },
      { label: "Amount", value: `${intent.amount} USDC` },
      { label: "Estimate", value: safeJson(estimate) },
      { label: "State", value: readState(result) },
      { label: "Tx Hashes", value: txHashes.join(", ") || "Not returned" },
    ],
  };
}

async function swapFunds(
  intent: ArcIntent,
  kit: AppKit,
  adapter: Awaited<ReturnType<typeof createViemAdapterFromProvider>>,
) {
  if (!ARC_KIT_KEY) {
    throw new Error(
      "Swap requires NEXT_PUBLIC_ARC_KIT_KEY in .env.local from Circle Console.",
    );
  }

  if (!intent.amount || !intent.tokenIn || !intent.tokenOut) {
    throw new Error("Swap needs amount, input token, and output token.");
  }

  if (
    intent.tokenIn === "USDC" &&
    intent.tokenOut === "EURC" &&
    Number(intent.amount) < 1
  ) {
    throw new Error("Use at least 1.00 for USDC/EURC swap on Arc Testnet.");
  }

  const chainKey = "Arc_Testnet" as const;
  await ensureSufficientTokenBalance(
    adapter,
    chainKey,
    intent.tokenIn,
    intent.amount,
    "swap",
  );

  const params = {
    from: { adapter, chain: chainKey },
    tokenIn: intent.tokenIn,
    tokenOut: intent.tokenOut,
    amountIn: intent.amount,
    config: {
      kitKey: ARC_KIT_KEY,
    },
  };

  const estimate = await kit.estimateSwap(params);
  const result = await kit.swap(params);
  const txHashes = collectTxHashes(result);

  return {
    summary: `Swap executed on ${chainLabelMap[chainKey]}.`,
    details: [
      { label: "Action", value: "Swap" },
      { label: "Chain", value: chainLabelMap[chainKey] },
      { label: "Amount In", value: `${intent.amount} ${intent.tokenIn}` },
      { label: "Token Out", value: intent.tokenOut },
      {
        label: "Estimated Output",
        value: extractEstimatedOutput(estimate),
      },
      { label: "State", value: readState(result) },
      { label: "Tx Hashes", value: txHashes.join(", ") || "Not returned" },
    ],
  };
}

async function ensureSufficientTokenBalance(
  adapter: Awaited<ReturnType<typeof createViemAdapterFromProvider>>,
  chainKey: ArcChainKey,
  token: string,
  amount: string,
  action: "swap" | "send" | "bridge",
) {
  const chain = chainMap[chainKey];
  const address = await adapter.getAddress(chain);
  const tokenAddress = resolveTokenAddress(token, chain);
  const decimals = await adapter.getTokenDecimals(tokenAddress, chain);
  const balance = await adapter.readContract<bigint>(
    {
      address: tokenAddress,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address],
    },
    chain,
  );
  const requiredAmount = parseUnits(amount, decimals);

  if (balance < requiredAmount) {
    const available = formatUnits(balance, decimals);
    throw new Error(
      `Not enough ${token}. You have ${available} ${token} on ${chainLabelMap[chainKey]}.`,
    );
  }

  if (action === "bridge" && token !== "USDC") {
    throw new Error("Bridge currently supports USDC only in Arc App Kit.");
  }
}

function resolveTokenAddress(
  token: string,
  chain: (typeof chainMap)[ArcChainKey],
) {
  if (token === "USDC" && chain.usdcAddress) {
    return chain.usdcAddress as `0x${string}`;
  }

  if (token === "EURC" && chain.eurcAddress) {
    return chain.eurcAddress as `0x${string}`;
  }

  if (token === "USDT" && chain.usdtAddress) {
    return chain.usdtAddress as `0x${string}`;
  }

  if (/^0x[a-fA-F0-9]{40}$/.test(token)) {
    return token as `0x${string}`;
  }

  throw new Error(`${token} is not configured on ${chain.name}.`);
}

function readState(result: unknown) {
  if (
    typeof result === "object" &&
    result !== null &&
    "state" in result &&
    typeof result.state === "string"
  ) {
    return result.state;
  }

  return "Unknown";
}

function extractEstimatedOutput(estimate: unknown) {
  if (
    typeof estimate === "object" &&
    estimate !== null &&
    "estimatedOutput" in estimate &&
    typeof estimate.estimatedOutput === "object" &&
    estimate.estimatedOutput !== null &&
    "amount" in estimate.estimatedOutput &&
    "token" in estimate.estimatedOutput
  ) {
    const amount = String(estimate.estimatedOutput.amount);
    const token = String(estimate.estimatedOutput.token);

    return `${amount} ${token}`;
  }

  return safeJson(estimate);
}

function collectTxHashes(input: unknown) {
  const hashes = new Set<string>();

  walk(input, (entry) => {
    if (
      typeof entry === "object" &&
      entry !== null &&
      "txHash" in entry &&
      typeof entry.txHash === "string" &&
      entry.txHash.startsWith("0x")
    ) {
      hashes.add(entry.txHash);
    }
  });

  return [...hashes];
}

function walk(input: unknown, visitor: (entry: unknown) => void) {
  visitor(input);

  if (Array.isArray(input)) {
    for (const value of input) {
      walk(value, visitor);
    }
    return;
  }

  if (typeof input === "object" && input !== null) {
    for (const value of Object.values(input)) {
      walk(value, visitor);
    }
  }
}

function safeJson(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return "Unavailable";
  }
}

function enrichSwapError(error: unknown) {
  const baseMessage =
    error instanceof Error ? error.message : "Unknown ARC swap failure.";

  if (baseMessage.includes("No route available")) {
    return new Error("No swap route found. Try 1.00 USDC to EURC on Arc.");
  }

  if (
    baseMessage.includes("Insufficient token balance") ||
    baseMessage.includes("Not enough ") ||
    baseMessage.includes("transfer amount exceeds balance")
  ) {
    return new Error(baseMessage);
  }

  if (
    baseMessage.includes("Invalid or missing API key") ||
    baseMessage.includes("authorization")
  ) {
    return new Error("Swap key is invalid. Update NEXT_PUBLIC_ARC_KIT_KEY.");
  }

  if (
    baseMessage.includes("network mismatch") ||
    baseMessage.includes("wrong network")
  ) {
    return new Error("Switch your wallet to Arc Testnet and try again.");
  }

  if (baseMessage.includes("Failed to fetch")) {
    return new Error("Could not reach the swap service. Restart dev server and try again.");
  }

  if (baseMessage.length > 120) {
    return new Error("Swap failed. Please try again.");
  }

  return new Error(baseMessage);
}

async function withCircleProxy<T>(action: () => Promise<T>) {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input, init) => {
    const isRequest = typeof Request !== "undefined" && input instanceof Request;
    const url = isRequest
      ? input.url
      : typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    if (url.startsWith(CIRCLE_API_BASE_URL)) {
      const proxiedUrl = url.replace(CIRCLE_API_BASE_URL, LOCAL_CIRCLE_PROXY_PATH);

      if (isRequest) {
        const proxiedRequest = new Request(proxiedUrl, input);
        return originalFetch(proxiedRequest, init);
      }

      return originalFetch(proxiedUrl, init);
    }

    return originalFetch(input as RequestInfo | URL, init);
  };

  try {
    return await action();
  } finally {
    globalThis.fetch = originalFetch;
  }
}
