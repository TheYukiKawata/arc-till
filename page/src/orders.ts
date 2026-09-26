import { type Address, encodeAbiParameters, getContractAddress, type Hash, keccak256 } from "viem";
import { depositAddressCodeHash, tillAddress } from "./generated";

export type OrderStatus = "waiting" | "partial" | "paid" | "swept";

export type Order = {
  id: bigint;
  merchant: Address;
  amount: bigint;
  note: string;
  createdAt: number;
  fromBlock: bigint;
  deposit: Address;
  received: bigint;
  status: OrderStatus;
  paidAt?: number;
  paymentTx?: Hash;
  payer?: Address;
};

type StoredOrder = Omit<Order, "id" | "amount" | "fromBlock" | "received"> & {
  id: string;
  amount: string;
  fromBlock: string;
  received: string;
};

export function depositAddressFor(merchant: Address, orderId: bigint): Address {
  const salt = keccak256(encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [merchant, orderId]));
  return getContractAddress({
    from: tillAddress,
    salt,
    bytecodeHash: depositAddressCodeHash,
    opcode: "CREATE2",
  });
}

export function newOrderId(): bigint {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return bytes.reduce((id, byte) => (id << 8n) | BigInt(byte), 0n);
}

export function orderLabel(order: Order): string {
  return `#${order.id.toString(36).slice(-5).toUpperCase().padStart(5, "0")}`;
}

export function statusFor(amount: bigint, received: bigint): Exclude<OrderStatus, "swept"> {
  if (received >= amount) return "paid";
  if (received > 0n) return "partial";
  return "waiting";
}

export function loadOrders(storageKey: string): Order[] {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) ?? "[]") as StoredOrder[];
    return stored.map((order) => ({
      ...order,
      id: BigInt(order.id),
      amount: BigInt(order.amount),
      fromBlock: BigInt(order.fromBlock),
      received: BigInt(order.received),
    }));
  } catch {
    return [];
  }
}

export function saveOrders(storageKey: string, orders: Order[]) {
  const stored: StoredOrder[] = orders.map((order) => ({
    ...order,
    id: order.id.toString(),
    amount: order.amount.toString(),
    fromBlock: order.fromBlock.toString(),
    received: order.received.toString(),
  }));
  try {
    localStorage.setItem(storageKey, JSON.stringify(stored));
  } catch {}
}
