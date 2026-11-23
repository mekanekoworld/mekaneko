// Stub for Troya's server/api.mjs: only what the ported Gate imports. No HTTP server runs here.
export class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
export const send = () => { throw new Error('not an HTTP server'); };
export const requestLane = { getStore: () => null };       // every read counts as background work
