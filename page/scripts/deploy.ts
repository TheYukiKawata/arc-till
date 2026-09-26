import { concat, createPublicClient, createWalletClient, defineChain, http } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { tillAddress, tillBytecode, tillSalt } from "../src/generated";

const CREATE2_FACTORY = "0x4e59b44847b379578588920cA78FbF26c0B4956C";
const NETWORKS = {
  mainnet: { id: 5042, rpc: "https://rpc.mainnet.arc.io" },
  testnet: { id: 5042002, rpc: "https://rpc.testnet.arc.io" },
} as const;

const networkName = process.argv[2];
if (networkName !== "mainnet" && networkName !== "testnet") throw new Error("Usage: bun scripts/deploy.ts mainnet|testnet");
const network = NETWORKS[networkName];
const chain = defineChain({
  id: network.id,
  name: `Arc ${networkName}`,
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [network.rpc] } },
});

const client = createPublicClient({ chain, transport: http() });
const existingCode = await client.getCode({ address: tillAddress });
if (existingCode && existingCode !== "0x") {
  console.log(`Till is already deployed at ${tillAddress}`);
  process.exit(0);
}
if (process.argv[3] !== "--send") {
  console.log(`Till would deploy at ${tillAddress}. Pass --send to deploy.`);
  process.exit(0);
}

const mnemonic = process.env.DEPLOYER_MNEMONIC;
if (!mnemonic) throw new Error("DEPLOYER_MNEMONIC is not set.");
const account = mnemonicToAccount(mnemonic.trim().split(/\s+/).join(" "), { path: "m/44'/60'/0'/0/0" });
const wallet = createWalletClient({ chain, transport: http(), account });
const hash = await wallet.sendTransaction({ to: CREATE2_FACTORY, data: concat([tillSalt, tillBytecode]) });
const receipt = await client.waitForTransactionReceipt({ hash });
console.log(`Deployed Till at ${tillAddress} in block ${receipt.blockNumber}, tx ${hash}, status ${receipt.status}`);
