"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DECISION, LENSES, LOBBY, Rating, RATING_LABEL } from "@/lib/lenses";
import { decide } from "@/lib/decision";

type PublicState = {
  useCase: string;
  step: number;
  open: boolean;
  round: string;
  verdicts: (Rating | null)[];
  updatedAt: number;
};

const HINT: Record<Rating, string> = {
  pass: "Ready as it stands",
  cond: "Gaps, but each one can get an owner and a date",
  fail: "Missing, and nobody owns the fix",
};

function store(key: string, value?: string): string | null {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch {
    /* private mode: keep going without memory */
  }
  return value ?? null;
}

function voterId(): string {
  const existing = store("lv-voter");
  if (existing) return existing;
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  store("lv-voter", id);
  return id;
}

export default function Audience() {
  const [s, setS] = useState<PublicState | null>(null);
  const [online, setOnline] = useState(true);
  const [mine, setMine] = useState<Rating | null>(null);
  const [note, setNote] = useState<{ text: string; err?: boolean } | null>(null);
  const [sending, setSending] = useState(false);
  const voter = useRef<string>("");

  const poll = useCallback(async () => {
    try {
      const r = await fetch("/api/state", { cache: "no-store" });
      if (!r.ok) throw new Error();
      const next: PublicState = await r.json();
      setS((prev) => (prev && prev.updatedAt > next.updatedAt ? prev : next));
      setOnline(true);
    } catch {
      setOnline(false);
    }
  }, []);

  useEffect(() => {
    voter.current = voterId();
    poll();
    const t = setInterval(poll, 2500);
    const onVis = () => document.visibilityState === "visible" && poll();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [poll]);

  // Restore this phone's vote for the lens on screen.
  const voteKey = s && s.step >= 0 && s.step < LENSES.length ? `lv-vote:${s.round}:${s.step}` : null;
  useEffect(() => {
    setMine(voteKey ? (store(voteKey) as Rating | null) : null);
    setNote(null);
  }, [voteKey]);

  async function vote(rating: Rating) {
    if (!s || !voteKey || sending) return;
    setSending(true);
    setMine(rating);
    try {
      const r = await fetch("/api/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ round: s.round, lens: s.step, voter: voter.current, rating }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        setNote({ text: body.error || "That vote didn't go through. Try again.", err: true });
        setMine((store(voteKey) as Rating | null) ?? null);
        poll();
      } else {
        store(voteKey, rating);
        setNote({ text: "Vote recorded. You can change it while voting is open." });
      }
    } catch {
      setNote({ text: "No connection. Check your signal and tap again.", err: true });
      setMine((store(voteKey) as Rating | null) ?? null);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="aud">
      <header className="aud-head">
        <img src="/sitecore-logo.svg" alt="Sitecore" />
        <span className="live">
          <span className={`dot ${online ? "" : "off"}`} />
          {online ? "Live" : "Reconnecting"}
        </span>
      </header>
      <div className="aud-band" aria-hidden="true" />

      <main className="aud-main">
        {!s && <p className="aud-note">Connecting to the session…</p>}

        {s && s.useCase && (
          <div className="aud-usecase">
            <span>Use case we're qualifying</span>
            {s.useCase}
          </div>
        )}

        {s && s.step === LOBBY && <Lobby />}

        {s && s.step >= 0 && s.step < LENSES.length && (
          <LensVote
            index={s.step}
            open={s.open}
            mine={mine}
            sending={sending}
            recorded={s.verdicts[s.step]}
            onVote={vote}
          />
        )}

        {s && s.step === DECISION && <Outcome verdicts={s.verdicts} />}

        {note && (
          <p className={`aud-note ${note.err ? "err" : ""}`} role="status">
            {note.text}
          </p>
        )}
      </main>

      <footer className="aud-foot">
        Your vote is anonymous. Practical AI and agent use-case qualification · Customer Value Realisation
      </footer>
    </div>
  );
}

function Lobby() {
  return (
    <>
      <div>
        <p className="eyebrow">You're in</p>
        <h1>Voting starts when the presenter opens the first lens</h1>
      </div>
      <p className="test">
        We'll test one idea against six lenses. For each one, vote <b>Pass</b>, <b>Pass with conditions</b> or{" "}
        <b>Fail</b>. Governance, data and brand safety are hard gates: a Fail on any of them means don't build yet.
      </p>
      <ul className="lens-list">
        {LENSES.map((l, i) => (
          <li key={l.name}>
            <span className="n">{i + 1}</span>
            <span className="t">
              <b>{l.name}</b>
              <span>{l.question}</span>
            </span>
            {l.hardGate ? <span className="gate">Gate</span> : <span />}
          </li>
        ))}
      </ul>
    </>
  );
}

function LensVote(props: {
  index: number;
  open: boolean;
  mine: Rating | null;
  sending: boolean;
  recorded: Rating | null;
  onVote: (r: Rating) => void;
}) {
  const l = LENSES[props.index];
  return (
    <>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <span className="eyebrow">
          Lens {props.index + 1} of {LENSES.length}
        </span>
        {l.hardGate && <span className="gate">Hard gate</span>}
      </div>
      <h1>{l.name}</h1>
      <p className="q">{l.question}</p>
      <p className="test">
        <b>Test</b> {l.test}
      </p>

      <div className="vote-buttons" role="group" aria-label={`Your rating for ${l.name}`}>
        {(["pass", "cond", "fail"] as Rating[]).map((r) => (
          <button
            key={r}
            className={`vote-btn ${r} ${props.mine === r ? "on" : ""}`}
            disabled={!props.open || props.sending}
            aria-pressed={props.mine === r}
            onClick={() => props.onVote(r)}
          >
            <span>
              {RATING_LABEL[r]}
              <small>{HINT[r]}</small>
            </span>
            <span className="mark" aria-hidden="true">
              {props.mine === r ? "✓" : ""}
            </span>
          </button>
        ))}
      </div>

      {!props.open && (
        <p className="aud-note">
          {props.recorded
            ? `Voting closed. The room recorded ${RATING_LABEL[props.recorded]}.`
            : "Voting is closed for this lens."}
        </p>
      )}
    </>
  );
}

function Outcome({ verdicts }: { verdicts: (Rating | null)[] }) {
  const d = decide(verdicts);
  if (!d) return <p className="aud-note">The presenter is tallying the six lenses…</p>;
  return (
    <>
      <div className={`outcome ${d.outcome}`}>
        <p className="eyebrow">The room's decision</p>
        <h2>{d.label}</h2>
        <p>{d.reason}</p>
      </div>
      <ul className="lens-list">
        {LENSES.map((l, i) => (
          <li key={l.name}>
            <span className="n">{i + 1}</span>
            <span className="t">
              <b>{l.name}</b>
            </span>
            <span className={`chip ${verdicts[i]}`}>{verdicts[i] ? RATING_LABEL[verdicts[i]!] : "—"}</span>
          </li>
        ))}
      </ul>
      <p className="test">Now try the same six questions on your own idea, on the handout.</p>
    </>
  );
}
