export type Network = {
  id: number;
  name: string;
  rpc: string;
  explorer: string;
};

const NETWORKS: Record<string, Network> = {
  mainnet: { id: 5042, name: "Arc", rpc: "https://rpc.mainnet.arc.io", explorer: "https://explorer.arc.io" },
  testnet: {
    id: 5042002,
    name: "Arc Testnet",
    rpc: "https://rpc.testnet.arc.io",
    explorer: "https://explorer.testnet.arc.io",
  },
  local: { id: 31337, name: "Local Arc", rpc: "http://127.0.0.1:8545", explorer: "" },
};

export function selectedNetwork(search: string): Network {
  const name = new URLSearchParams(search).get("network") ?? "mainnet";
  return NETWORKS[name] ?? NETWORKS.mainnet!;
}
