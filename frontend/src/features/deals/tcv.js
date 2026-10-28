/** A deal's TCV in dollars: GSSM's when synced, else the board's estimate, else the price to win; 0 when none. */
export const dealTcv = (deal) => Number(deal?.financials?.tcv || deal?.estimated_value || deal?.price_to_win) || 0
