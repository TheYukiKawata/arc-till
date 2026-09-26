import { renderSVG } from "uqr";
import {
  type Address,
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  type EIP1193Provider,
  formatUnits,
  getAddress,
  http,
  isAddress,
  parseUnits,
} from "viem";
import { tillAbi, tillAddress } from "./generated";
import { selectedNetwork } from "./networks";
import {
  depositAddressFor,
  loadOrders,
  newOrderId,
  type Order,
  orderLabel,
  saveOrders,
  statusFor,
} from "./orders";
import { findFirstPayment } from "./payments";

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
  }
}

type Settings = { shop: string; payout: Address };
type View = "setup" | "charge" | "order";

const NATIVE_DECIMALS = 18;
const ORDER_POLL_MS = 1000;
const LIST_POLL_MS = 5000;
const DAY_MS = 24 * 60 * 60 * 1000;

const network = selectedNetwork(location.search);
const chain = defineChain({
  id: network.id,
  name: network.name,
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: NATIVE_DECIMALS },
  rpcUrls: { default: { http: [network.rpc] } },
});
const client = createPublicClient({ chain, transport: http(network.rpc) });
const storageKeys = { settings: `arc-till:${network.id}:settings`, orders: `arc-till:${network.id}:orders` };

let settings = loadSettings();
let orders = loadOrders(storageKeys.orders);
let activeOrder: Order | undefined;
let orderPoll: ReturnType<typeof setInterval> | undefined;

const element = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

function loadSettings(): Settings | undefined {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKeys.settings) ?? "null") as Settings | null;
    if (saved && isAddress(saved.payout)) return saved;
  } catch {}
  return undefined;
}

function saveSettings(next: Settings) {
  settings = next;
  try {
    localStorage.setItem(storageKeys.settings, JSON.stringify(next));
  } catch {}
}

function persistOrders() {
  saveOrders(storageKeys.orders, orders);
}

function formatUsdc(amount: bigint): string {
  const [whole = "0", fraction = ""] = formatUnits(amount, NATIVE_DECIMALS).split(".");
  const shown = fraction.slice(0, 6).replace(/0+$/, "").padEnd(2, "0");
  return `${Number(whole).toLocaleString("en")}.${shown}`;
}

function parseAmount(text: string): bigint | undefined {
  const normalized = text.trim().replace(",", ".");
  if (!/^\d{1,7}(\.\d{1,6})?$/.test(normalized)) return undefined;
  const amount = parseUnits(normalized, NATIVE_DECIMALS);
  return amount > 0n ? amount : undefined;
}

function explorerTx(tx: string): string | undefined {
  return network.explorer ? `${network.explorer}/tx/${tx}` : undefined;
}

function showView(view: View) {
  element("setup-view").hidden = view !== "setup";
  element("charge-view").hidden = view !== "charge";
  element("order-view").hidden = view !== "order";
  if (view === "charge") element<HTMLInputElement>("amount-input").focus();
}

function describeOrder(order: Order): string {
  switch (order.status) {
    case "waiting":
      return "Waiting for payment";
    case "partial":
      return `Received ${formatUsdc(order.received)} of ${formatUsdc(order.amount)}`;
    case "paid":
      return order.received > order.amount
        ? `Paid, ${formatUsdc(order.received - order.amount)} over`
        : "Paid, waiting to sweep";
    case "swept":
      return "Paid and swept";
  }
}

function renderOrders() {
  const list = element("orders-list");
  list.replaceChildren(
    ...orders.map((order) => {
      const item = document.createElement("li");
      const id = Object.assign(document.createElement("span"), { className: "order-id", textContent: orderLabel(order) });
      const note = Object.assign(document.createElement("span"), {
        className: "order-note",
        textContent: order.note || new Date(order.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      });
      const total = Object.assign(document.createElement("span"), {
        className: "order-total",
        textContent: formatUsdc(order.amount),
      });
      const status = Object.assign(document.createElement("span"), {
        className: "order-status",
        textContent: describeOrder(order),
      });
      status.dataset.status = order.status;
      item.append(id, note, total, status);
      return item;
    }),
  );
  element("orders-empty").hidden = orders.length > 0;

  const takings = orders.filter((order) => order.status === "paid" || order.status === "swept");
  const sum = takings.reduce((total, order) => total + order.received, 0n);
  element("orders-total").textContent = takings.length ? `${formatUsdc(sum)} USDC paid` : "";
  element<HTMLButtonElement>("sweep-button").disabled = sweepable().length === 0;
}

function sweepable(): Order[] {
  return orders.filter((order) => order.status === "paid");
}

async function refreshOrder(order: Order) {
  if (order.status === "swept") return;
  const balance = await client.getBalance({ address: order.deposit });
  const sweptElsewhere = balance < order.received;
  if (sweptElsewhere) {
    order.status = "swept";
    return;
  }
  order.received = balance;
  order.status = statusFor(order.amount, order.received);
  if (order.status !== "paid" || order.paymentTx) return;

  order.paidAt = Date.now();
  const payment = await findFirstPayment(client, order.deposit, order.fromBlock).catch(() => undefined);
  order.paymentTx = payment?.tx;
  order.payer = payment?.payer;
}

function renderActiveOrder(order: Order) {
  const status = element("order-status");
  status.dataset.status = order.status;
  element("order-qr").toggleAttribute("data-paid", order.status === "paid");
  element("order-manual").hidden = order.status === "paid";
  element<HTMLButtonElement>("order-done").textContent = order.status === "paid" ? "New sale" : "Cancel";

  if (order.status === "waiting") {
    status.textContent = "Scan with any wallet on Arc.";
    return;
  }
  if (order.status === "partial") {
    status.textContent = `Received ${formatUsdc(order.received)}. Waiting for ${formatUsdc(order.amount - order.received)} more.`;
    return;
  }

  const over = order.received > order.amount ? ` That is ${formatUsdc(order.received - order.amount)} over.` : "";
  status.textContent = `Paid ${formatUsdc(order.received)} USDC.${over} Final on Arc. `;
  const link = order.paymentTx && explorerTx(order.paymentTx);
  if (link) status.append(Object.assign(document.createElement("a"), { href: link, target: "_blank", rel: "noopener", textContent: "View payment" }));
}

function openOrder(order: Order) {
  activeOrder = order;
  const uri = `ethereum:${order.deposit}@${network.id}?value=${order.amount}`;
  element("order-shop").textContent = settings?.shop ? `${settings.shop} · ${orderLabel(order)}` : orderLabel(order);
  element("order-amount").textContent = `${formatUsdc(order.amount)} USDC`;
  element("order-note").textContent = order.note;
  element("order-qr").innerHTML = renderSVG(uri, { border: 1, whiteColor: "transparent", blackColor: "currentColor" });
  element("manual-amount").textContent = formatUsdc(order.amount);
  element("order-address").textContent = order.deposit;
  renderActiveOrder(order);
  showView("order");

  clearInterval(orderPoll);
  orderPoll = setInterval(async () => {
    try {
      await refreshOrder(order);
      persistOrders();
      renderActiveOrder(order);
      if (order.status === "paid") clearInterval(orderPoll);
    } catch {
      element("order-status").textContent = "Cannot reach Arc. Retrying.";
      element("order-status").dataset.status = "error";
    }
  }, ORDER_POLL_MS);
}

function closeOrder() {
  clearInterval(orderPoll);
  activeOrder = undefined;
  element<HTMLFormElement>("charge-form").reset();
  renderOrders();
  showView("charge");
}

async function refreshOpenOrders() {
  if (activeOrder || element("charge-view").hidden) return;
  const recent = orders.filter(
    (order) => order.status !== "swept" && order.status !== "paid" && Date.now() - order.createdAt < DAY_MS,
  );
  if (recent.length === 0) return;
  await Promise.all(recent.map(refreshOrder));
  persistOrders();
  renderOrders();
}

async function connectWallet() {
  const provider = window.ethereum;
  if (!provider) throw new Error("No browser wallet found. Open the till in a browser with a wallet to sweep.");
  const [account] = await provider.request({ method: "eth_requestAccounts" });
  if (!account) throw new Error("The wallet shared no account.");
  const chainId = `0x${network.id.toString(16)}` as const;
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
  } catch (error) {
    if ((error as { code?: number }).code !== 4902) throw error;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId,
          chainName: network.name,
          nativeCurrency: { name: "USDC", symbol: "USDC", decimals: NATIVE_DECIMALS },
          rpcUrls: [network.rpc],
          blockExplorerUrls: network.explorer ? [network.explorer] : undefined,
        },
      ],
    });
  }
  return createWalletClient({ chain, transport: custom(provider), account: getAddress(account) });
}

async function sweep() {
  if (!settings) return;
  const button = element<HTMLButtonElement>("sweep-button");
  const status = element("sweep-status");
  button.disabled = true;
  try {
    await Promise.all(sweepable().map(refreshOrder));
    const funded = sweepable().filter((order) => order.merchant === settings!.payout && order.received > 0n);
    if (funded.length === 0) {
      status.textContent = "Nothing to sweep.";
      return;
    }
    const wallet = await connectWallet();
    status.textContent = `Confirm the sweep of ${funded.length} sales in your wallet.`;
    const hash = await wallet.writeContract({
      address: tillAddress,
      abi: tillAbi,
      functionName: "sweepMany",
      args: [settings.payout, funded.map((order) => order.id)],
    });
    await client.waitForTransactionReceipt({ hash });
    const total = funded.reduce((sum, order) => sum + order.received, 0n);
    for (const order of funded) order.status = "swept";
    persistOrders();
    status.textContent = `Swept ${formatUsdc(total)} USDC to ${settings.payout.slice(0, 6)}…${settings.payout.slice(-4)}.`;
  } catch (error) {
    status.textContent = error instanceof Error ? (error.message.split("\n")[0] ?? error.message) : String(error);
  } finally {
    renderOrders();
  }
}

element("network-name").textContent = network.name;

element<HTMLFormElement>("setup-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const payout = element<HTMLInputElement>("payout-input").value.trim();
  if (!isAddress(payout, { strict: false })) {
    element("setup-error").textContent = "Enter an address that starts with 0x and has 40 hex characters.";
    return;
  }
  element("setup-error").textContent = "";
  saveSettings({ shop: element<HTMLInputElement>("shop-input").value.trim(), payout: getAddress(payout) });
  renderOrders();
  showView("charge");
});

element<HTMLFormElement>("charge-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!settings) return;
  const amount = parseAmount(element<HTMLInputElement>("amount-input").value);
  if (!amount) {
    element("charge-error").textContent = "Enter an amount like 4.50, with at most 6 decimals.";
    return;
  }
  element("charge-error").textContent = "";

  const id = newOrderId();
  const fromBlock = await client.getBlockNumber().catch(() => 0n);
  const order: Order = {
    id,
    merchant: settings.payout,
    amount,
    note: element<HTMLInputElement>("note-input").value.trim(),
    createdAt: Date.now(),
    fromBlock,
    deposit: depositAddressFor(settings.payout, id),
    received: 0n,
    status: "waiting",
  };
  orders = [order, ...orders];
  persistOrders();
  openOrder(order);
});

element("order-done").addEventListener("click", closeOrder);
element("sweep-button").addEventListener("click", sweep);
element("change-payout").addEventListener("click", () => {
  element<HTMLInputElement>("shop-input").value = settings?.shop ?? "";
  element<HTMLInputElement>("payout-input").value = settings?.payout ?? "";
  showView("setup");
});

setInterval(() => refreshOpenOrders().catch(() => undefined), LIST_POLL_MS);
renderOrders();
showView(settings ? "charge" : "setup");
