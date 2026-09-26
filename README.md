# Arc Till

A point-of-sale page that takes USDC on [Arc](https://arc.io) with a fresh address for every sale.

The merchant types an amount and the page shows a QR code for a new deposit address. The address belongs to a contract that does not exist yet: it is the CREATE2 address of a `DepositAddress` for `(merchant, orderId)`, so creating it costs nothing. The customer pays from any wallet, or through CCTP from another chain. The page sees the payment as soon as the balance changes, so there is no memo to type and no guessing which transfer belongs to which sale.

When the merchant wants the money, `sweepMany()` deploys the deposit addresses that need it and sends each balance to the merchant. Every sale leaves one `Swept(merchant, orderId, depositAddress, amount)` event, which is the receipt.

- The funds can only go to the merchant the address was derived for. Anyone may call `sweep()`, which lets a relayer or the customer pay the gas.
- The page sweeps only fully paid sales, so a partial payment can still be completed.
- Nothing runs on a server: order ids and amounts stay in the browser, and the chain is the ledger.

## Live on Arc mainnet

| | |
|---|---|
| Live demo | https://arc-till.yukikawata.workers.dev |
| Till contract | [`0xF491FB15A41F18ce9CF8d8dE4bc83dD53dB52F07`](https://explorer.arc.io/address/0xF491FB15A41F18ce9CF8d8dE4bc83dD53dB52F07) |
| Deploy tx | [`0xda584fd4…aeb7668`](https://explorer.arc.io/tx/0xda584fd48f5b5e127daf3e66a85d10704ce903070351e91613801e5aeaeb7668) (block 22893865) |
| Demo sale, paid | [`0x9c977bb7…668be8ab`](https://explorer.arc.io/tx/0x9c977bb7f03f8dbc2307b0ca054946959816c4830d07ff75d4800f20668be8ab): 0.02 USDC, shown as paid on the page 1.1 s after sending |
| Demo sale, swept | [`0xc44d8380…c87c566`](https://explorer.arc.io/tx/0xc44d8380037d44094366fafd4394ec84d44e9774014701cc08e83fc49c87c566) |

Chain id 5042, RPC `https://rpc.mainnet.arc.io`. The contract is deployed with CREATE2 through `0x4e59b448…4956C`.

## Repository

- `contracts/`: `Till.sol` and Foundry tests.
- `page/`: the static page (TypeScript, viem). `?network=testnet` or `?network=local` switches the chain.

## Build and run

Needs [Foundry](https://getfoundry.sh) and [Bun](https://bun.sh).

```sh
git clone --recursive https://github.com/TheYukiKawata/arc-till
cd arc-till/contracts && forge test
cd ../page && bun install && bun run gen && bun run typecheck && bun run build
bunx serve public
```

Any static host can serve `page/public`, because the Arc RPC allows requests from any origin. `bun run deploy` serves it from a Cloudflare Worker. Sweeping needs a browser wallet on Arc.

To deploy the contract, set `DEPLOYER_MNEMONIC` to the mnemonic of a funded wallet (it uses the first account) and run `bun scripts/deploy.ts mainnet --send` in `page/`.

Written by Yuki Kawata with Claude Code.

## License

MIT
