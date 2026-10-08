import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Eye, EyeOff } from "lucide-react";
import { CareflowBrand } from "./brand";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

export function AuthLayout({ title, description, children, footer }: { title: string; description?: string; children: ReactNode; footer?: ReactNode }) {
  return <div className="flex min-h-screen flex-col bg-background">
    <header className="px-4 py-5 md:px-8"><Link to="/" aria-label="CAREFLOW AI home" className="inline-flex"><CareflowBrand /></Link></header>
    <main id="main-content" className="flex flex-1 items-start justify-center px-4 pb-16 pt-6 md:items-center md:pt-0">
      <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-sm md:p-8">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {description && <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>}
        <div className="mt-6">{children}</div>
        {footer && <div className="mt-6 border-t pt-5 text-center text-sm text-muted-foreground">{footer}</div>}
      </div>
    </main>
  </div>;
}

export function FormField({ id, label, error, children, hint }: { id: string; label: string; error?: string; hint?: string; children: ReactNode }) {
  return <div className="space-y-2">
    <Label htmlFor={id}>{label}</Label>
    {children}
    {hint && !error && <p id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</p>}
    {error && <p id={`${id}-error`} className="text-xs font-medium text-destructive">{error}</p>}
  </div>;
}

export function PasswordInput({ id, value, onChange, error, autoComplete, hint }: { id: string; value: string; onChange: (v: string) => void; error?: string; autoComplete: string; hint?: string }) {
  const [visible, setVisible] = useState(false);
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return <div className="relative">
    <Input id={id} name={id} type={visible ? "text" : "password"} value={value} onChange={e => onChange(e.target.value)} autoComplete={autoComplete} aria-invalid={!!error} aria-describedby={describedBy} className="pr-11" />
    <Button type="button" variant="ghost" size="icon" className="absolute right-0.5 top-1/2 size-9 -translate-y-1/2 text-muted-foreground" aria-label={visible ? "Hide password" : "Show password"} aria-pressed={visible} onClick={() => setVisible(v => !v)}>{visible ? <EyeOff /> : <Eye />}</Button>
  </div>;
}

export function FormAlert({ tone = "error", children }: { tone?: "error" | "success"; children: ReactNode }) {
  return <div role={tone === "error" ? "alert" : "status"} className={tone === "error" ? "rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive" : "rounded-md border border-primary/20 bg-secondary px-3 py-2.5 text-sm text-secondary-foreground"}>{children}</div>;
}

export function PublicLayout({ children }: { children: ReactNode }) {
  const { session, ready } = useAuth();
  return <div className="flex min-h-screen flex-col bg-background">
    <header className="border-b bg-card"><div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 md:px-8">
      <Link to="/" aria-label="CAREFLOW AI home"><CareflowBrand /></Link>
      <nav aria-label="Main" className="flex items-center gap-1 text-sm">
        <Button asChild variant="ghost" size="sm"><Link to="/pricing">Pricing</Link></Button>
        <Button asChild variant="ghost" size="sm"><Link to="/about">About</Link></Button>
        <Button asChild variant="ghost" size="sm"><Link to="/contact">Contact</Link></Button>
        {ready && session ? <Button asChild size="sm"><Link to="/workspace">Open workspace</Link></Button> : <><Button asChild variant="outline" size="sm"><Link to="/login">Sign in</Link></Button><Button asChild size="sm" className="hidden sm:inline-flex"><Link to="/signup">Create account</Link></Button></>}
      </nav>
    </div></header>
    <main id="main-content" className="mx-auto w-full max-w-6xl flex-1 px-4 py-12 md:px-8 md:py-16">{children}</main>
    <footer className="border-t px-4 py-5 text-center text-xs text-muted-foreground">© CAREFLOW AI</footer>
  </div>;
}

export function CenteredPanel({ children }: { children: ReactNode }) {
  return <div className="flex min-h-screen flex-col bg-background"><header className="px-4 py-5 md:px-8"><CareflowBrand /></header><main id="main-content" className="flex flex-1 justify-center px-4 pb-16 pt-6"><div className="w-full max-w-xl">{children}</div></main></div>;
}
