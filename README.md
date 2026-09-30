# House of Life Sciences (HOLS)

Monorepo for the **House of Life Sciences** platform — peptide education, membership, and a clinical adviser for providers.

## Project structure

```
hols/
├── frontend/          Next.js 16 app (marketing site + student, admin, and affiliate portals)
├── backend/           FastAPI API (auth, lectures, payments, webinars, adviser chat)
├── backend/aiadviser/ Standalone adviser prototype (Chroma upload scripts live here)
├── README.md
└── .gitignore
```

## Frontend

- **Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS v4
- **Brand config:** `frontend/src/config/brand.ts`
- **Content:** `frontend/src/content/`
- **API client:** `frontend/src/lib/integrate/` (`NEXT_PUBLIC_API_URL`, default `http://localhost:8000`)

Surfaces:

- Marketing site and dosing calculator
- Student portal (lectures, plans, orders, webinars, profile)
- Admin portal (users, affiliates, sales, reports, webinars, payouts)
- Affiliate portal (referrals, earnings, payouts)
- Auth for students, admins, and affiliates

### Run locally

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Point the app at a running API with `NEXT_PUBLIC_API_URL` in `frontend/.env.local` when it is not `http://localhost:8000`.

### Deploy on Vercel

1. Import this repository in [Vercel](https://vercel.com).
2. Set **Root Directory** to `frontend`.
3. Vercel will detect Next.js via `frontend/vercel.json`.
4. Set `NEXT_PUBLIC_API_URL` to the deployed API origin.
5. Deploy.

## Backend

- **Stack:** FastAPI, Uvicorn, Pydantic, DynamoDB, S3, SES, JWT
- **Config:** `backend/.env` (see `backend/config.py` for variable names). Do not commit this file.

### Run locally

```bash
cd backend
python3 -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Create `backend/.env` before starting. The API reads AWS, DynamoDB, JWT, email, payment, and adviser (OpenRouter + Chroma) settings from that file.

### API

All feature routes are mounted under `/api`. Interactive docs: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs).

| Prefix | Purpose |
|--------|---------|
| `GET /` | Welcome message |
| `/api/health`, `/api/test` | Health and smoke check |
| `/api/auth` | Register, login, OTP, session, profile |
| `/api/users` | Admin student and affiliate lists |
| `/api/admin/affiliates` | Affiliate accounts, quotas, payout review |
| `/api/affiliate` | Affiliate dashboard, invites, earnings, payouts |
| `/api/payment` | Plans, checkout, membership, orders, sales |
| `/api/notifications` | In-app notifications |
| `/api/admin/reports` | Order reports |
| `/api/lectures` | Courses, lessons, quizzes |
| `/api/webinars` | Webinar catalog and bookings |
| `/api/chat` | Peptide adviser intake, recommendations, follow-up |

API base URL: [http://127.0.0.1:8000](http://127.0.0.1:8000)

`APP_ENV=development` bypasses the payment processor. `ENABLE_OTP=false` skips the login code.

## Repository

[https://github.com/muhammadhasnain100/hols](https://github.com/muhammadhasnain100/hols)

## License

Proprietary — House of Life Sciences.
