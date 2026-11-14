# KR7Tech StudyGuide

## Commercial website and GoDaddy hosting

The storefront leads to Free, Go (INR 750 offer) and Pro (INR 2,500 offer), with account-linked
one-time checkout. `Purchase.html` shows private recent purchase history and
checks actual payment plus entitlement state rather than trusting a redirect.
Account signup/login preserves an allowlisted checkout or purchase return.
Existing paid access cannot be bought again; buying Pro from Go is a separate
full-price purchase, explicitly disclosed on the plans page.

Production sales are closed unless `SALES_ENABLED=true` and a valid
`SUPPORT_EMAIL` are configured. Provider settings and a working account backend
are still required. Review the customer Terms, Privacy and payment/refund pages
for your real business before enabling sales. Coaching, certificates, AI and
compiler services must not be represented as operational without their setup.

`npm run build` checks the regular Node host; `npm start` runs it on the assigned
`PORT`. `npm run package:godaddy` creates the private source upload at
`.godaddy\kr7tech.zip`, excluding secrets, local accounts, dependencies and tests.
`npm run build:vercel` remains the separate Vercel deployment builder.
See the repository-root `godaday.md` for native GoDaddy Node.js Hosting,
MongoDB Atlas, domain, signed webhook and launch instructions. Node.js 22 and 24
are supported; the existing Vercel configuration selects 24.

KR7Tech is a learning and interview-preparation platform for students,
beginners, working engineers, and senior professionals. The homepage presents
offering summaries and links for Student, Expert, Concepts, 1:1 coaching,
AI interviews, interview preparation, subject learning, and Pro access. It
does not claim to sell live cohorts or separate courses until schedules,
pricing, and enrollment are configured.

## MongoDB username/password accounts

`Account.html` provides **Create account**, **Already have an account? Login**,
sign-out, a role-based dashboard, and administrator access allocation.
Usernames and salted scrypt password hashes persist in MongoDB; readable
passwords are never stored. Set `AUTH_PROVIDER=mongodb` and privately configure
MongoDB, `PUBLIC_APP_URL` and `AUTH_OTP_SECRET` using `.env.example`.
Passwords require 15-256 characters. Username-only accounts do not yet have
email password recovery. Create account and Login ask only for a username and
password: no email, OTP, role selection, or separate Admin login.
Already-signed-in legacy users can add username/password login to the same account.
Google sign-in is disabled in this mode. Student and Expert are learning
roles, not paid plans; the 50% INR offer is Go Rs 750 and Pro Rs 2,500 one-time.
Only the server can assign administrator access or activate paid content.

MongoDB stores usernames, salted password hashes, hashed expiring
cookie sessions, roles, entitlements, pending/verified payments, and AI usage.
The existing Supabase backend remains available with `AUTH_PROVIDER=supabase`;
switching providers does **not** migrate existing accounts or purchases.
See the MongoDB section in `DEPLOYMENT.md` before switching a live site.

The same Node.js server runs on Render and Vercel. Vercel uses a generated
single-function deployment; Render runs the server directly. See
[DEPLOYMENT.md](DEPLOYMENT.md) for dashboard settings, environment variables,
and release checks. Bundled subject/company Q&A, experience questions, React
challenges, concept outlines and guide previews remain available when the
database is missing or unavailable. A failed account/entitlement check never
grants paid access: only public previews and valid item-scoped PIN grants are
available until verification recovers. Account creation, payments and AI usage
still require their configured working backend; they do not fall back to files.

`System-Design.html` teaches the end-to-end design process through one
marketplace case study. `Amazon-Design.html` is the companion detailed HLD/LLD
deep dive.

`How AI work.html` is the AI learning guide. It explains a step-by-step path
from a basic model call to RAG and a bounded tool-using agent, with provider
choices for OpenAI, Claude, OpenRouter, Ollama, and Microsoft Foundry. Its
examples keep provider keys server-side and call out provider API compatibility
and evaluation/security requirements. The guide also includes a daily email,
calendar, and task assistant example with a bounded read-only agent loop,
reviewable draft workflow, and a separate explicit-approval send boundary. A
new LLM-internals section explains prompt assembly, tokenization, Transformer
attention, next-token decoding, prefill versus generation latency, KV caching,
model speed/reasoning trade-offs, and ways to evaluate answer quality. “Astra”
is treated as an ambiguous model label; exact provider/version details are
needed for product-specific performance claims.

`C#Dotnet.html` contains 169 C#/.NET interview questions plus 18 in-depth
walkthroughs. They follow an ASP.NET Core order request through compilation,
middleware, dependency injection, async I/O, EF Core, database execution,
managed memory, and outbound HTTP, then dig into type semantics, delegates,
API security, transaction/concurrency behavior, the outbox pattern, backpressure,
testing boundaries, modular architecture, and production diagnostics. The server
also appends 160 Pro interview/concept exercises without changing those previews.

`Dotnet-Roadmap.html` is a 365-day C#/.NET curriculum with a daily 2–4 hour
routine, 52 weekly outcomes, beginner foundations, professional backend and
cloud engineering, hands-on capstone work, and senior-level leadership,
incident, project-story, and mock-interview preparation. Daily checkmarks are
stored in the current browser on the current device only.

`Interview-Studio.html` is linked from Training and the .NET roadmap. It
contains five self-guided practice labs: a .NET idempotency/debugging review,
a SQL query/index checklist, staged system-design coverage review, a branching
production-incident simulation, and a truthful senior project-story builder.
User-entered notes and progress remain in browser-local storage; the SQL
checklist does not execute queries, and the studio does not guarantee
interview outcomes.


## Protected company interview question bank

The Company Interviews library has ten free questions in total, not ten
per company or filter. Subject Q&A has ten free questions per selected subject,
and original concept guides have ten free lessons per guide. Later items require a
resource-specific PIN grant or verified paid Pro access. A persistent Pro
control is available across learning pages. Question answers are stored server-side in Supabase or the
private project seed bank, not in public HTML or browser JavaScript:

- L1, L2, and L3 entitlements do not unlock paid question answers.
- Paid Pro unlocks all questions beyond the applicable ten-item preview.
- Razorpay and Stripe charge INR. PayPal prices must be explicitly configured
  in USD; no currency conversion is assumed.
- Access changes only after the backend validates a provider-signed webhook
  and matches the confirmed amount, currency, user, tier, and pending purchase.
- Administrators can grant or revoke a user's tier in the question page.

## Courses, interest lists, feedback, and guided help

`Courses.html` organizes only concept explanations into named course paths,
using the public `/api/concepts` outlines and category deep links into
`Concepts.html`. It does not load an interview bank or send learners to mixed
legacy guides as course lessons. It links to the existing one-time Pro checkout, not a second course
purchase. `Membership.html` compares Free and Pro, including the stated
Pro coaching, completion certificate, and runner benefits with their availability
limitations. No competitor's content, testimonials, prices,
credentials, access durations, or refund promises have been copied.

Twenty original scenario-based C# questions are appended by
`npm run build:questions` from `api/_csharp-practice.js`. They remain in the
private server bank after the unchanged first ten free subject questions.

`api/_interview-practice.js` includes 128 original Pro questions with
named concepts, explanations, and worked examples across all 16 subjects:
20 C#/.NET, 12 ASP.NET Core, 8 EF Core, 8 LINQ, 20 Microservices, 20 SQL,
and 4 each for the other ten subjects. It also appends 240 original core/scenario
questions from `api/_interview-core.js`: 20 each for C#/.NET, ASP.NET Core,
EF Core, LINQ, Microservices, and SQL, plus 12 each for the other ten subjects.
The private bank now contains 1,476 subject entries (160 free / 1,316 Pro)
and a separate 96-entry company bank. These are preparation resources, not a
measured 70-80% coverage or interview-success guarantee.
Run `npm run build:questions` after editing these sources.
All existing subject entries retain their order; additions
follow them and do not become free previews. SQL examples are SQL Server/T-SQL
where provider-specific behavior is discussed.

Related exercises are appended server-side to the protected .NET, roadmap,
system-design, marketplace, project, Azure/CI/CD, and DSA guides. The original
guide extraction remains separate so regeneration does not duplicate these
entries or infer extra subject classifications. A visitor receives placeholders
only; each question or guide item still needs its own PIN grant, unless the
viewer has verified paid Pro access.

## Separate Concepts NEW and DSA practice

`Concepts.html` is a distinct teaching library, not the interview Q&A renderer.
It contains 146 standalone lessons in 14 categories, including 14 .NET lessons,
17 Microservices lessons, 34 System Design lessons, and 10 SQL lessons. Thirty additional deep
dives expand C#, EF Core & LINQ, SQL, Azure, Angular, AI, JavaScript / TypeScript,
DevOps, Identity & Security, Testing, and DSA. Another 24 guided explanations
give AI and DevOps 17 lessons each. AI covers LangChain composition, retrieval,
tools, and memory plus LangGraph state, routing, checkpoints, approval, streaming,
and a bounded capstone. DevOps has a 12-step foundation-to-operations sequence.
Another 32 explanation lessons cover six Redis topics (data modeling, cache-aside
races, expiry/eviction, atomic work, replication, and leases/fencing), five database
concurrency topics, five microservices implementation/recovery topics, eight HLD
lessons, and eight LLD lessons. Worked HLDs include enterprise architecture,
e-commerce, ticket booking, payments, chat, feeds, file storage, and search.
LLD covers SOLID/composition, pattern selection, domain models, state machines,
EF Core persistence boundaries, parking allocation, pricing, and job scheduling.
Examples are educational design fragments, not production deployments or a claim
that every enterprise scenario is covered.
Both Courses and Concepts
use matching blue NEW badges. Lessons include what/why/how explanations,
mental-model flows, worked examples, revision cheat sheets, pitfalls, exercises,
and official further reading. Category filters and search use public outlines only.
Full lessons live privately in `api/_concept-lessons.js` and its appended
`api/_concept-advanced.js`, `api/_concept-deep-dives.js`, `api/_concept-guided.js`,
and `api/_concept-enterprise.js`
modules; `/api/concepts`
returns metadata unless one selected lesson is authorized by paid Pro or a
single-use `concept:<id>` PIN grant. Closing, changing category/search, or leaving
the page removes the opened lesson. No full lessons are bundled in public scripts.
Category links such as `Concepts.html?category=SQL` open the matching lesson
outlines; category changes and browser history relock opened PIN content.
`concept-paths.js` contains public prerequisites, goals, and reading-order IDs,
never full teaching text. All 14 course outlines use numbered learning order;
selecting a concept category shows that same path and links to lesson outlines.
Guided lesson bodies additionally contain ordered practical steps after their
how-it-works explanation. Path links do not unlock or prefetch full lessons.
Python examples describe separate learning environments; no LangChain/LangGraph
runtime or model subscription is added to the website. Provider calls, persistent
checkpointers, cloud resources, and deployment still need explicit configuration.
The original mixed deep-dive guide links now live in the Interview Q&A reference
section, not Courses or the concept lesson catalog. Existing guide URLs, source
content, question IDs, previews, and bookmarks are preserved.

`learning-sections.js` renders consistent, professional sticky-note-style section
cards across Home, Courses, Concepts, Subjects, and Interview Q&A. `Subject-QA.html`
is the interview hub: all 16 subject banks, company and experience practice,
coding interviews, the DSA/compiler entry, and the original reference banks are
organized there. Subject note cards contain navigation metadata only; no question
bank is fetched until a subject is chosen.

The DSA path reuses `DSA.html` and its 50-problem C#/Python/Java workspace.
Compiler execution still requires Pro utility authorization and a configured
`JUDGE0_API_URL`; the UI reports missing configuration instead of pretending to
execute. `/api/config` exposes only a configuration boolean, not compiler secrets.
A selected concept/question PIN does not authorize the full workspace or execution.
Code is submitted to the configured provider only when the learner clicks Run.

`Newsletter.html` and `Masterclass.html` register separate interest lists;
they do not send email or confirm a booking. `Feedback.html` accepts private
feedback. `Courses.html` displays only owner-approved comments with explicit
publication consent, without claiming verified purchases or job outcomes.
`Privacy.html` describes these forms and the optional chat contact request.

To open submissions:

1. Apply `supabase/community.sql` after the existing schema, using the
   Supabase SQL Editor. Its tables and rate-limit function are server-only.
2. Set `SUPABASE_URL`, the legacy `SUPABASE_SERVICE_ROLE_KEY`,
   `PUBLIC_APP_URL`, a real public `SUPPORT_EMAIL`, and a private
   `COMMUNITY_FORM_SECRET` of at least 32 characters. Render generates that
   secret automatically; set it privately on Vercel. No Google setup is needed.
3. Use Supabase's Table Editor to review interest and contact requests.
   Feedback starts with `approved=false`; publish only records with
   `consent_public=true` after genuine moderation. Do not fabricate reviews.

Without this setup, forms clearly remain disabled and APIs reject writes.
Submissions require explicit consent, same-origin POSTs, bounded validated
fields, and a shared database-backed limit of five requests per network
fingerprint per hour. Duplicate interest registrations are ignored. Feedback
and contact requests use request IDs to avoid duplicates on retries. Email
addresses and mobile numbers are never returned by the public feedback API.
Support requests and newsletter delivery are not automatically processed;
the owner must handle follow-up and arrange any future email publishing.

Every page using `pro-access.js` receives the bottom-corner guided-help
widget. Only its predefined question buttons produce FAQ answers; there is
no free-text question box or AI call. A selected answer appears after a
2-second typing indicator. The launcher and widget are titled "AskKR7Tech" with a
small automated-support disclosure. Slow price configuration does not delay
the reply; unavailable prices are not guessed. Answers use the current server Pro price and
honestly describe unavailable checkout, masterclass, and newsletter services.
An optional name/email/mobile form records a consented owner-follow-up
request; it is not required for FAQs and never grants Pro or starts payment.
Do not treat this guided widget as a staffed live support channel.

## Google account sign-in (OAuth 2.0 with PKCE)

The homepage links to the account section. Google sign-in buttons are available
on `Company-Interviews.html` and `Membership.html`. They reuse existing Supabase
accounts, the saved session, and the server-verified session cookie. Signing
in with Google does not grant Pro, bypass the per-item PIN, start a payment,
or upload browser-local learning progress.

Social OAuth is included in Supabase's Free plan; its published allowance on
November 12, 2026 is 50,000 monthly active users. Other hosting, database,
bandwidth, or paid-plan usage may have separate costs. Pricing reference:
`https://supabase.com/pricing`.

Owner setup is required before real Google accounts can sign in:

The local configuration now points to project `zhzcmykfzeooadngrnyc`:
`https://zhzcmykfzeooadngrnyc.supabase.co`. The supplied `/rest/v1/` address
is the Data API endpoint, not the base URL expected by `SUPABASE_URL`.
`npm start` loads the ignored `StudyGuide/.env.local` in development.
Add your publishable/legacy anon key and server-only legacy `service_role`
key there privately; the placeholders are intentionally empty. The existing
REST client uses the legacy service-role JWT, not an `sb_secret_` key. Existing
environment variables take precedence, and production does not load this file.
Use the hosting provider's environment settings in production.
`.env.example` contains the non-secret setup template.

For this project, Google's authorized redirect URI is
`https://zhzcmykfzeooadngrnyc.supabase.co/auth/v1/callback`.
Creating the project URL alone does not enable Google sign-in.

1. Configure the existing `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
   `SUPABASE_SERVICE_ROLE_KEY` on the server and apply the existing Supabase
   schema. Set `PUBLIC_APP_URL` to the exact website origin. Locally this
   preview uses `http://127.0.0.1:10000`; production must use HTTPS.
2. In Google Auth Platform, configure your app's branding and audience, then
   create an OAuth client with type **Web application**. Request only
   `openid`, `email`, and `profile`; this integration does not request Gmail,
   Drive, Calendar, or offline Google API access.
3. In Supabase, open **Authentication > Sign In / Providers > Google**.
   Copy its callback URL into Google's **Authorized redirect URIs**. For a
   hosted project this is `https://<project-ref>.supabase.co/auth/v1/callback`,
   NOT the KR7Tech callback page. Add your website origin under Google's
   authorized JavaScript origins.
4. Put the Google **Client ID and Client Secret in the Supabase Google
   provider settings**, then enable and save that provider. Never put the
   client secret, service-role key, or real credentials in HTML, JavaScript,
   source control, or chat.
5. Under Supabase **Authentication > URL Configuration**, set the Site URL
   to your website origin. Add
   `http://127.0.0.1:10000/Auth-Callback.html?state=*` to Redirect URLs for
   this local preview, and the equivalent HTTPS URL for production. The
   query wildcard permits the random state value, not arbitrary domains or
   return pages. Open the exact configured hostname; `localhost` and
   `127.0.0.1` are different origins.
6. During Google's Testing mode, add your own test accounts as test users.
   Before accepting students publicly, configure the appropriate external
   audience and publishing status and provide accurate privacy/terms URLs
   required by Google. Follow any verification requirements Google displays.
7. Restart the website after environment changes. The button enables only
   when `/api/google-auth` confirms that the Supabase Google provider is
   enabled. Missing setup keeps Google sign-in disabled with an explanation,
   while free previews and configured PIN access remain usable.

The server generates a fresh PKCE verifier and browser-bound state in a
five-minute HttpOnly, SameSite=Lax cookie (`__Host-`/Secure on HTTPS).
Only same-origin POSTs can start or complete sign-in. The callback removes
the authorization code/state from browser history, exchanges the code on the
server, verifies the resulting account through `/api/session`, and returns
only to the account section or Membership page. Google provider tokens are
not retained. Existing session storage is reused for checkout and API access;
browser storage must be allowed. Failed/cancelled sign-in does not grant access.

Provider instructions: `https://supabase.com/docs/guides/auth/social-sign-in/auth-google`.
The locally hosted Google button image is Google's pre-approved light
rectangle asset from `https://developers.google.com/identity/branding-guidelines`;
the image is unmodified, scaled with its aspect ratio preserved.

## Deploying on Render or Vercel

Follow [DEPLOYMENT.md](DEPLOYMENT.md). No cloud deployment, Git push, or
paid resource creation is performed by preparing these files.

The repository-root `render.yaml` defines a Render web service whose
`rootDir` is `StudyGuide`. The project-level `server.js` adapts the existing
Vercel-style API handlers, serves public assets, and preserves protected guide
rewrites and raw payment webhook bodies. In Render, create a Blueprint from
the repository. Optional integrations are intentionally not required by the
Blueprint; add their credentials privately when enabling them.
Set `PUBLIC_APP_URL` to the final HTTPS Render URL. Add payment
provider webhook URLs under `/api/webhooks/stripe`,
`/api/webhooks/razorpay`, or `/api/webhooks/paypal` as applicable. Keep all
credentials in Render's environment settings; do not commit them to the repo.
The local testing PIN endpoint is disabled in production.

For local visual testing only, start `npm start` with
`NODE_ENV=development`, `LOCAL_PRO_ACCESS_ENABLED=true`,
`LOCAL_PRO_ACCESS_PIN` set to the test PIN, and `LOCAL_PRO_ACCESS_SECRET` set
to a fresh random value of at least 32 characters. On localhost, an "Unlock
Pro" button then asks for the PIN separately for each protected item.
Only that question or lesson opens; other topics and items remain locked.
This route is disabled on production deployments and
non-local hosts; do not add these settings to Vercel deployment environments.
Subject and company Q&A can use the bundled project questions without Supabase.
Account sign-in, paid entitlements, and database editing still need Supabase.

When the normal `PRO_ACCESS_PIN` is not configured, the same Pro buttons can
use `/api/local-pro-access` on a configured localhost development server.
This supports a temporary short testing PIN without changing the production
PIN length requirement. Keep the testing PIN and signing secret in the server
environment only; the fallback remains unavailable on production/non-local hosts.

The deployed Vercel application protects the guide pages listed in
`vercel.json`. Visitors receive ten free questions/lessons per guide and
blurred generic Pro placeholders. Premium titles, answers, and data scripts
are withheld by the server, not simply hidden with CSS. Verified Pro members
receive the original complete guide with its interactions.
Browser copy blocking reduces copying but does not replace server authorization
or absolute source secrecy. The Company Interview page also uses server-side
question delivery so answers never ship as premium browser source.

The DSA practice page's C#, Python, and Java runner uses a server-side Judge0
proxy. Configure `JUDGE0_API_URL` with the HTTPS base URL of the Judge0 instance
and optionally set `JUDGE0_API_TOKEN`. Only signed-in Pro users can submit or
poll code. Source, stdin, and expected output are sent to that compiler service
only after Run is selected; do not submit secrets or personal data.

The React machine-coding practice page contains 30 challenges. The first ten
in the ordered bank are free previews; locked titles, prompts, and answers are not returned
to non-Pro browsers. The list shows blurred generic Pro placeholders. Full
challenge data is returned only to an active Pro user by
`/api/react-machine-coding`. After applying
`supabase/schema.sql` and `supabase/seed.sql`, also run
`react-machine-coding-seed.sql` in the Supabase SQL Editor.

`Interview-Preparation.html` provides experience-based interview Q&A across 16 subjects:
C#/.NET, ASP.NET Core, EF Core, LINQ, Angular, JavaScript/TypeScript, Azure,
DevOps, SQL, System Design, REST APIs, Microservices, Identity/Security,
Testing, Data Structures/Algorithms, and Behavioral. The bank contains
beginner foundations, mid-level, advanced, and senior/expert questions, with
12-16 question-and-answer examples for every subject. Run
`experience-questions-seed.sql` in the Supabase SQL Editor to create or update
its server-protected table and seed the bank. Choose one subject or "All
subjects" and an experience band. The first ten questions per subject are
available free, sampled across all four experience bands; locked question
titles and answers are not returned to non-Pro browsers. The page shows blurred
generic Pro placeholders, and full question data is returned only by
`/api/experience-questions` after server-side entitlement verification. A
company-preparation filter uses tags for Microsoft, Amazon,
Google, TCS, Infosys, and Accenture. These tags help learners focus their
preparation and are not claims that a named employer asked the exact question.

## Student schedules and Pro PIN access

`Subjects.html` includes searchable/filterable public course metadata for
guides, roadmaps, practice, and interview Q&A. Learners can save subjects,
mark a subject reviewed, and resume the last tracked subject from
`My-Learning.html`. Saved subjects, self-reported reviews, and study-day
activity are stored only in this browser on this device. They do not grant
Pro, verify learning outcomes, or issue certificates.

Subject Q&A links open `Subject-QA.html?topic=...`, which requests and renders
only that subject's questions. Company-focused preparation is a separate
`Company-Interviews.html` section. `/api/questions?topic=...` validates and
filters the requested subject on the server while keeping the same ten-free
preview policy. Omitting the topic retains the company bank's all-topic view.

The private server bank combines the original 216 experience Q&A, representative
company questions, and matching content imported from the existing .NET, Azure,
system-design, marketplace, DSA, architecture, and roadmap guides. The original
ten free questions per subject stay first. Added content stays Pro protected,
and is also merged into configured database-backed subject banks without
replacing their existing previews. Company Interviews retains its separate bank.
Repeated prompts are deduplicated within each subject; a cross-disciplinary
question may legitimately appear in multiple relevant subjects.

Imports retain complete source explanations and available examples. Pro cards
identify concept reviews, coding problems, and guided exercises separately from
interview Q&A, and link to their original protected guide. Curriculum-only stages
and project-inventory summaries are not counted as questions. Existing content
does not provide 100 distinct Q&A for every subject; no duplicate filler is added
to reach a marketing count. Rebuild after changing source guides or SQL seeds
with `npm run build:questions`; deploy the generated `api/_project-questions.js`,
never a public copy of the full bank.

`Membership.html` compares Free, Go and Pro and connects to the existing
`/api/checkout` flow. It displays only server-configured prices and ready
providers, requires a valid saved sign-in session before checkout, and
leaves access activation to backend payment verification. Current checkout
is a one-time payment, not recurring billing. The current Free / Pro comparison
lists protected content, the remote runner, live 1:1 coaching, and course completion
certificates as Pro inclusions, excluded from Free. Runner execution still needs
Judge0 configuration. Owner-arranged coaching and certificate benefits require
published scheduling/session terms and completion/issuance criteria; those details
are pending. No booking or automatic certificate issuance is implemented, and
checkout does not itself deliver either. Item PIN grants remain content-only.
The 50% INR offer charges Go INR 750 (regular 1,500) and Pro INR 2,500
(regular 5,000), both one-time. `api/_pricing.js` controls server INR prices and
offer metadata; checkout ignores client-supplied prices. PayPal's explicit USD
prices are unchanged and excluded from this offer. Existing recorded purchases
keep their amounts; no retroactive refund or upgrade credit is implied.
Microservices includes all 23 GoF object patterns plus distributed-pattern code
labs in the protected concept library. Examples are original independent excerpts;
some require named domain/infrastructure contracts, not production-ready services.
Go includes all subject/company/experience Q&A and frontend
coding interview questions, one AI session per UTC day, and the first two concept
lessons in each category's recommended path. It does not grant full legacy guides,
the compiler, coaching, or certificates. Pro includes all available content and
unlimited AI sessions, subject to configured services and technical request limits.
PayPal readiness is checked separately for `PAYPAL_GO_USD` and `PAYPAL_PRO_USD`,
not legacy L1/L2/L3 prices. Providers are advertised only with a valid return origin and
their required checkout/webhook configuration. PIN unlock remains available.

`Student-Plan.html` creates browser-local self-study schedules from selected
subjects, a start date, duration in calendar months, study days per week,
hours per day, and an optional personal budget. This is not a paid enrollment
or a coaching booking. Pro coaching slots, session terms, and booking details are
not published until the owner configures the actual offering.

The current Pro entry point asks for a PIN. Configure server-only
`PRO_ACCESS_PIN` (8-128 characters; use a long randomly generated value) and
`PRO_ACCESS_SECRET` (at least 32 random characters). No default PIN is shipped.
Set `PUBLIC_APP_URL` to the canonical HTTPS origin on deployed instances.
The browser sends the PIN with the exact selected resource and receives a
two-minute, signed grant. It fetches only that question or sanitized guide
lesson with the `X-Pro-Grant` header. The grant is consumed once per server
instance, and cannot authorize another question, topic, guide, or full bank.
The browser stores neither the PIN nor the grant and never creates a global
PIN session. Closing the item, refreshing, or revisiting the page requires
PIN confirmation again. Paid Pro account entitlements retain full access.
Legacy PIN-cookie endpoints remain compatible with existing tool integrations,
but their cookies no longer authorize full question banks, guides, or guide
data scripts. Changing the PIN or signing secret invalidates unused grants.
PIN access never grants administrator permissions.

`/api/pro-access` limits failed attempts to five per IP per 15 minutes within a
server instance. For a horizontally scaled or serverless public deployment,
configure a shared/edge rate limit and shared consumed-grant nonce store:
both in-memory stores are per instance, so cross-instance replay protection
requires shared storage. Exact-resource scoping and expiration are always
checked. Successful PIN entries do not consume the failed-guess allowance.
Existing paid Pro entitlements remain supported.
Supabase configuration is still needed for database-backed question banks,
Gemini configuration for AI coaching, and Judge0 configuration for remote
compilation. The PIN does not configure these external services.

`AI-Interview.html` provides a voice-enabled mock interview coach backed by
Gemini. Configure `GEMINI_API_KEY` as a server-only Vercel environment variable
and optionally configure `GEMINI_MODEL` (defaults to `gemini-2.5-flash`).
After each answer, Gemini returns a PASS/FAIL learning check based on the
technical correctness and completeness of that answer. It is not a candidate
score or hiring decision. Offline local practice shows a basic format check
only; it does not verify technical correctness.
Each practice session now asks six questions in sequence, adapts follow-ups
based on earlier answers, evaluates every answer (including question six), and
shows a session summary at the end.
Direct `file://` access has a clearly marked non-AI browser exercise only, but is
not a supported deployment mode. Hosted API failures do not silently switch to
simulated coaching. Production always requires a verified signed-in Go or Pro
account, even when `AI_INTERVIEW_ALLOW_ANONYMOUS=true`; PINs do not grant AI access.
Explicit anonymous testing is limited to loopback hosts in non-production mode.
The browser sends the user's answers to the server,
which forwards them to Google Gemini; no audio is sent to Gemini by this
application. Browser speech-recognition providers may process audio under
their own terms. The feature gives practice feedback only and does not rank or
recommend hiring, selection, or rejection. Set provider quota and billing
limits before public deployment.

Apply `supabase/membership-plans.sql` **after** `schema.sql` on both fresh and
existing databases before enabling these plans. This preserves existing payment
and entitlement rows, adds Go to their tier constraints, and installs private
AI session/usage storage and service-role-only RPCs. The backend fails closed if
usage storage is unavailable. It never trusts a client-supplied plan or counter.
Go starts are serialized per user with a PostgreSQL transaction advisory lock;
the daily allowance resets at 00:00 UTC (05:30 India time). A failed start releases
its reservation; a start abandoned before successful completion expires after
the 45-second claim window. Successfully started interviews count even if the
learner closes the page. Pro has no daily session cap. Every session has at most
six answers and a 24-hour lifetime; owned request claims prevent overlapping or
out-of-sequence steps. The table stores no transcript: only user/session IDs,
timestamps, a settings hash, and claim/turn state. Retain usage records according
to the site's published data-retention policy.

Interview Q&A navigation goes to `Subject-QA.html` and fetches no question bank
until a subject is selected. It renders that subject only. Compiler panels,
company material, and mixed original guides are not embedded there; the legacy
reference links now live in `Interview-Preparation.html#interview-reference-guides`.

### 1. Create and configure Supabase

1. Create a Supabase project and enable email/password authentication.
2. In the Supabase SQL Editor, run `supabase/schema.sql`, then
   `supabase/membership-plans.sql`, then `supabase/seed.sql`. The seed is idempotent. The server applies the
   shared preview policy independently of legacy `is_free` seed flags:
   ten company questions in total, or ten per selected subject.
3. Copy the project URL, anon key, and service-role key to Vercel environment
   variables. The service-role key is server-only and must never be added to
   HTML, JavaScript, or a `NEXT_PUBLIC_` variable.
4. Create an initial admin account and set its UUID in `ADMIN_USER_IDS`, or
   grant admin status in the SQL Editor:

   ```sql
   update public.profiles
   set is_admin = true
   where id = 'YOUR-SUPABASE-AUTH-USER-UUID';
   ```

The schema enables RLS and grants table access only to Supabase's server-side
`service_role`. New Supabase Auth users receive a profile row through a
database trigger.

### 2. Configure Vercel

Import this directory as the Vercel project root. Use the **Other** framework
preset, no build command, and `.` as the output directory. Vercel automatically
deploys the functions in `api/`. `.vercelignore` excludes the schema, question
seed, and setup documentation from the deployment.

Set these Vercel environment variables:

| Variable | Purpose |
| --- | --- |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Public Supabase Auth key, used by server and browser |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only database access |
| `PUBLIC_APP_URL` | Canonical HTTPS URL of this Vercel deployment |
| `ADMIN_USER_IDS` | Optional comma-separated Supabase user UUIDs with admin access |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Razorpay checkout credentials |
| `RAZORPAY_WEBHOOK_SECRET` | Secret configured for the Razorpay webhook |
| `STRIPE_SECRET_KEY` | Stripe checkout credential |
| `STRIPE_WEBHOOK_SECRET` | Stripe endpoint signing secret |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | PayPal API credentials |
| `PAYPAL_WEBHOOK_ID` | PayPal webhook ID used for signature verification |
| `PAYPAL_L1_USD`, `PAYPAL_L2_USD`, `PAYPAL_L3_USD`, `PAYPAL_PRO_USD` | Explicit PayPal prices, each formatted like `5.00` |
| `PAYPAL_BASE_URL` | Optional; defaults to PayPal live API. Use the sandbox URL for sandbox credentials. |
| `JUDGE0_API_URL` | HTTPS base URL for the Judge0 compiler service used by the DSA runner |
| `JUDGE0_API_TOKEN` | Optional server-only Judge0 authentication token |
| `GEMINI_API_KEY` | Server-only API key for the Gemini mock-interview coach |
| `GEMINI_MODEL` | Optional Gemini model name; defaults to `gemini-2.5-flash` |
| `AI_INTERVIEW_ALLOW_ANONYMOUS` | Optional; set to `true` only for temporary anonymous testing, `false` to require sign-in |

Checkout is hidden until the corresponding checkout credentials **and**
webhook verification settings are configured. PayPal is enabled only when all
four explicit USD prices are set.

### 3. Register payment webhooks

Register these HTTPS endpoints using the same credentials/environment as the
deployed checkout:

- Razorpay: `/api/webhooks/razorpay`, subscribe to `payment_link.paid`.
- Stripe: `/api/webhooks/stripe`, subscribe to
  `checkout.session.completed` and `checkout.session.async_payment_succeeded`.
- PayPal: `/api/webhooks/paypal`, subscribe to `PAYMENT.CAPTURE.COMPLETED`.

Copy each provider's webhook signing secret or webhook ID to the matching
Vercel variable. The PayPal return endpoint captures the user's own pending
order; only the signed `PAYMENT.CAPTURE.COMPLETED` webhook grants access.
Configure Supabase Auth's site URL and allowed redirect URLs to include the
Vercel domain.

### 4. Verify before launch

- Test preview access, sign-up/sign-in, and each individual L-tier and Pro
  entitlement using provider sandbox/test modes.
- Confirm React machine-coding visitors receive only the ten free challenges,
  while Pro users receive the complete bank.
- Confirm wrong amounts/currencies, invalid signatures, mismatched purchase
  metadata, and duplicate webhook deliveries do not grant extra access.
- Test administrator grant/revoke and re-purchase after revocation.
- Confirm `Company-Interviews.html` and `company-interviews.js` contain no
  premium answers. Never use GitHub Pages or another static-only host for this
  protected question endpoint; static hosting cannot execute the API.

## Learning guide previews and Pro lesson access

Import this directory into Vercel so that Functions, rewrites, and HTTP cookies
can authorize full guide delivery. Visitors without active Pro access receive
a course preview with an upgrade path; the full lesson HTML is sent only after
the server verifies both:

1. a Supabase session cookie created by `/api/session`, and
2. an active `Pro` entitlement in Supabase.

The preview contains course-scope descriptions only, not the underlying lesson
answers or examples. Deploying the HTML directory directly to GitHub Pages
bypasses these checks, so GitHub Pages is not a supported paid-content host.
DevTools and browser-source restrictions can only deter casual copying; the
server boundary prevents unauthorized delivery and remains the authoritative
copy-protection mechanism.

The company question bank contains representative practice prompts, not
official or guaranteed interview questions.
