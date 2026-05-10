# ARC AI

ARC AI is a simple chat-based web app built with Next.js for ARC testnet interactions.

Users can connect a wallet and use natural language to:

- send tokens
- check wallet balances
- view wallet and transaction data from Arcscan explorer

The app uses ARC App Kit for blockchain actions and Arcscan APIs for explorer-based wallet insights.

## Features

- wallet connect
- wallet balance checks
- explorer queries like total transactions, recent transactions, token holdings and tx lookup
- clean chat UI
- transaction links to Arcscan

## Run

```bash
npm install
npm run dev
```

Open:

```bash
http://localhost:3000
```

## Build

```bash
npm run build
```

## Environment Variable

Create a `.env.local` file and add:

```env
NEXT_PUBLIC_ARC_KIT_KEY=your_circle_kit_key
```

## Tech Stack

- Next.js
- React
- TypeScript
- Wagmi
- Viem
- ARC App Kit

