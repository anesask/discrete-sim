export interface PlainParams {
  steps: number;
  scale: number;
}
export interface PlainMetrics {
  mean: number;
  replication: number;
  seedLow: number;
}
export function model(
  params: PlainParams,
  seed: number,
  replication: number
): PlainMetrics;
export function failing(
  params: { failAt: number },
  seed: number,
  replication: number
): { ok: number };
export const notAFunction: number;
