import { Redis } from "@upstash/redis";
import { LENSES, LOBBY, Rating, RATINGS } from "./lenses";
import { Counts, emptyCounts } from "./decision";

export type ScoreRow = {
  useCase: string;
  verdicts: Rating[];
  outcome: "build" | "pilot" | "park";
  votes: number;
  at: string;
};

export type SessionState = {
  useCase: string;
  step: number; // -1 lobby, 0..5 a lens, 6 the decision
  open: boolean; // voting open on the current lens
  round: string; // changes for each use case, so votes never carry over
  verdicts: (Rating | null)[];
  scorecard: ScoreRow[];
  updatedAt: number;
};

export const freshState = (scorecard: ScoreRow[] = []): SessionState => ({
  useCase: "",
  step: LOBBY,
  open: false,
  round: newRound(),
  verdicts: LENSES.map(() => null),
  scorecard,
  updatedAt: Date.now(),
});

function newRound() {
  return Math.random().toString(36).slice(2, 10);
}
export { newRound };

const SESSION = (process.env.SESSION_ID || "symposium-2026").replace(/[^a-zA-Z0-9_-]/g, "");
const k = {
  state: `lv:${SESSION}:state`,
  votes: (round: string, lens: number) => `lv:${SESSION}:votes:${round}:${lens}`,
  cards: (round: string, lens: number) => `lv:${SESSION}:cards:${round}:${lens}`,
};
const TTL = 60 * 60 * 24 * 14; // keep vote data for two weeks

// ---------- backend selection ----------

const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = url && token ? new Redis({ url, token }) : null;

export const storageMode: "redis" | "memory" = redis ? "redis" : "memory";

// In-memory fallback for local development only. On Vercel each function
// instance has its own memory, so votes would be lost or split. Use Redis there.
type Mem = { kv: Map<string, unknown>; hashes: Map<string, Map<string, string>> };
const g = globalThis as unknown as { __lvMem?: Mem };
const mem: Mem = (g.__lvMem ??= { kv: new Map(), hashes: new Map() });

async function hset(key: string, field: string, value: string) {
  if (redis) {
    await redis.hset(key, { [field]: value });
    await redis.expire(key, TTL);
    return;
  }
  if (!mem.hashes.has(key)) mem.hashes.set(key, new Map());
  mem.hashes.get(key)!.set(field, value);
}

async function hgetall(key: string): Promise<Record<string, string>> {
  if (redis) {
    const r = await redis.hgetall<Record<string, string>>(key);
    return r ?? {};
  }
  return Object.fromEntries(mem.hashes.get(key) ?? []);
}

// ---------- state ----------

export async function getState(): Promise<SessionState> {
  const raw = redis ? await redis.get<SessionState>(k.state) : (mem.kv.get(k.state) as SessionState | undefined);
  if (!raw) return freshState();
  return { ...freshState(), ...raw };
}

export async function saveState(s: SessionState) {
  s.updatedAt = Date.now();
  if (redis) await redis.set(k.state, s, { ex: TTL });
  else mem.kv.set(k.state, s);
  return s;
}

// ---------- votes ----------

export async function castVote(round: string, lens: number, voter: string, rating: Rating) {
  await hset(k.votes(round, lens), voter, rating);
}

export async function getCounts(round: string, lens: number): Promise<{ phones: Counts; cards: Counts }> {
  const [votes, cards] = await Promise.all([hgetall(k.votes(round, lens)), hgetall(k.cards(round, lens))]);
  const phones = emptyCounts();
  for (const v of Object.values(votes)) if (RATINGS.includes(v as Rating)) phones[v as Rating]++;
  const c = emptyCounts();
  for (const r of RATINGS) c[r] = Math.max(0, parseInt(String(cards[r] ?? "0"), 10) || 0);
  return { phones, cards: c };
}

export async function setCards(round: string, lens: number, counts: Counts) {
  for (const r of RATINGS) await hset(k.cards(round, lens), r, String(Math.max(0, Math.floor(counts[r] || 0))));
}
