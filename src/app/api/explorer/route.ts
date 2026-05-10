import { NextResponse } from "next/server";
import { formatUnits } from "viem";

const ARCSCAN_BASE_URL = "https://testnet.arcscan.app";

type ExplorerQuery =
  | "overview"
  | "totalTransactions"
  | "recentTransactions"
  | "tokenHoldings"
  | "transactionStatus";

type RequestBody = {
  query?: ExplorerQuery;
  address?: string;
  txHash?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;

    if (body.query === "transactionStatus") {
      if (!body.txHash) {
        return NextResponse.json(
          { error: "Transaction hash is required." },
          { status: 400 },
        );
      }

      const transaction = await fetchArcscanJson<ArcscanTransaction>(
        `api/v2/transactions/${body.txHash}`,
      );

      return NextResponse.json({
        summary: `Transaction ${transaction.status === "ok" ? "found" : "checked"} on Arc Testnet.`,
        details: [
          { label: "Action", value: "Transaction Status" },
          { label: "Status", value: transaction.status ?? "Unknown" },
          { label: "Block", value: String(transaction.block ?? "Unknown") },
          { label: "Timestamp", value: formatTimestamp(transaction.timestamp) },
          { label: "From", value: transaction.from?.hash ?? "Unknown" },
          { label: "To", value: transaction.to?.hash ?? "Unknown" },
          { label: "Value", value: formatNativeValue(transaction.value) },
          { label: "Tx Hashes", value: transaction.hash },
        ],
      });
    }

    if (!body.address) {
      return NextResponse.json(
        { error: "Wallet address is required." },
        { status: 400 },
      );
    }

    const [addressData, counters] = await Promise.all([
      fetchArcscanJson<ArcscanAddress>(`api/v2/addresses/${body.address}`),
      fetchArcscanJson<ArcscanCounters>(
        `api/v2/addresses/${body.address}/counters`,
      ),
    ]);

    if (body.query === "totalTransactions") {
      return NextResponse.json({
        summary: `Wallet has ${counters.transactions_count} total transactions on Arc Testnet.`,
        details: [
          { label: "Action", value: "Transaction Count" },
          { label: "Wallet", value: addressData.hash },
          { label: "Total Transactions", value: counters.transactions_count },
          { label: "Token Transfers", value: counters.token_transfers_count },
          {
            label: "Explorer",
            value: `https://testnet.arcscan.app/address/${addressData.hash}`,
          },
        ],
      });
    }

    if (body.query === "tokenHoldings") {
      const tokenBalances = await fetchArcscanJson<ArcscanTokenBalance[]>(
        `api/v2/addresses/${body.address}/token-balances`,
      );
      const visibleBalances = tokenBalances
        .filter((item) => item.value !== "0")
        .slice(0, 5);

      return NextResponse.json({
        summary:
          visibleBalances.length > 0
            ? `Top token holdings fetched for ${shortAddress(addressData.hash)}.`
            : `No token holdings found for ${shortAddress(addressData.hash)}.`,
        details:
          visibleBalances.length > 0
            ? [
                { label: "Action", value: "Token Holdings" },
                { label: "Wallet", value: addressData.hash },
                ...visibleBalances.map((item, index) => ({
                  label: `Token ${index + 1}`,
                  value: `${formatTokenValue(item.value, item.token.decimals)} ${item.token.symbol}`,
                })),
              ]
            : [
                { label: "Action", value: "Token Holdings" },
                { label: "Wallet", value: addressData.hash },
              ],
      });
    }

    if (body.query === "recentTransactions") {
      const recentTransactions = await fetchArcscanJson<
        ArcscanListResponse<ArcscanTransaction>
      >(`api/v2/addresses/${body.address}/transactions`);
      const items = recentTransactions.items.slice(0, 3);

      return NextResponse.json({
        summary:
          items.length > 0
            ? `Recent Arc Testnet transactions fetched for ${shortAddress(addressData.hash)}.`
            : `No recent transactions found for ${shortAddress(addressData.hash)}.`,
        details:
          items.length > 0
            ? [
                { label: "Action", value: "Recent Transactions" },
                { label: "Wallet", value: addressData.hash },
                { label: "Tx Hashes", value: items.map((item) => item.hash).join(", ") },
                {
                  label: "Latest Status",
                  value: items
                    .map((item) => item.status ?? item.result ?? "unknown")
                    .join(", "),
                },
              ]
            : [
                { label: "Action", value: "Recent Transactions" },
                { label: "Wallet", value: addressData.hash },
              ],
      });
    }

    return NextResponse.json({
      summary: `Arc Testnet wallet overview fetched for ${shortAddress(addressData.hash)}.`,
      details: [
        { label: "Action", value: "Wallet Overview" },
        { label: "Wallet", value: addressData.hash },
        { label: "Native Balance", value: formatNativeValue(addressData.coin_balance) },
        { label: "Total Transactions", value: counters.transactions_count },
        { label: "Token Transfers", value: counters.token_transfers_count },
        { label: "Contract", value: addressData.is_contract ? "Yes" : "No" },
        {
          label: "Explorer",
          value: `https://testnet.arcscan.app/address/${addressData.hash}`,
        },
      ],
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Explorer request failed.",
      },
      { status: 502 },
    );
  }
}

async function fetchArcscanJson<T>(path: string): Promise<T> {
  const response = await fetch(`${ARCSCAN_BASE_URL}/${path}`, {
    headers: {
      accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Arcscan request failed.");
  }

  return (await response.json()) as T;
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatNativeValue(value?: string) {
  if (!value) {
    return "0 ARC";
  }

  return `${formatUnits(BigInt(value), 18)} ARC`;
}

function formatTokenValue(value: string, decimals: string) {
  return formatUnits(BigInt(value), Number(decimals));
}

function formatTimestamp(value?: string) {
  if (!value) {
    return "Unknown";
  }

  return new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

type ArcscanAddress = {
  hash: string;
  coin_balance: string;
  is_contract: boolean;
};

type ArcscanCounters = {
  transactions_count: string;
  token_transfers_count: string;
};

type ArcscanTokenBalance = {
  value: string;
  token: {
    decimals: string;
    symbol: string;
  };
};

type ArcscanListResponse<T> = {
  items: T[];
};

type ArcscanTransaction = {
  hash: string;
  status?: string;
  result?: string;
  block?: number;
  timestamp?: string;
  value?: string;
  from?: {
    hash?: string;
  };
  to?: {
    hash?: string;
  };
};
