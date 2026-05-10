"use client";

import {
  FormEvent,
  KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";

import { executeArcIntent } from "@/lib/arc-client";
import { ArcIntent, parseArcIntent } from "@/lib/arc-intent";

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  status?: "idle" | "success" | "error";
  details?: Array<{ label: string; value: string }>;
};

type PendingAction = {
  intent: ArcIntent;
};

const starterPrompts = [
  "Swap 1.00 USDC to EURC on Arc",
  "Bridge 5 USDC to Base",
  "What is my USDC balance?",
  "Send 3 USDC to 0x000000000000000000000000000000000000dead",
];

export function ChatShell() {
  const [input, setInput] = useState("");
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const scrollAnchorRef = useRef<HTMLDivElement | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: crypto.randomUUID(),
      role: "assistant",
      text: "Connect your wallet and chat naturally. I can send, bridge, swap, and read balances using ARC App Kit.",
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const { address, isConnected } = useAccount();
  const { connect, connectors, error, isPending, variables } = useConnect();
  const { disconnect } = useDisconnect();

  const canSend = input.trim().length > 0 && !isLoading && isConnected;
  const inputSuggestions = useMemo(() => {
    const value = input.trim().toLowerCase();

    if (pendingAction) {
      return ["yes", "cancel"];
    }

    if (!value) {
      return [];
    }

    if (value.startsWith("s")) {
      return [
        "Swap 1.00 USDC to EURC on Arc",
        "Send 3 USDC to 0x000000000000000000000000000000000000dead",
      ];
    }

    if (value.startsWith("b")) {
      return ["Bridge 5 USDC to Base"];
    }

    if (value.startsWith("w")) {
      return ["What is my USDC balance?"];
    }

    return starterPrompts.filter((prompt) =>
      prompt.toLowerCase().includes(value),
    ).slice(0, 3);
  }, [input, pendingAction]);
  const statusLabel = useMemo(
    () =>
      isLoading
        ? "Thinking..."
        : isConnected
          ? "Wallet connected"
          : "Wallet not connected",
    [isConnected, isLoading],
  );

  useEffect(() => {
    if (isConnected) {
      setIsWalletModalOpen(false);
    }
  }, [isConnected]);

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [messages, isLoading]);

  async function submitCurrentMessage() {
    if (!canSend) {
      return;
    }

    const trimmedInput = input.trim();
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      text: trimmedInput,
    };

    setMessages((current) => [...current, userMessage]);
    setInput("");

    try {
      if (pendingAction) {
        const lowerInput = trimmedInput.toLowerCase();

        if (lowerInput === "yes" || lowerInput === "y") {
          setPendingAction(null);
          setIsLoading(true);
          const data = await executeArcIntent(pendingAction.intent);

          setMessages((current) => [
            ...current,
            {
              id: crypto.randomUUID(),
              role: "assistant",
              text: data.summary,
              status: "success",
              details: data.details,
            },
          ]);

          return;
        }

        if (lowerInput === "cancel" || lowerInput === "no" || lowerInput === "n") {
          setPendingAction(null);
          setMessages((current) => [
            ...current,
            {
              id: crypto.randomUUID(),
              role: "assistant",
              text: "Action canceled. Type a new command when you're ready.",
            },
          ]);
          return;
        }

        setMessages((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            text: "Reply with yes to continue or cancel to stop.",
          },
        ]);
        return;
      }

      const intent = parseArcIntent(userMessage.text);

      if (intent.operation === "balance") {
        setIsLoading(true);
        const data = await executeArcIntent(intent);

        setMessages((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            text: data.summary,
            status: "success",
            details: data.details,
          },
        ]);

        return;
      }

      if (intent.operation === "explorer") {
        setIsLoading(true);
        const data = await executeArcIntent(intent);

        setMessages((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            text: data.summary,
            status: "success",
            details: data.details,
          },
        ]);

        return;
      }

      setPendingAction({
        intent,
      });

      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: `${buildConfirmationPrompt(intent)} Reply yes to continue or cancel to stop.`,
        },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text:
            error instanceof Error
              ? error.message
              : "Something went wrong while processing the ARC action.",
          status: "error",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitCurrentMessage();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submitCurrentMessage();
    }
  }

  return (
    <main className="flex min-h-screen flex-col bg-[#f7f7f2] px-4 py-8 text-black">
      <h1 className="text-center text-2xl font-semibold tracking-[0.3em] text-black">
        ARC AI
      </h1>

      <div className="flex flex-1 items-center justify-center py-8">
        <section className="flex h-[78vh] w-full max-w-3xl flex-col overflow-hidden rounded-[28px] border border-black/10 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
          <div className="flex items-center justify-between border-b border-black/8 px-5 py-4 sm:px-6">
            <div>
              <p className="text-sm font-medium text-black">Chat wallet</p>
              <p className="text-xs text-black/45">{statusLabel}</p>
            </div>
            {isConnected ? (
              <button
                type="button"
                onClick={() => disconnect()}
                className="rounded-full border border-black/10 px-4 py-2 text-xs font-medium text-black transition hover:bg-black hover:text-white"
              >
                {formatAddress(address)}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsWalletModalOpen(true)}
                className="rounded-full border border-black/10 px-4 py-2 text-xs font-medium text-black transition hover:bg-black hover:text-white"
              >
                Connect Wallet
              </button>
            )}
          </div>

          <div className="scrollbar-hidden flex-1 space-y-4 overflow-y-auto px-5 py-5 sm:px-6">
            {messages.map((message) => (
              <article
                key={message.id}
                className={`max-w-[85%] rounded-3xl border px-4 py-3 sm:px-5 ${
                  message.role === "user"
                    ? "ml-auto border-black bg-black text-white"
                    : "border-black/8 bg-[#f6f4ee] text-black"
                }`}
              >
                <p
                  className={`mb-2 text-[11px] uppercase tracking-[0.22em] ${
                    message.role === "user" ? "text-white/60" : "text-black/35"
                  }`}
                >
                  {message.role === "user" ? "You" : "ARC"}
                </p>
                <p className="text-sm leading-7">{message.text}</p>

                {message.details && (
                  <div
                    className={`mt-4 grid gap-3 rounded-2xl border p-4 text-sm sm:grid-cols-2 ${
                      message.role === "user"
                        ? "border-white/15 bg-white/10"
                        : "border-black/8 bg-white"
                    }`}
                  >
                    {message.details.map((detail) => (
                      <DetailRow
                        key={`${message.id}-${detail.label}`}
                        label={detail.label}
                        value={detail.value}
                      />
                    ))}
                  </div>
                )}
              </article>
            ))}

            {isLoading && (
              <article className="max-w-[14rem] rounded-3xl border border-black/8 bg-[#f6f4ee] px-4 py-4 text-black sm:px-5">
                <p className="mb-2 text-[11px] uppercase tracking-[0.22em] text-black/35">
                  ARC
                </p>
                <div className="flex items-center gap-2">
                  <span className="arc-dot h-2.5 w-2.5 rounded-full bg-black/80" />
                  <span className="arc-dot h-2.5 w-2.5 rounded-full bg-black/60" />
                  <span className="arc-dot h-2.5 w-2.5 rounded-full bg-black/40" />
                </div>
              </article>
            )}
            <div ref={scrollAnchorRef} />
          </div>

          <form
            onSubmit={handleSubmit}
            className="border-t border-black/8 px-5 py-4 sm:px-6"
          >
            <div className="space-y-3">
              {inputSuggestions.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {inputSuggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => setInput(suggestion)}
                      className="rounded-full border border-black/10 bg-white px-3 py-2 text-xs text-black/65 transition hover:bg-black hover:text-white"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex items-end gap-3">
                <textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    isConnected
                      ? "Type s for swap, b for bridge, w for wallet balance"
                      : "Connect wallet to start"
                  }
                  rows={1}
                  className="min-h-12 flex-1 resize-none rounded-3xl border border-black/10 bg-[#fcfcf8] px-4 py-3 text-sm text-black outline-none placeholder:text-black/35 focus:border-black"
                />
                <button
                  type="submit"
                  disabled={!canSend}
                  aria-label={isLoading ? "ARC is responding" : "Send message"}
                  className="flex h-12 w-12 items-center justify-center rounded-full border border-black bg-black text-white transition hover:bg-[#2b2b2b] disabled:cursor-not-allowed disabled:border-black/10 disabled:bg-black/10 disabled:text-black/25"
                >
                  {isLoading ? (
                    <span className="text-base leading-none">...</span>
                  ) : (
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M22 2 11 13" />
                      <path d="M22 2 15 22 11 13 2 9 22 2z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </form>
        </section>
      </div>

      {isWalletModalOpen && !isConnected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[28px] border border-black/10 bg-white p-5 shadow-[0_24px_80px_rgba(15,23,42,0.14)]">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-lg font-semibold text-black">
                  Connect wallet
                </p>
                <p className="mt-1 text-sm text-black/45">
                  Choose MetaMask or another available wallet.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsWalletModalOpen(false)}
                className="rounded-full border border-black/10 px-3 py-1 text-xs text-black/70 transition hover:bg-black hover:text-white"
              >
                Close
              </button>
            </div>

            <div className="space-y-3">
              {connectors.map((connector, index) => (
                <button
                  key={getConnectorKey(connector, index)}
                  type="button"
                  onClick={() => connect({ connector })}
                  disabled={isPending}
                  className="flex w-full items-center justify-between rounded-2xl border border-black/10 px-4 py-4 text-left text-black transition hover:bg-black hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="text-sm font-medium">
                    {getWalletLabel(connector.name)}
                  </span>
                  <span className="text-xs opacity-60">
                    {isPending &&
                    getConnectorId(variables?.connector) ===
                      getConnectorId(connector)
                      ? "Opening..."
                      : "Connect"}
                  </span>
                </button>
              ))}
            </div>

            {error && (
              <p className="mt-4 text-sm text-black/60">{error.message}</p>
            )}
          </div>
        </div>
      )}

      <footer className="text-center text-sm text-black/45">
        <a
          href="https://x.com"
          target="_blank"
          rel="noreferrer"
          className="transition hover:text-black"
        >
          X
        </a>
      </footer>
    </main>
  );
}

function formatAddress(address?: string) {
  if (!address) {
    return "Connected";
  }

  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function getWalletLabel(name: string) {
  if (name.toLowerCase().includes("meta")) {
    return "MetaMask";
  }

  if (name.toLowerCase().includes("coinbase")) {
    return "Coinbase Wallet";
  }

  if (name.toLowerCase().includes("injected")) {
    return "Browser Wallet";
  }

  return name;
}

function getConnectorId(connector: unknown) {
  if (
    typeof connector === "object" &&
    connector !== null &&
    "id" in connector &&
    typeof connector.id === "string"
  ) {
    return connector.id;
  }

  if (
    typeof connector === "object" &&
    connector !== null &&
    "name" in connector &&
    typeof connector.name === "string"
  ) {
    return connector.name;
  }

  return "wallet";
}

function getConnectorKey(connector: unknown, index: number) {
  return `${getConnectorId(connector)}-${index}`;
}

function buildConfirmationPrompt(intent: ArcIntent) {
  if (intent.operation === "swap") {
    return `Ready to swap ${intent.amount ?? "0"} ${intent.tokenIn ?? "token"} to ${intent.tokenOut ?? "token"} on Arc.`;
  }

  if (intent.operation === "bridge") {
    return `Ready to bridge ${intent.amount ?? "0"} ${intent.token ?? "USDC"} to ${formatChainLabel(intent.toChain ?? "Ethereum_Sepolia")}.`;
  }

  return `Ready to send ${intent.amount ?? "0"} ${intent.token ?? "USDC"} to ${intent.recipient ?? "the recipient"}.`;
}

function formatChainLabel(chain: ArcIntent["toChain"]) {
  if (chain === "Arc_Testnet") {
    return "Arc";
  }

  if (chain === "Base_Sepolia") {
    return "Base";
  }

  if (chain === "Arbitrum_Sepolia") {
    return "Arbitrum";
  }

  return "Ethereum";
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value?: string;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.18em] text-black/35">
        {label}
      </p>
      <div className="mt-1 break-all">
        <DetailValue label={label} value={value} />
      </div>
    </div>
  );
}

function DetailValue({ label, value }: { label: string; value?: string }) {
  if (!value) {
    return <p>Not provided</p>;
  }

  if (label.toLowerCase() !== "tx hashes") {
    return <p>{value}</p>;
  }

  const hashes = value
    .split(",")
    .map((hash) => hash.trim())
    .filter(Boolean);

  return (
    <div className="flex flex-wrap gap-2">
      {hashes.map((hash) => (
        <a
          key={hash}
          href={`https://testnet.arcscan.app/tx/${hash}`}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-4 transition hover:text-black/75"
        >
          {shortHash(hash)}
        </a>
      ))}
    </div>
  );
}

function shortHash(hash: string) {
  if (!hash.startsWith("0x") || hash.length < 12) {
    return hash;
  }

  return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
}
