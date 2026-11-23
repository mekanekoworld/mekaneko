// Stub for Troya's server/kyber.mjs: MEKANEKO's Gate checks Pons curves and Uniswap v3/v4 pools only (no KyberSwap).
export const KYBER_ON = false, KYBER_LIVE = false;
export async function kyberRoute() { return null; }
export async function kyberBuild() { throw new Error('KyberSwap routes are not used by the MEKANEKO Gate'); }
export const splitLoss = () => null;
