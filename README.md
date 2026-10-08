# BIPS SWOT System

Web app for the SWOT Analysis of Bhupindra International Public School, Patiala.
Covers all 22 headings of the SWOT sheet. Teachers choose Date + Month-Year + Class, and all 22 tables open on one page. Saved boxes are locked for teachers; only the Admin can edit or delete. ACADEMIC RECORD tests are added by date (weekly / PT / Half Yearly / Final). Student SWOT Report shows the full sheet April to March, printable.

**Stack:** React (Vite) · Supabase (database + login) · Vercel (hosting + 1 server function)

## Folder map
| Path | What it is |
|---|---|
| `supabase/schema.sql` | Run once in the Supabase SQL Editor: tables, security rules, 51 classes, 22 headings + 149 sub-types, subjects |
| `api/admin-users.js` | Server function used by Admin Panel to create teacher logins / reset passwords |
| `src/pages/entry/SwotEntry.jsx` | Fill SWOT Sheet: Date + Month-Year + Class, all 22 headings |
| `src/pages/entry/HeadingCard.jsx` | One heading table (ratings, talents, sports, videos, attendance, fee, PTM) |
| `src/pages/entry/AcademicCard.jsx` | ACADEMIC RECORD: tests by date, marks |
| `src/pages/StudentSheet.jsx` | Student SWOT Report in the sheet layout, print / PDF |
| `src/pages/Dashboard.jsx` | % filled per class & heading for a month |
| `src/pages/admin/*` | Teachers, Students, Bulk Import, Masters |
| `src/lib/config.js` | School name, sessions, month labels |

## Environment variables (Vercel → Settings → Environment Variables)
| Name | Value |
|---|---|
| `REACT_APP_SUPABASE_URL` | Supabase Project URL |
| `REACT_APP_SUPABASE_ANON_KEY` | Supabase **anon public** (or Publishable) key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase **service_role** (or Secret) key: server only, never share |

## Make yourself Admin (once)
Create your user in Supabase → Authentication → Users (tick *Auto Confirm User*), then in SQL Editor:
```sql
select make_admin('mis.gcs1@gmail.com', 'Raj Singh');
```

## Run on your own computer (optional)
```
npm install
copy .env.example .env      (then fill in the values)
npm run dev
```
