import routerAbi from "../abis/OracleRouter.json" assert { type: "json" };

export type AssetTypeKey =
  | "REAL_ESTATE"
  | "INVOICE"
  | "VEHICLE"
  | "ART"
  | "COMMODITY"
  | "OTHER";

export const AssetTypeId: Record<AssetTypeKey, number> = {
  REAL_ESTATE: 0,
  INVOICE: 1,
  VEHICLE: 2,
  ART: 3,
  COMMODITY: 4,
  OTHER: 5,
};

export const ORACLE_ROUTER_ADDRESS = process.env.NEXT_PUBLIC_ORACLE_ROUTER_ADDRESS as `0x${string}`;

export const routerConfig = {
  address: ORACLE_ROUTER_ADDRESS,
  abi: routerAbi as any,
} as const;
