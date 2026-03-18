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

export const ORACLE_ROUTER_ADDRESS = (process.env.NEXT_PUBLIC_RWA_ORACLE_CORE_ADDRESS || '0xBA2651f23d7f2Fd5D8238e320B0b9Be2BBF54991') as `0x${string}`;
export const ASSET_MANAGER_ADDRESS = (process.env.NEXT_PUBLIC_RWA_ASSET_MANAGER_ADDRESS || '0x4E4e9D454783178fb4F9EF3D8c724c7Da73405Af') as `0x${string}`;
export const AUCTION_ADDRESS = (process.env.NEXT_PUBLIC_RWA_SEALED_BID_AUCTION_ADDRESS || '0x7D7C494988c122449ff69B9296896E09B58fCF79') as `0x${string}`;

export const routerConfig = {
  address: ORACLE_ROUTER_ADDRESS,
  abi: routerAbi as any,
} as const;
