import type { ReactNode } from "react";

export function PageTitle({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return <div className="mb-7 flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><h1 className="text-3xl font-semibold leading-tight">{title}</h1>{description && <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>}</div>{actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}</div>;
}