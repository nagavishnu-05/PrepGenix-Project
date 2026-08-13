<!-- BEGIN:stack-rules -->
# Stack

- **Frontend**: React 19 + Vite (JSX), React Router v7, Tailwind CSS v4 (`@tailwindcss/vite` plugin). SPA — no SSR.
- **Backend**: Plain JavaScript (CommonJS), Express 4, native MongoDB driver (`mongodb` package, no ORM). DB access goes through `Backend/src/db.js` helpers (`col`, `id`, `toId`).
- Frontend pages live in `src/pages/`; components in `src/components/`; routes are defined in `src/App.jsx`.
- Alias `@/` maps to `src/`. Env vars for the client use the `VITE_` prefix.
- Do not reintroduce Next.js idioms (`"use client"`, `next/link`, `next/navigation`, `next/font`, route-group folders). Use React Router primitives instead.
<!-- END:stack-rules -->
