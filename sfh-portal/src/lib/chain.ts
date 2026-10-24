import { createPublicClient, defineChain, http } from 'viem';

export const besu = defineChain({
  id: Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 81234),
  name: 'Codecrypto Besu',
  nativeCurrency: { name: 'CC', symbol: 'CC', decimals: 18 },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_RPC_URL ?? 'https://besu.alumnos.codecrypto.academy'],
    },
  },
});

export const publicClient = createPublicClient({
  chain: besu,
  transport: http(process.env.NEXT_PUBLIC_RPC_URL),
});
