# ARC AI

Chat-first ARC App Kit UI built with Next.js.

Supported chat actions:

- `Swap 1 USDC to EURC on Arc`
- `Bridge 5 USDC to Ethereum`
- `Send 2 USDC to 0x...`
- `What is my USDC balance?`

## Run

```bash
npm run dev
```

## Environment

Create `.env.local`:

```env
NEXT_PUBLIC_ARC_KIT_KEY=your_circle_kit_key
```

`NEXT_PUBLIC_ARC_KIT_KEY` is required for swap because ARC App Kit swap uses a Circle kit key.

## ARC docs used

- [Send](https://docs.arc.network/app-kit/send)
- [Bridge](https://docs.arc.network/app-kit/bridge)
- [Swap](https://docs.arc.network/app-kit/swap)
- [Swap tokens across chains](https://docs.arc.network/app-kit/quickstarts/swap-tokens-crosschain)

## Notes

- This app uses the connected browser wallet through `createViemAdapterFromProvider`.
- Testnet defaults are `Arc_Testnet`, `Ethereum_Sepolia`, `Base_Sepolia`, and `Arbitrum_Sepolia`.
- Bridge currently supports `USDC` only, matching App Kit behavior.
