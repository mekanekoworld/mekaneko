// MEKANEKO Seal: a signed, hash-chained receipt for every decision the agents make in public (SHURU's Gate checks,
// KOKEKO's Sentry calls, and the grades The Record gives them a day later).
// Ported from Troya Agent's server/seal.mjs (MIT, https://github.com/troyaagent/troya-agent, commit cf797cb; the license is
// in LICENSE-troya-agent.txt in this folder). Changes: MEKANEKO's own signing key, made on this server and kept encrypted
// (Troya signs with its Gate attestor); a small file store; the daily on-chain anchor runs only when SEAL_ANCHOR=on and the
// signing address holds a little ETH for gas.
//
// Each receipt is { v, seq, at, kind, subject, ref, digest, prev } and its hash is keccak256 of that JSON. It is signed twice:
//   · ECDSA (EIP-191 over "MEKANEKO Seal\n<hash>") by the MEKANEKO signer, whose address is public
//   · ML-DSA-65 (FIPS 204, post-quantum) over the 32 hash bytes, with a key made on the server
// `prev` links every receipt to the one before it, so one hash commits the whole history up to it. With the anchor on, the
// last hash of each day is written to Robinhood Chain the next day, so the history cannot be rewritten after a day closes.
// The private keys stay on the server: seal.key (random, mode 600) encrypts both of them in seal-keys.json. Never print them.
import { readFileSync, writeFileSync, appendFileSync, renameSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { generateKeyPairSync, createPrivateKey, createPublicKey, sign as pqSign, verify as pqVerify, randomBytes, createCipheriv, createDecipheriv, createHash } from "node:crypto";
import { keccak256, toUtf8Bytes, verifyMessage, getBytes, isHexString, Wallet, JsonRpcProvider } from "ethers";

const LABEL = "MEKANEKO Seal", DAY = 86_400_000;
const RPC = (process.env.ROBINHOOD_RPCS || "https://rpc.mainnet.chain.robinhood.com").split(",")[0];
const EXPLORER = "https://robinhoodchain.blockscout.com";
let DIR = null, keys = null, st = null, queue = Promise.resolve(), anchoring = false;
const recent = new Map();                       // hash → receipt (the last few thousand, for quick lookups)
const day = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
const lc = (s) => String(s || "").toLowerCase();
const short = (v, n = 160) => (typeof v === "string" && v.length > n ? v.slice(0, n) : v);
const readJson = (f, fb) => { try { return JSON.parse(readFileSync(join(DIR, f), "utf8")); } catch { return fb; } };
const writeJson = (f, v, mode) => { mkdirSync(DIR, { recursive: true }); writeFileSync(join(DIR, f + ".tmp"), JSON.stringify(v), mode ? { mode } : undefined); renameSync(join(DIR, f + ".tmp"), join(DIR, f)); };

export function setDir(dir) { DIR = dir; st = null; keys = null; }
export const ready = () => !!DIR;

/* ---------- keys: made once on this server, encrypted at rest ---------- */
function masterKey() {
  const f = join(DIR, "seal.key");
  try { const k = readFileSync(f); if (k.length === 32) return k; } catch {}
  mkdirSync(DIR, { recursive: true });
  const k = randomBytes(32); writeFileSync(f, k, { mode: 0o600 }); return k;
}
function seal_(buf) {
  const iv = randomBytes(12), c = createCipheriv("aes-256-gcm", masterKey(), iv);
  const ct = Buffer.concat([c.update(buf), c.final()]);
  return { iv: iv.toString("hex"), tag: c.getAuthTag().toString("hex"), ct: ct.toString("hex") };
}
function open_(j) {
  const d = createDecipheriv("aes-256-gcm", masterKey(), Buffer.from(j.iv, "hex")); d.setAuthTag(Buffer.from(j.tag, "hex"));
  return Buffer.concat([d.update(Buffer.from(j.ct, "hex")), d.final()]);
}
function getKeys() {
  if (keys) return keys;
  const j = readJson("seal-keys.json", null);
  if (j?.ecdsa && j?.mldsa) {
    const signer = new Wallet("0x" + open_(j.ecdsa).toString("hex"));
    const priv = createPrivateKey({ key: open_(j.mldsa), format: "der", type: "pkcs8" });
    keys = { signer, address: signer.address, priv, pub: createPublicKey(priv), pubB64: j.mldsa.pub };
    return keys;
  }
  const signer = Wallet.createRandom();
  const { privateKey, publicKey } = generateKeyPairSync("ml-dsa-65");
  const pubB64 = publicKey.export({ format: "der", type: "spki" }).toString("base64");
  writeJson("seal-keys.json", {
    ecdsa: { ...seal_(Buffer.from(signer.privateKey.slice(2), "hex")), address: signer.address },
    mldsa: { ...seal_(privateKey.export({ format: "der", type: "pkcs8" })), pub: pubB64, alg: "ML-DSA-65" }, at: Date.now(),
  }, 0o600);
  keys = { signer: new Wallet(signer.privateKey), address: signer.address, priv: privateKey, pub: publicKey, pubB64 };
  return keys;
}
export const signerAddress = () => getKeys().address;

const state = () => (st ||= readJson("seal.json", {}));
const core = (r) => ({ v: r.v, seq: r.seq, at: r.at, kind: r.kind, subject: r.subject, ref: r.ref, digest: r.digest, prev: r.prev });
const hashOf = (r) => keccak256(toUtf8Bytes(JSON.stringify(core(r))));
const message = (hash) => `${LABEL}\n${hash}`;
export const digestOf = (payload) => (typeof payload === "string" && isHexString(payload, 32) ? payload : keccak256(toUtf8Bytes(JSON.stringify(payload ?? null))));

/** Seal one decision. payload is hashed into `digest` (pass a 32-byte hex string to use it as is). Never throws; null when off. */
export function seal(kind, subject, payload, ref = null) {
  if (!DIR) return Promise.resolve(null);
  const run = queue.then(() => {
    const s = state(), k = getKeys();
    const r = { v: 1, seq: (s.seq || 0) + 1, at: Date.now(), kind: String(kind), subject: short(String(subject || "")), ref: ref ? short(String(ref)) : null, digest: digestOf(payload), prev: s.head || null };
    const hash = hashOf(r);
    const ecdsa = k.signer.signMessageSync(message(hash));
    const mldsa = pqSign(null, Buffer.from(getBytes(hash)), k.priv).toString("base64");
    const rec = { ...r, hash, sig: { ecdsa, signer: k.address, mldsa } };
    const d = day(r.at);
    mkdirSync(join(DIR, "seal"), { recursive: true });
    appendFileSync(join(DIR, "seal", `${d}.jsonl`), JSON.stringify(rec) + "\n");
    s.seq = r.seq; s.head = hash; s.days ||= {};
    const dd = (s.days[d] ||= { count: 0, first: hash });
    dd.count++; dd.last = hash; dd.kinds ||= {}; dd.kinds[r.kind] = (dd.kinds[r.kind] || 0) + 1;
    writeJson("seal.json", s);
    recent.set(hash, rec); if (recent.size > 5000) recent.delete(recent.keys().next().value);
    return rec;
  });
  queue = run.catch((e) => console.warn("[seal]", e.message));
  return run.catch(() => null);
}

function readDay(d) {
  try { return readFileSync(join(DIR, "seal", `${d}.jsonl`), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)); }
  catch { return []; }
}
export function findReceipt(hash, days = 30) {
  const h = lc(hash);
  let rec = recent.get(h);
  for (let i = 0; !rec && i < days; i++) rec = readDay(day(Date.now() - i * DAY)).find((x) => x.hash === h);
  return rec || null;
}

/** Every check a third party can run on a receipt: the hash, both signatures, and the link to the receipt before it. */
export function verifyReceipt(rec) {
  const out = { hash: false, ecdsa: false, mldsa: false, linked: null, valid: false };
  if (!rec || typeof rec !== "object") return out;
  let h; try { h = hashOf(rec); } catch { return out; }
  out.hash = h === rec.hash;
  try { out.ecdsa = lc(verifyMessage(message(h), rec.sig?.ecdsa)) === lc(getKeys().address); } catch {}
  try { out.mldsa = pqVerify(null, Buffer.from(getBytes(h)), getKeys().pub, Buffer.from(String(rec.sig?.mldsa || ""), "base64")); } catch {}
  if (rec.prev) {
    const prev = recent.get(rec.prev) || readDay(day(rec.at)).find((x) => x.hash === rec.prev) || readDay(day(rec.at - DAY)).find((x) => x.hash === rec.prev);
    out.linked = !!prev && prev.seq === rec.seq - 1;
  } else out.linked = rec.seq === 1;
  out.valid = out.hash && out.ecdsa && out.mldsa && out.linked !== false;
  return out;
}

/* ---------- daily anchor on Robinhood Chain (off unless SEAL_ANCHOR=on) ---------- */
async function anchorTick() {
  if (process.env.SEAL_ANCHOR !== "on" || anchoring || !DIR) return;
  const s = state(), y = day(Date.now() - DAY), dd = s.days?.[y];
  if (!dd || dd.anchorTx || !dd.last) return;
  anchoring = true;
  try {
    const provider = new JsonRpcProvider(RPC, 4663, { staticNetwork: true });
    const w = getKeys().signer.connect(provider);
    const data = "0x" + Buffer.from(`MEKANEKO-SEAL ${y} `).toString("hex") + dd.last.slice(2);
    const [bal, fee, gas] = await Promise.all([provider.getBalance(w.address), provider.getFeeData(), provider.estimateGas({ from: w.address, to: w.address, data })]);
    const cost = gas * (fee.maxFeePerGas || fee.gasPrice || 0n);
    if (!cost || cost > 200_000_000_000_000n || bal < cost) { console.warn(`[seal] anchor ${y} skipped: gas ${cost} wei, balance ${bal} wei`); return; }
    const tx = await w.sendTransaction({ to: w.address, value: 0n, data, gasLimit: (gas * 12n) / 10n });
    const rc = await tx.wait(1, 180_000);
    if (rc?.status === 1) {
      s.days[y].anchorTx = tx.hash; s.days[y].anchoredAt = Date.now(); s.lastAnchor = { day: y, tx: tx.hash, head: dd.last };
      writeJson("seal.json", s);
      console.log(`[seal] anchored ${y} (${dd.count} receipts) tx ${tx.hash}`);
    }
  } catch (e) { console.warn("[seal] anchor", e.message); }
  finally { anchoring = false; }
}
let timer = null;
export function startAnchor() {
  if (timer || !DIR) return;
  setTimeout(() => anchorTick().catch(() => {}), 60_000).unref?.();
  timer = setInterval(() => anchorTick().catch(() => {}), 30 * 60_000); timer.unref?.();
}

/* ---------- public views ---------- */
export function sealView() {
  const s = state(), k = getKeys();
  const days = Object.entries(s.days || {}).sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 30)
    .map(([d, v]) => ({ day: d, count: v.count, kinds: v.kinds || {}, last: v.last, anchorTx: v.anchorTx || null, anchorUrl: v.anchorTx ? `${EXPLORER}/tx/${v.anchorTx}` : null }));
  return {
    name: LABEL, seq: s.seq || 0, head: s.head || null, today: s.days?.[day()]?.count || 0, days, lastAnchor: s.lastAnchor || null,
    anchor: process.env.SEAL_ANCHOR === "on" ? "daily" : "off",
    keys: { ecdsa: k.address, ecdsaUrl: `${EXPLORER}/address/${k.address}`,
      mldsa: { alg: "ML-DSA-65 (FIPS 204)", spkiBase64: k.pubB64, sha256: createHash("sha256").update(Buffer.from(k.pubB64, "base64")).digest("hex") } },
    verify: `hash = keccak256(JSON.stringify({v,seq,at,kind,subject,ref,digest,prev})); sig.ecdsa = EIP-191 personal_sign over "${LABEL}\\n<hash>" by keys.ecdsa; sig.mldsa = ML-DSA-65 over the 32 hash bytes with keys.mldsa; prev = hash of receipt seq-1. Or POST { receipt } to /api/seal/verify.`,
  };
}
export function receiptsOf(d, limit = 50, kind = null) {
  const dd = /^\d{4}-\d{2}-\d{2}$/.test(String(d || "")) ? d : day();
  const list = readDay(dd).filter((x) => !kind || x.kind === kind).reverse().slice(0, Math.max(1, Math.min(200, Number(limit) || 50)));
  return { day: dd, count: list.length, receipts: list };
}
