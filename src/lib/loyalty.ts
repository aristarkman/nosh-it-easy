/**
 * Points-per-dollar loyalty:
 *  - Earn 1 point per $1 of subtotal on order placement.
 *  - Redeem in $5 increments: 100 points = $5 off.
 */
export const POINTS_PER_DOLLAR = 1;
export const POINTS_PER_REWARD = 100;
export const REWARD_VALUE = 5;

export function pointsEarnedFor(subtotal: number): number {
  return Math.floor(Math.max(0, subtotal) * POINTS_PER_DOLLAR);
}

export function maxRewardsRedeemable(balance: number, subtotal: number): number {
  const fromBalance = Math.floor(balance / POINTS_PER_REWARD);
  const fromCart = Math.floor(subtotal / REWARD_VALUE);
  return Math.max(0, Math.min(fromBalance, fromCart));
}

export function discountForRewards(rewards: number): number {
  return Math.max(0, rewards) * REWARD_VALUE;
}

export function pointsForRewards(rewards: number): number {
  return Math.max(0, rewards) * POINTS_PER_REWARD;
}
