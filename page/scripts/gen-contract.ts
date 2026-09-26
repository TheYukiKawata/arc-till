import { $ } from "bun";
import { getContractAddress, keccak256, toHex } from "viem";

const CREATE2_FACTORY = "0x4e59b44847b379578588920cA78FbF26c0B4956C";
const SALT = keccak256(toHex("arc-till/v1"));

const contractsDir = new URL("../../contracts/", import.meta.url).pathname;
const abi = await $`forge inspect Till abi --json`.cwd(contractsDir).json();
const bytecode = (await $`forge inspect Till bytecode`.cwd(contractsDir).text()).trim() as `0x${string}`;
const depositAddressCode = (await $`forge inspect DepositAddress bytecode`.cwd(contractsDir).text()).trim() as `0x${string}`;
const address = getContractAddress({ from: CREATE2_FACTORY, salt: SALT, bytecode, opcode: "CREATE2" });

await Bun.write(
  new URL("../src/generated.ts", import.meta.url),
  [
    `export const tillAbi = ${JSON.stringify(abi, null, 2)} as const;`,
    `export const tillBytecode = "${bytecode}" as const;`,
    `export const tillSalt = "${SALT}" as const;`,
    `export const tillAddress = "${address}" as const;`,
    `export const depositAddressCodeHash = "${keccak256(depositAddressCode)}" as const;`,
    "",
  ].join("\n\n"),
);
