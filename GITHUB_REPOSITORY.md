# GitHub repository and release policy

Public repository: https://github.com/randynlinda4ever-dot/scholarship-scout

GitHub is the only source-of-truth repository for Scholarship Scout. The `main` branch is the canonical production source branch. Make changes on focused branches, open pull requests, review file-level changes and checks, then merge into `main`. Never force-push, rewrite shared history, or overwrite another contributor's work.

Vercel is the frontend hosting and deployment target. Production deployments must identify the exact GitHub commit built and must use the configured production branch. A READY frontend deployment does not prove that Supabase Edge Function source, secrets, database policies, or live discovery are correct; verify those backend services independently.

Supabase is the backend service, not a source repository. Edge Function code and database migrations in this repository require their own review, deployment, and rollback evidence. Never make a backend change incidental to a frontend release.

Privacy rules: do not commit environment files, credentials, API keys, gateway tokens, private keys, student profiles, academic records, essays, recommendation notes, application data, or browser/session data. Keep student-specific data local. Exclude host-specific recovery and audit reports from the public repository. No license is declared; public visibility does not grant reuse rights.
