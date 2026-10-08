<div align="center">

# RAKSHA-BLOCK

### Predict. Optimize. Protect.

**AI-assisted block planning and corridor maintenance coordination for Indian Railways**

**Smart India Hackathon 2026 · Problem Statement SIH26027 · Ministry of Railways**
*AI-Powered Automatic Block Planning to Maximize Asset Availability for Train Operations on Indian Railways*
**Theme: Transportation & Logistics · Category: Software · Team TRIKAAL · Team ID 137710**

*"One shared, risk-ranked, human-approved block plan for Engineering, S&T and TRD."*

[![Live Demo](https://img.shields.io/badge/Live%20Demo-raksha--block--trikaal.vercel.app-0A66C2?style=for-the-badge&logo=vercel&logoColor=white)](https://raksha-block-trikaal.vercel.app/)
[![Prototype Video](https://img.shields.io/badge/Prototype%20Demo-YouTube-FF0000?style=for-the-badge&logo=youtube&logoColor=white)](https://youtu.be/GBNe_w2-eEc)

![SIH 2026](https://img.shields.io/badge/SIH-2026-FF9933?style=flat-square)
![Problem Statement](https://img.shields.io/badge/PS-SIH26027-138808?style=flat-square)
![Status](https://img.shields.io/badge/status-working%20prototype-orange?style=flat-square)
![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-6-646CFF?style=flat-square&logo=vite&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-realtime-3ECF8E?style=flat-square&logo=supabase&logoColor=white)
![OR-Tools](https://img.shields.io/badge/Google%20OR--Tools-CP--SAT-4285F4?style=flat-square&logo=google&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?style=flat-square&logo=python&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=flat-square&logo=docker&logoColor=white)

</div>

---

RAKSHA-BLOCK gives Engineering, S&T, and TRD departments a shared workspace to request track, traffic, and power maintenance blocks. Section Controllers get a single dashboard to review, bundle, approve, and publish coordinated schedules, with a constraint-solver co-pilot that finds safe, non-conflicting combinations.

> **RAKSHA recommends. The Section Controller decides.** No block is granted by the software.

## Quick Links

| | |
|---|---|
| 🌐 **Live demo** | [raksha-block-trikaal.vercel.app](https://raksha-block-trikaal.vercel.app/) |
| 🎬 **Prototype demonstration** (video) | [youtu.be/GBNe_w2-eEc](https://youtu.be/GBNe_w2-eEc) |
| 🎓 **Problem understanding & animated explanation** (video) | [youtu.be/xhBWHfrbTVQ](https://youtu.be/xhBWHfrbTVQ) |
| 📊 **Idea deck** (SIH format) | [📥 Download TEAM TRIKAAL SIH26027 Deck (PDF)](https://github.com/khushhh-14/Raksha_Block_Trikaal/releases/download/v1.0/TEAM_TRIKAAL_SIH26027.pdf) |
| 📘 **Project report** | [📥 Download RAKSHA-BLOCK SIH26027 Report (PDF)](https://github.com/khushhh-14/Raksha_Block_Trikaal/releases/download/v1.0/RAKSHA-BLOCK_SIH26027_Report.pdf) · [Google Drive mirror](https://drive.google.com/drive/folders/1hTTHVlDjegOB918AqDYhyQoiom11IQdL?usp=sharing) |
| 💻 **Source code** | [github.com/khushhh-14/Raksha_Block_Trikaal](https://github.com/khushhh-14/Raksha_Block_Trikaal) |

> **Status: working prototype.** Everything in this repository runs on synthetic data and is not connected to Indian Railways production systems. See [Data Status](#data-status).

## Table of contents

- [The problem and our solution](#the-problem-and-our-solution)
- [Why RAKSHA-BLOCK](#why-raksha-block)
- [What makes it different](#what-makes-it-different)
- [Data Status](#data-status)
- [Key Features](#key-features)
- [How it works (data flow)](#how-it-works-data-flow)
- [Tech Stack](#tech-stack)
- [Feasibility and viability](#feasibility-and-viability)
- [Impact and benefits](#impact-and-benefits)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Available Scripts](#available-scripts)
- [Application Workflow](#application-workflow)
- [Cross-Device Testing](#cross-device-testing)
- [Project Structure](#project-structure)
- [Security Notes](#security-notes)
- [Roadmap Ideas](#roadmap-ideas)
- [References](#references)

## The problem and our solution

| Problem today | RAKSHA-BLOCK's answer |
|---|---|
| **Siloed planning** — Engineering, S&T and TRD each raise block requests separately through BDMS. | **Smart bundling** — CP-SAT merges compatible Engineering, S&T and TRD tasks (same section, date and line, no shared machinery, overlapping windows) into one shared block. |
| **Scattered data** — Defects and overdue work sit in TMS, SMMS and TDMS; corridor availability sits in COA. | **Integration-ready** — Adapters for TMS, SMMS, TDMS and COA with a live source-status panel. |
| **No common priority** — Each department ranks its own work; there is no shared risk measure. | **AI prioritization** — A 0–100 risk score from severity, days overdue, asset age and past failures (LightGBM + SHAP). |
| **Manual coordination** — Planning is decentralized and manual, so overlaps are found late. | **On-demand re-optimization** — The controller re-runs the optimizer on the current pending requests at any time, with a human in the loop: AI recommends; the Section Controller approves, modifies or rejects, with a reason recorded. |

## Why RAKSHA-BLOCK

Coordinating engineering blocks across departments is often a manual process involving paper requests, phone calls, and spreadsheets. This makes it difficult to identify work that could safely share one block window instead of taking the section twice.

RAKSHA-BLOCK digitizes the request, review, approval, execution, and clearance pipeline. Its optimizer proposes bundled windows that can reduce total traffic block time while giving controllers a clear, auditable trail.

## What makes it different

- **Block-as-Resource** — Block time is planned as one shared resource across three departments.
- **Rule-validated** — Every bundle is checked against G&SR safety rules: headway and traction isolation.
- **Live sync** — Requests and decisions update on every officer's device without a page refresh.
- **Raksha-Saarthi AI** — Chat answers from the live board (requests, timetable, capacity).
- **Integration-ready** — Adapters for TMS, SMMS, TDMS and COA with a live source-status panel.

## Data Status

All datasets included with this application are synthetic and simulated. They are provided for demonstration, development, and verification only and are not live Indian Railways production data. Train timetables, corridor capacities, defects, requests, map coordinates, impact estimates, and demo user profiles must not be used for operational railway decisions.

## Key Features

### Department Officers

- Submit structured block requests with section, chainage, line type, work category, machinery, requested date and time, and priority.
- View calculated train-impact estimates, based on the synthetic request and timetable data, including projected passenger delay, rerouted trains, freight delay, and freight trains held.
- Track request status: Pending, Approved, Modified & Approved, Rejected, or Completed.
- Complete post-block safety checkout and clearance.
- Discover shadow-block opportunities where another request could be completed during the same window.

### Section Controllers

- Review pending and active requests from Engineering, S&T, and TRD in one dashboard.
- Approve, modify, or reject requests with a reasoned audit trail.
- Use the AI Co-Pilot for night-shift suggestions, temporary speed restriction attachments, and bundling opportunities.
- Use the AI Optimizer to find compatible request bundles and report the time saved versus running them separately.
- View the day's schedule in an interactive Gantt chart.
- View train paths and active maintenance windows in the interactive string chart.
- Monitor zonal activity on an analytics map populated from synthetic request and corridor data.
- Publish coordinated, multi-department schedules.
- Receive in-app notifications and audio alerts for new or urgent requests.

### Platform-wide

- Optional Supabase realtime synchronization across devices, with five-second polling as a fallback when Supabase credentials and realtime setup are configured.
- Responsive layouts for desktop and mobile control-room devices.
- Zone and division context for Indian Railways zones including NR, WR, CR, ER, and SR, with Northern Railway available in the zone selector.
- CSV exports and PDF report generation.

The frontend is a single-page React application. Department and admin dashboards are different views over the same local or Supabase-backed `block_requests` data. The CP-SAT service in `server/cp_sat_server.py` uses Google OR-Tools to propose bundles with compatible sections, dates, line types, machinery, and adjacent time windows. The ML risk badge uses the ML API when it is running and falls back to a deterministic local calculation when it is unavailable.

## How it works (data flow)

```text
┌──────────────────────────────────────────────────────────────────────┐
│ 1  REQUEST & SYNC                                                    │
│    Login & role check (ENG / S&T / TRD officer)                      │
│    → Submit block request (own department only)                      │
│    → Store in Supabase and push via realtime sync                    │
└───────────────────────────────┬──────────────────────────────────────┘
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 2  AI OPTIMIZATION                                                   │
│    Fetch & prepare data (block requests + train schedule)            │
│    → Merge compatible requests (triples > pairs > singles)           │
│    → Run Google OR-Tools CP-SAT optimizer on pending requests        │
└───────────────────────────────┬──────────────────────────────────────┘
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 3  APPROVE & PUBLISH                                                 │
│    Optimized schedule → Controller decision (human in the loop)      │
│    → Publish & sync to all devices → Safety clearance closes block   │
└──────────────────────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite 6, Tailwind CSS 4 |
| Maps | Leaflet |
| Charts / Gantt | Custom React components |
| PDF / CSV export | jsPDF, html2canvas |
| Authentication | bcryptjs-hashed demo role credentials |
| Realtime data | Supabase PostgreSQL and Realtime |
| Optimization engine | Python and Google OR-Tools CP-SAT |
| Risk scoring | LightGBM + SHAP (CPU-only) |
| Deployment | Vercel (frontend), Docker Compose (full stack) |

## Feasibility and viability

| Dimension | Summary |
|---|---|
| **Technical** | Open-source and CPU-only. OR-Tools CP-SAT and LightGBM/SHAP run on CPU; TMS, SMMS, TDMS and COA adapters feed one schema. |
| **Operational** | Advisory overlay on today's process. Departments request as now; the Controller approves, modifies or rejects. Role-based portals, no change to field protocols. |
| **Economic** | Software only: no trackside hardware or IoT retrofit. Cloud stack cost per division is estimated below 1.5 lakh per year, with zero hardware cost. |
| **Safety** | Safety rules stay with the railway. Premium-train windows are blocked before a bundle is proposed, human approval is recorded with a reason, the Co-Pilot is read-only, and a safety checkout closes each block. |

**Key risks and mitigations**

| Risk | Mitigation |
|---|---|
| Live systems (TMS, SMMS, TDMS, COA) are internal | Synthetic data pilot with a matching schema; pilot read-only export after Railway approval. |
| Solver speed at scale | Measured performance: a 7-day plan optimized in under 2 seconds on CPU; interval model for real-time bundling. |
| Model trained on synthetic outcomes | LightGBM outperforms baselines (ROC-AUC 0.95 on synthetic data); shadow-mode retraining on real failure data. |
| Departments resist a new tool | Common shared queue and shared risk score; Section Controller authority is maintained. |

## Impact and benefits

**Target audience:** Sr. DOM, Section Controllers, Branch Officers (Engineering / S&T / TRD), Track & OHE crews, and passengers & freight users.

| Benefit | Illustrative result | What it means |
|---|---:|---|
| Fewer protection set-ups | **−18%** | Fewer separate blocks means fewer repeated protection set-ups for track and OHE crews. |
| Fewer possession hours | **−12%** | More of each night stays free for train paths. |
| Less train disruption | **−15%** trains touched | Fewer block windows overlap trains, so fewer regulated trains. |

> These figures come from an **illustrative synthetic scenario**, not from real Indian Railways operations. All three departments see one queue and one risk score, and requests, approvals and clearances are recorded digitally with PDF/CSV export.

## Getting Started

### Prerequisites

- Node.js 18 or later and npm
- Python 3.10 or later and pip

### Installation

```bash
npm install
pip install -r requirements.local.txt
```

### Run All Local Services

For the SIH 2026 demo sequence, copy `.env.example` to `.env.local`, fill in the Supabase anon key, and run the platform launcher:

```bash
./run_system.sh
```

On Windows, run `run_system.bat`. The frontend opens on `http://localhost:5173/` and the unified FastAPI solver is available on `http://localhost:8000/`.

For a production-like container run:

```bash
docker compose --env-file .env.local up --build
```

The web container serves the built Vite app on port 5173 and proxies `/api/*` to the solver container on port 8000.

The legacy split-terminal workflow remains available. Run each command in a separate terminal from the repository root and keep all three terminals running:

```bash
# Terminal 1: CP-SAT optimizer service on port 8000
npm run cp-sat

# Terminal 2: ML risk scoring API on port 8001
python src/ml/api_server.py

# Terminal 3: Vite frontend on port 5173
npm run dev
```

The services are available at `http://localhost:8000`, `http://localhost:8001`, and `http://localhost:5173`. Open the frontend at http://localhost:5173/.

The ML API loads the optional `models/defect_priority_lgb.pkl` artifact when present and otherwise serves its deterministic fallback. Local ML and FastAPI development dependencies are listed in `requirements.local.txt`. Vercel deploys the Vite frontend and TypeScript Gemini function only; the full FastAPI solver runs locally or through Docker, while the frontend uses its local optimization fallback when no remote solver URL is configured. The Gemini Co-Pilot chat uses the server-side `GEMINI_API_KEY` and optional `GEMINI_MODEL` environment variables.

## Environment Variables

Copy `.env.example` to `.env.local` and fill in your own values before running locally. Supabase credentials are required at runtime. The ML risk scoring API uses port `8001`, while the unified CP-SAT/FastAPI solver uses port `8000`. Never commit `.env.local`.

## Available Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start the Vite development server on port 5173 |
| `npm run cp-sat` | Start the Python CP-SAT optimizer service on port 8000 |
| `python src/ml/api_server.py` | Start the ML risk scoring API on port 8001 |
| `npm run build` | Type-check and build the production bundle to `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run TypeScript type checking with `tsc --noEmit` |
| `npm run clean` | Remove `dist/` and `server.js` |

## Application Workflow

1. Sign in with a demo role credential (Engineering, S&T, TRD, or Section Controller / Admin).
2. Department officers create and submit block requests.
3. The Section Controller reviews requests from all departments.
4. The controller approves, modifies, rejects, or runs the AI Co-Pilot and CP-SAT optimizer.
5. Compatible requests can be bundled into a coordinated schedule.
6. The controller publishes the approved schedule.
7. Department officers complete safety clearance after an approved block is finished.
8. When configured, Supabase realtime updates and five-second polling synchronize requests, decisions, schedules, notifications, and safety updates across clients.

## Cross-Device Testing

1. Open the application on both a laptop and a mobile device.
2. Log in as a department officer on one device and as Admin on the other.
3. Submit a request from the department device.
4. Approve or reject it from the Admin device.
5. Confirm that the status updates on the department device without a page refresh.

## Project Structure

```text
Raksha_Block_Trikaal/
├── public/                      # Static assets
├── deliverables/
│   ├── deck/                    # SIH idea deck (PDF)
│   └── report/                  # Project report (PDF)
├── server/
│   └── cp_sat_server.py         # OR-Tools CP-SAT optimizer service
├── src/
│   ├── components/              # Dashboards, modals, charts, and maps
│   ├── data/                    # Zone, division, and mock data
│   ├── lib/
│   │   └── supabase.ts          # Supabase client and data helpers
│   ├── utils/                   # Alerts, solver, exports, and PDF helpers
│   ├── types.ts                 # Shared TypeScript domain types
│   └── App.tsx                  # Top-level application logic
├── supabase/
│   └── realtime_setup.sql       # Realtime and RLS setup script
├── requirements.txt             # Python dependencies
├── vercel.json                  # Vercel build configuration
└── vite.config.ts
```

## Security Notes

- All bundled application data is synthetic/demo data; this repository is not connected to Indian Railways production systems.
- `src/lib/supabase.ts` requires the Supabase URL and anon key through environment variables and does not include credential fallbacks.
- The RLS policies in `supabase/realtime_setup.sql` are intentionally permissive for demo purposes. Use Supabase Auth and department claims to enforce per-department access in production.
- Migrate the current demo role credentials to Supabase Auth before handling operational data.
- Gemini is used for the assistant chat only.

## Roadmap Ideas

- Migrate demo logins to Supabase Auth with per-department RLS.
- Persist AI Co-Pilot and CP-SAT decisions with a full audit history.
- Add role-based notification preferences.
- Expand the optimizer to support multi-day recurring maintenance windows.

## References

**Standards & safety basis**
- General Rules (1976) + Subsidiary Rules (G&SR), block working and track-machine block requisition rules — [SCR G&SR manual (PDF)](https://www.nfrlyconstruction.org/uploads/File/Manuals/02042023-13_141_SCR_G_SR.pdf_203600075.pdf)
- Indian Railways Permanent Way Manual (2020), P-Way duties and coordination between departments — [IRICEN manuals](https://iricen.gov.in/iricen/CodeManualNew.jsp)
- SIH 2026 problem statement SIH26027 (Ministry of Railways · Software · Transportation & Logistics) — [sih.gov.in](https://www.sih.gov.in)

**Methods & technology**
- Google OR-Tools CP-SAT solver — [developers.google.com](https://developers.google.com/optimization/cp/cp_solver)
- Peralta et al. (2018), railway maintenance scheduling research, *J. Comput. Civ. Eng.* 32(3) — [ASCE Library](https://ascelibrary.org/doi/10.1061/(ASCE)CP.1943-5487.0000757)
- Ke et al. (2017), *LightGBM: A Highly Efficient Gradient Boosting Decision Tree*, NeurIPS — [paper](https://proceedings.neurips.cc/paper/2017/file/6449f44a102fde848669bdd9eb6b76fa-Paper.pdf)
- Lundberg & Lee (2017), *A Unified Approach to Interpreting Model Predictions* (SHAP) — [arXiv:1705.07874](https://arxiv.org/abs/1705.07874)

---

<div align="center">

**RAKSHA recommends. The Section Controller decides.**

*Team TRIKAAL · SIH26027 · Ministry of Railways · Software · Team ID 137710*

</div>
