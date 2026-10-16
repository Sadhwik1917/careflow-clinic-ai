# src/lib rules

- Patient History Summary (`patient-summary.functions.ts`) uses only exact RLS-scoped queries on the caller's client — never vector RAG, which has no patient-level scope; platform admins are refused, facts are gathered before credit reservation so empty histories are free, and summaries are never persisted.
