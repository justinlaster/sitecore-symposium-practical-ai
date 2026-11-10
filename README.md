# Six-lens vote

Live audience voting for the **Practical AI and agent use-case qualification** session.
Attendees scan a QR code and vote Pass, Pass with conditions or Fail on each of the six lenses.
No sign-in is needed. The presenter screen shows results live, applies the hard-gate rule, and
builds the scorecard as you go.

| Page | Who | What it does |
|---|---|---|
| `/` | Audience, on their phones | Shows the current lens and three vote buttons. Follows the presenter automatically. |
| `/present` | You, on the big screen | QR code, live result bars, verdicts, the decision and the scorecard. Needs the presenter key. |

## Deploy to Vercel (about 10 minutes)

1. **Put the code on GitHub.** Create a new repository and push this folder to it.
2. **Import it in Vercel.** Go to vercel.com, choose **Add New… → Project**, and pick the repository.
   Vercel detects Next.js. Leave the build settings as they are.
3. **Add storage.** In the project, open **Storage → Create Database → Upstash for Redis** (from the
   Marketplace), and connect it to the project. This adds `KV_REST_API_URL` and `KV_REST_API_TOKEN`
   for you. Without Redis, votes are lost, and the presenter screen shows a "Test mode" warning.
4. **Set the presenter key.** Under **Settings → Environment Variables**, add
   `PRESENTER_KEY` with a password only you know.
5. **Redeploy** (Deployments → ⋯ → Redeploy) so the new variables take effect.
6. Open `https://<your-app>.vercel.app/present?key=<your key>` on the presenting laptop. The key is
   remembered on that laptop and removed from the address bar, so it doesn't show on the projector.

Optional variables:

- `SESSION_ID`: change it (for example `symposium-day2`) to start a clean session without deleting anything.
- `NEXT_PUBLIC_SESSION_TITLE`: the title in the presenter header. Redeploy after changing it.

A custom domain (Settings → Domains) makes the join address on screen much easier to type than a `vercel.app` one.

## Running the session

1. **Lobby.** The big QR code is on screen. Type the use case you'll qualify (for example a volunteer's idea), then **Start**.
2. **Each lens.** Voting opens automatically. Ask the question shown in the purple bar, let people vote,
   then record the verdict. The room's majority is suggested, and you can override it with
   Pass / Conditions / Fail. A tie goes to the more cautious rating.
   If you move on without recording, the majority is recorded for you.
3. **Cards in the room.** If you're also using printed red/amber/green cards, type the counts into
   "Add cards held up in the room". They're added to the phone votes.
4. **Decision.** After lens 6, **Show decision** applies the deck's rule:
   - Any Fail on governance, data or brand safety (the hard gates) → **Park**
   - Any other Fail → **Park** until that gap has an owner and a date
   - All Pass → **Build now**
   - Otherwise → **Pilot with conditions**
5. **Save to scorecard** stores the row and returns to the lobby for the next idea. Press **S** to show the scorecard.

Keyboard: **→ / ←** move between steps (a presentation clicker works too), **Space** opens or closes voting, **S** toggles the scorecard.

**Restart this use case** discards the current votes. **Reset session** clears everything, including the scorecard.
Both buttons need a second click within 3 seconds.

## Before the day

- Open `/` on your own phone and `/present` on the laptop, and run one dummy use case end to end.
  Then press **Reset session**.
- Check the venue Wi-Fi or mobile signal in the room. If it's poor, use the printed cards and type the counts in.
- Load: phones poll every 2.5 seconds and Vercel's edge cache serves most of those requests, so a room
  of a few hundred people is fine. Votes go to Redis (two commands each), which is well within
  Upstash's free tier for a 45-minute session.

## Run it locally

```bash
npm install
cp .env.example .env.local   # set PRESENTER_KEY; Redis optional locally
npm run dev
```

Open http://localhost:3000/present?key=change-me and http://localhost:3000 in a second window.
Without Redis, votes are kept in memory. That's fine for a rehearsal on one machine, but not for Vercel.

## Changing the content

The lens names, questions, tests and presenter prompts are in `lib/lenses.ts`. The decision rule is in
`lib/decision.ts`. Colours and type are at the top of `app/globals.css` and follow the session deck's theme.
