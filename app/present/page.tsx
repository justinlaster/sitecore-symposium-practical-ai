"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { DECISION, LENSES, LOBBY, Rating, RATINGS, RATING_LABEL, RATING_SHORT } from "@/lib/lenses";
import { Counts, decide, majority, OUTCOME_LABEL, total } from "@/lib/decision";

type ScoreRow = { useCase: string; verdicts: Rating[]; outcome: "build" | "pilot" | "park"; votes: number; at: string };
type State = {
  useCase: string;
  step: number;
  open: boolean;
  round: string;
  verdicts: (Rating | null)[];
  scorecard: ScoreRow[];
  updatedAt: number;
};
type Snapshot = {
  state: State;
  counts: { phones: Counts; cards: Counts };
  storageMode: "redis" | "memory";
  keyConfigured: boolean;
};

const SESSION_TITLE = process.env.NEXT_PUBLIC_SESSION_TITLE || "Practical AI and agent use-case qualification";

function readKey() {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("key");
    if (fromUrl) {
      localStorage.setItem("lv-key", fromUrl);
      // keep the key out of the address bar on a shared screen
      window.history.replaceState(null, "", window.location.pathname);
      return fromUrl;
    }
    return localStorage.getItem("lv-key") || "";
  } catch {
    return "";
  }
}

export default function Presenter() {
  const [key, setKey] = useState<string | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [authError, setAuthError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"stage" | "scorecard">("stage");
  const [joinUrl, setJoinUrl] = useState("");
  const [qr, setQr] = useState("");
  const busy = useRef(false);

  useEffect(() => {
    setKey(readKey());
    const url = window.location.origin;
    setJoinUrl(url);
    QRCode.toDataURL(url, { margin: 1, width: 720, color: { dark: "#16131F", light: "#FFFFFF" } })
      .then(setQr)
      .catch(() => setQr(""));
  }, []);

  const poll = useCallback(async () => {
    if (key === null || busy.current) return;
    try {
      const r = await fetch("/api/admin", { headers: { "x-presenter-key": key }, cache: "no-store" });
      if (r.status === 401) {
        setAuthError(true);
        return;
      }
      if (!r.ok) throw new Error();
      setAuthError(false);
      setSnap(await r.json());
      setError(null);
    } catch {
      setError("Can't reach the server. Retrying…");
    }
  }, [key]);

  useEffect(() => {
    if (key === null) return;
    poll();
    const t = setInterval(poll, 1500);
    return () => clearInterval(t);
  }, [key, poll]);

  const act = useCallback(
    async (body: Record<string, unknown>) => {
      if (key === null) return;
      busy.current = true;
      try {
        const r = await fetch("/api/admin", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-presenter-key": key },
          body: JSON.stringify(body),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) setError(data.error || "That didn't work. Try again.");
        else {
          setSnap(data);
          setError(null);
        }
      } catch {
        setError("Can't reach the server. Try again.");
      } finally {
        busy.current = false;
      }
    },
    [key],
  );

  const s = snap?.state;

  // Keyboard: arrows move between steps, space opens or closes voting, S toggles the scorecard.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!s) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        if (s.step < DECISION) act({ action: "goto", step: s.step + 1 });
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        if (s.step > LOBBY) act({ action: "goto", step: s.step - 1 });
      } else if (e.key === " " && s.step >= 0 && s.step < LENSES.length) {
        e.preventDefault();
        act({ action: "setOpen", open: !s.open });
      } else if (e.key.toLowerCase() === "s") {
        setView((v) => (v === "stage" ? "scorecard" : "stage"));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [s, act]);

  if (key === null) return null;

  if (authError) {
    return (
      <KeyGate
        onSubmit={(k) => {
          try {
            localStorage.setItem("lv-key", k);
          } catch {}
          setKey(k);
        }}
      />
    );
  }

  return (
    <div className="pres">
      <header className="pres-head">
        <img className="logo" src="/sitecore-logo.svg" alt="Sitecore" />
        <span className="title">{SESSION_TITLE}</span>
        {s && s.step !== LOBBY && (
          <span className="join">
            <span>
              Vote at <b>{joinUrl.replace(/^https?:\/\//, "")}</b>
            </span>
            {qr && <img src={qr} alt="QR code to join the vote" />}
          </span>
        )}
      </header>

      <nav className="progress" aria-label="Lenses">
        {LENSES.map((l, i) => {
          const v = s?.verdicts[i] ?? null;
          return (
            <button
              key={l.name}
              className={s?.step === i ? "current" : ""}
              onClick={() => {
                setView("stage");
                act({ action: "goto", step: i });
              }}
            >
              <span className="nm">
                <i>{i + 1}</i>
                {l.name}
              </span>
              {v ? <span className={`chip ${v}`}>{RATING_SHORT[v]}</span> : l.hardGate ? <span className="gate">Gate</span> : null}
            </button>
          );
        })}
      </nav>

      <main className="stage">
        {!s ? (
          <p className="empty">Connecting…</p>
        ) : view === "scorecard" ? (
          <Scorecard rows={s.scorecard} onDelete={(i) => act({ action: "deleteRow", index: i })} />
        ) : s.step === LOBBY ? (
          <Lobby
            qr={qr}
            joinUrl={joinUrl}
            useCase={s.useCase}
            onUseCase={(u) => act({ action: "setUseCase", useCase: u })}
            onStart={() => act({ action: "goto", step: 0 })}
          />
        ) : s.step === DECISION ? (
          <DecisionStage
            useCase={s.useCase}
            verdicts={s.verdicts}
            onSave={() => act({ action: "saveToScorecard" })}
            onFix={(i) => act({ action: "goto", step: i })}
          />
        ) : (
          <LensStage
            key={`${s.round}-${s.step}`}
            index={s.step}
            useCase={s.useCase}
            open={s.open}
            verdict={s.verdicts[s.step]}
            counts={snap!.counts}
            onOpen={(open) => act({ action: "setOpen", open })}
            onRecord={(rating) => act({ action: "record", lens: s.step, rating })}
            onCards={(counts) => act({ action: "cards", lens: s.step, counts })}
          />
        )}
      </main>

      <footer className="controls">
        <button className="btn ghost small" disabled={!s || s.step <= LOBBY} onClick={() => s && act({ action: "goto", step: s.step - 1 })}>
          ← Back
        </button>
        <button className="btn small" disabled={!s || s.step >= DECISION} onClick={() => s && act({ action: "goto", step: s.step + 1 })}>
          {s && s.step === LOBBY ? "Start lens 1 →" : s && s.step === LENSES.length - 1 ? "Show decision →" : "Next lens →"}
        </button>
        <button className="btn ghost small" onClick={() => setView((v) => (v === "stage" ? "scorecard" : "stage"))}>
          {view === "stage" ? `Scorecard (${s?.scorecard.length ?? 0})` : "Back to the live vote"}
        </button>
        <span className="spacer" />
        {error && <span className="warn">{error}</span>}
        {snap && snap.storageMode === "memory" && <span className="warn">Test mode: votes aren't saved. Connect Redis before the session.</span>}
        {snap && !snap.keyConfigured && <span className="warn">No PRESENTER_KEY set: anyone can open this screen.</span>}
        <span className="hint">← → move · Space opens or closes voting · S scorecard</span>
        <ResetMenu
          onRestart={() => act({ action: "restartUseCase" })}
          onResetAll={() => {
            setView("stage");
            act({ action: "resetAll" });
          }}
        />
      </footer>
    </div>
  );
}

function Lobby(props: {
  qr: string;
  joinUrl: string;
  useCase: string;
  onUseCase: (u: string) => void;
  onStart: () => void;
}) {
  const [draft, setDraft] = useState(props.useCase);
  const editing = useRef(false);
  useEffect(() => {
    if (!editing.current) setDraft(props.useCase);
  }, [props.useCase]);

  return (
    <div className="lobby">
      <div className="qr-block">
        {props.qr ? <img src={props.qr} alt="QR code to join the vote" /> : <div style={{ width: "40vh", height: "40vh" }} />}
        <span className="url">{props.joinUrl.replace(/^https?:\/\//, "")}</span>
      </div>
      <div className="lobby-copy">
        <p className="eyebrow">Scan to vote · no sign-in</p>
        <h1>Six lenses decide whether a use case goes ahead</h1>
        <p className="sub">
          We'll test one real idea live. For each lens, vote Pass, Pass with conditions or Fail on your phone.
        </p>
        <form
          className="field"
          onSubmit={(e) => {
            e.preventDefault();
            editing.current = false;
            props.onUseCase(draft.trim());
          }}
        >
          <label htmlFor="usecase">Use case we're qualifying</label>
          <input
            id="usecase"
            value={draft}
            placeholder="e.g. Turn one campaign brief into social posts for three channels"
            onFocus={() => (editing.current = true)}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              editing.current = false;
              if (draft.trim() !== props.useCase) props.onUseCase(draft.trim());
            }}
            maxLength={140}
          />
        </form>
        <div>
          <button
            className="btn"
            onClick={() => {
              if (draft.trim() !== props.useCase) props.onUseCase(draft.trim());
              props.onStart();
            }}
          >
            Start with lens 1: Viability →
          </button>
        </div>
      </div>
    </div>
  );
}

function LensStage(props: {
  index: number;
  useCase: string;
  open: boolean;
  verdict: Rating | null;
  counts: { phones: Counts; cards: Counts };
  onOpen: (open: boolean) => void;
  onRecord: (r: Rating | null) => void;
  onCards: (c: Counts) => void;
}) {
  const l = LENSES[props.index];
  const c: Counts = {
    pass: props.counts.phones.pass + props.counts.cards.pass,
    cond: props.counts.phones.cond + props.counts.cards.cond,
    fail: props.counts.phones.fail + props.counts.cards.fail,
  };
  const n = total(c);
  const max = Math.max(1, c.pass, c.cond, c.fail);
  const room = majority(c);

  return (
    <div className="lens-stage">
      <section className="lens-copy">
        <div className="meta">
          <span className="eyebrow">
            Lens {props.index + 1} of {LENSES.length}
          </span>
          {l.hardGate && <span className="gate">Hard gate</span>}
        </div>
        {props.useCase && (
          <p className="usecase-line">
            Qualifying: <b>{props.useCase}</b>
          </p>
        )}
        <h1>{l.name}</h1>
        <p className="q">{l.question}</p>
        <p className="test">
          <b>Test</b> {l.test}
        </p>
        <p className="ask">
          <b>Ask</b>
          {l.prompt}
        </p>
      </section>

      <section className="results" aria-live="polite">
        <div className="results-head">
          <span className={`status ${props.open ? "" : "closed"}`}>
            <span className={`dot ${props.open ? "" : "off"}`} />
            {props.open ? "Voting open" : "Voting closed"}
          </span>
          <span className="total num">
            <b>{n}</b> {n === 1 ? "vote" : "votes"}
          </span>
        </div>

        {RATINGS.map((r) => (
          <div key={r} className={`bar ${r}`}>
            <span className="lbl">{RATING_LABEL[r]}</span>
            <span className="track">
              <span className="fill" style={{ width: `${(c[r] / max) * 100}%`, display: "block" }} />
            </span>
            <span className="v num">
              {c[r]}
              <small>{n ? Math.round((c[r] / n) * 100) : 0}%</small>
            </span>
          </div>
        ))}

        <div className="verdict-row">
          <span className="lbl">
            {props.verdict ? "Recorded:" : room ? `Room says ${RATING_LABEL[room]}. Record:` : "Record:"}
          </span>
          <span className="seg" role="group" aria-label="Record the verdict">
            {RATINGS.map((r) => (
              <button key={r} className={`${r} ${props.verdict === r ? "on" : ""}`} onClick={() => props.onRecord(props.verdict === r ? null : r)}>
                {RATING_SHORT[r]}
              </button>
            ))}
          </span>
          <button className="btn ghost small" onClick={() => props.onOpen(!props.open)}>
            {props.open ? "Close voting" : "Reopen voting"}
          </button>
        </div>

        <CardsPanel cards={props.counts.cards} onChange={props.onCards} />
      </section>
    </div>
  );
}

function CardsPanel({ cards, onChange }: { cards: Counts; onChange: (c: Counts) => void }) {
  const [draft, setDraft] = useState<Counts>(cards);
  const latest = useRef<Counts>(cards);
  const focused = useRef(false);
  const sent = useRef<string>(JSON.stringify(cards));

  // Take the server's numbers only while nobody is typing in the panel.
  useEffect(() => {
    if (focused.current) return;
    latest.current = cards;
    setDraft(cards);
  }, [cards]);

  const commit = () => {
    const key = JSON.stringify(latest.current);
    if (key === sent.current) return;
    sent.current = key;
    onChange(latest.current);
  };
  return (
    <div
      className="cards-panel"
      onFocus={() => (focused.current = true)}
      onBlur={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return; // moving between boxes
        focused.current = false;
        commit();
      }}
    >
      <span>Add cards held up in the room:</span>
      {RATINGS.map((r) => (
        <label key={r} className={`stepper ${r}`}>
          <span>{RATING_SHORT[r]}</span>
          <input
            id={`cards-${r}`}
            type="number"
            min={0}
            inputMode="numeric"
            className="num"
            value={draft[r]}
            onChange={(e) => {
              const next = { ...latest.current, [r]: Math.max(0, parseInt(e.target.value || "0", 10) || 0) };
              latest.current = next;
              setDraft(next);
            }}
            onKeyDown={(e) => e.key === "Enter" && commit()}
          />
        </label>
      ))}
    </div>
  );
}

function DecisionStage(props: {
  useCase: string;
  verdicts: (Rating | null)[];
  onSave: () => void;
  onFix: (i: number) => void;
}) {
  const d = decide(props.verdicts);
  return (
    <div className="decision">
      <div className="side">
        <p className="eyebrow">{props.useCase ? `Decision · ${props.useCase}` : "Decision"}</p>
        <div className="lens-verdicts">
          {LENSES.map((l, i) => {
            const v = props.verdicts[i];
            return (
              <div key={l.name}>
                <span>
                  {i + 1}. {l.name}
                  {l.hardGate && <span className="gate">Gate</span>}
                </span>
                {v ? (
                  <span className={`chip ${v}`}>{RATING_LABEL[v]}</span>
                ) : (
                  <button className="btn ghost small" onClick={() => props.onFix(i)}>
                    Not rated · go back
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="side">
        {d ? (
          <>
            <div className={`outcome ${d.outcome}`}>
              <p className="eyebrow">The room's decision</p>
              <h2>{d.label}</h2>
              <p>{d.reason}</p>
            </div>
            <div>
              <button className="btn" onClick={props.onSave}>
                Save to scorecard and qualify another idea
              </button>
            </div>
          </>
        ) : (
          <div className="incomplete">Record a verdict on every lens to see the decision. Unrated lenses are marked on the left.</div>
        )}
      </div>
    </div>
  );
}

function Scorecard({ rows, onDelete }: { rows: ScoreRow[]; onDelete: (i: number) => void }) {
  return (
    <div className="score-wrap">
      <h1>Your qualification scorecard</h1>
      {rows.length === 0 ? (
        <p className="empty">No use cases saved yet. Finish a decision and save it to add the first row.</p>
      ) : (
        <div className="table-scroll">
          <table className="score">
            <thead>
              <tr>
                <th>Use case</th>
                {LENSES.map((l) => (
                  <th key={l.name}>{l.name}</th>
                ))}
                <th>Decision</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.at}>
                  <td className="uc">{r.useCase}</td>
                  {r.verdicts.map((v, j) => (
                    <td key={j}>
                      <span className={`chip ${v}`}>{RATING_SHORT[v]}</span>
                    </td>
                  ))}
                  <td>
                    <b>{OUTCOME_LABEL[r.outcome]}</b>
                  </td>
                  <td>
                    <RemoveButton onConfirm={() => onDelete(i)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RemoveButton({ onConfirm }: { onConfirm: () => void }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button className="btn ghost small" onClick={() => (armed ? onConfirm() : setArmed(true))}>
      {armed ? "Click again to remove" : "Remove"}
    </button>
  );
}

function ResetMenu({ onRestart, onResetAll }: { onRestart: () => void; onResetAll: () => void }) {
  const [armed, setArmed] = useState<null | "restart" | "all">(null);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(null), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <>
      <button
        className="btn ghost small"
        onClick={() => {
          if (armed === "restart") {
            setArmed(null);
            onRestart();
          } else setArmed("restart");
        }}
      >
        {armed === "restart" ? "Click again to discard votes" : "Restart this use case"}
      </button>
      <button
        className="btn ghost small"
        onClick={() => {
          if (armed === "all") {
            setArmed(null);
            onResetAll();
          } else setArmed("all");
        }}
      >
        {armed === "all" ? "Click again to clear everything" : "Reset session"}
      </button>
    </>
  );
}

function KeyGate({ onSubmit }: { onSubmit: (k: string) => void }) {
  const [v, setV] = useState("");
  return (
    <div className="keygate">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (v.trim()) onSubmit(v.trim());
        }}
      >
        <img src="/sitecore-logo.svg" alt="Sitecore" />
        <h2 style={{ fontSize: 24 }}>Presenter screen</h2>
        <label htmlFor="key">Presenter key</label>
        <input id="key" type="password" value={v} onChange={(e) => setV(e.target.value)} autoFocus />
        <p style={{ fontSize: 14, color: "var(--ink-2)" }}>Enter the PRESENTER_KEY you set in Vercel. A wrong key brings you back here.</p>
        <button className="btn" type="submit">
          Open the presenter screen
        </button>
      </form>
    </div>
  );
}
