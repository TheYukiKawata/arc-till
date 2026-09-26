import { type Address, type Hash, type PublicClient, parseAbiItem } from "viem";

const NATIVE_USDC_EMITTER = "0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE";
const transferEvent = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");

export type Payment = { tx: Hash; payer: Address; block: bigint };

export async function findFirstPayment(client: PublicClient, deposit: Address, fromBlock: bigint) {
  const logs = await client.getLogs({
    address: NATIVE_USDC_EMITTER,
    event: transferEvent,
    args: { to: deposit },
    fromBlock,
    toBlock: "latest",
  });
  const first = logs[0];
  if (!first) return undefined;
  return { tx: first.transactionHash, payer: first.args.from!, block: first.blockNumber } satisfies Payment;
}
