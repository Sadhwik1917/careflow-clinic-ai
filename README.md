# CAREFLOW-AI

Create a new project with Supabase enabled.

CAREFLOW AI — Existing Project Audit Before Frontend Development

We are continuing the existing CAREFLOW AI project. Architecture v3 and the previously agreed product requirements, page flows, role permissions, onboarding, subscription plans, and clinic workflows are authoritative.

The backend is already established using Supabase. Database migrations, RLS policies, and initial testing have been completed.

For this task, perform an INSPECTION ONLY.

Identify the current frontend framework, dependencies, routes, components, and application entry points.

Inspect the existing Supabase client configuration and authentication integration without exposing secrets.

Identify which Architecture v3 requirements and page flows are already implemented, partially implemented, or missing.

Inspect the current Git branch and repository structure.

Identify compatibility considerations for shadcn/ui, Motion for React, and selectively chosen Kokonut UI components.

Report any risks before making changes.

NON-NEGOTIABLE:

Do not modify any files.

Do not create or modify database tables or migrations.

Do not change RLS policies, authentication settings, or existing backend logic.

Do not introduce Firebase.

Do not invent schema, columns, routes, or role permissions.

Do not replace existing functionality with mock implementations.

Do not generate the frontend yet.

Return a concise audit report with the current state, existing architecture, missing frontend pieces, and the safest next implementation step.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
