import * as React from "react";
import { Sparkles, Database, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FUTURE_DATA_UNAVAILABLE_MESSAGE, type FutureVisualizationDef } from "@/lib/analytics-types";
import { cn } from "@/lib/utils";

interface FutureAnalyticsCardProps {
  definition: FutureVisualizationDef;
  className?: string;
}

export function FutureAnalyticsCard({ definition, className }: FutureAnalyticsCardProps) {
  const [showContract, setShowContract] = React.useState(false);

  return (
    <Card
      className={cn(
        "relative flex flex-col justify-between overflow-hidden border-dashed border-border/80 bg-card/60 shadow-none transition-all hover:border-primary/40",
        className
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <CardTitle className="text-base font-medium">{definition.title}</CardTitle>
              <Badge variant="outline" className="border-primary/20 bg-primary/5 text-[10px] font-normal text-primary">
                <Sparkles className="mr-1 size-3" />
                Planned Insight
              </Badge>
            </div>
            <CardDescription className="mt-1 text-xs">{definition.description}</CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Visual empty placeholder reflecting the intended chart type */}
        <div
          className="relative flex h-48 w-full flex-col items-center justify-center rounded-md border border-dashed border-border/60 bg-muted/20 p-4 text-center"
          role="img"
          aria-label={`${definition.title}: ${FUTURE_DATA_UNAVAILABLE_MESSAGE}`}
        >
          {/* Subtle architectural wireframe background */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-10">
            {definition.chartType === "area" && (
              <svg viewBox="0 0 400 120" className="size-full">
                <path d="M 0 100 Q 100 40, 200 70 T 400 20 L 400 120 L 0 120 Z" fill="currentColor" />
              </svg>
            )}
            {definition.chartType === "bar" && (
              <svg viewBox="0 0 400 120" className="size-full">
                <rect x="30" y="50" width="30" height="70" fill="currentColor" rx="4" />
                <rect x="90" y="20" width="30" height="100" fill="currentColor" rx="4" />
                <rect x="150" y="60" width="30" height="60" fill="currentColor" rx="4" />
                <rect x="210" y="35" width="30" height="85" fill="currentColor" rx="4" />
                <rect x="270" y="75" width="30" height="45" fill="currentColor" rx="4" />
                <rect x="330" y="10" width="30" height="110" fill="currentColor" rx="4" />
              </svg>
            )}
            {definition.chartType === "scatter" && (
              <svg viewBox="0 0 400 120" className="size-full">
                <circle cx="50" cy="40" r="10" fill="currentColor" />
                <circle cx="120" cy="80" r="14" fill="currentColor" />
                <circle cx="200" cy="30" r="8" fill="currentColor" />
                <circle cx="280" cy="90" r="12" fill="currentColor" />
                <circle cx="350" cy="50" r="16" fill="currentColor" />
              </svg>
            )}
            {definition.chartType === "radial" && (
              <svg viewBox="0 0 120 120" className="size-28">
                <circle cx="60" cy="60" r="45" fill="none" stroke="currentColor" strokeWidth="12" />
              </svg>
            )}
          </div>

          {/* Consistent unavailable state notification */}
          <div className="relative z-10 max-w-sm space-y-1.5 px-4">
            <p className="text-xs font-medium text-foreground">{FUTURE_DATA_UNAVAILABLE_MESSAGE}</p>
            <p className="text-[11px] text-muted-foreground">{definition.purpose}</p>
          </div>
        </div>

        {/* Data Connection Readiness Spec */}
        <div className="pt-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowContract(v => !v)}
            className="h-7 w-full justify-between px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <span className="flex items-center gap-1.5 font-normal">
              <Database className="size-3 text-muted-foreground" />
              Future Data Connection Spec
            </span>
            {showContract ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          </Button>

          {showContract && (
            <div className="mt-2 space-y-2 rounded-md bg-muted/40 p-3 text-[11px] text-muted-foreground">
              <div>
                <span className="font-medium text-foreground">Required data sources:</span>
                <ul className="mt-1 list-inside list-disc space-y-0.5">
                  {definition.dataRequired.map(src => (
                    <li key={src}>{src}</li>
                  ))}
                </ul>
              </div>
              <div>
                <span className="font-medium text-foreground">Target aggregation:</span>
                <p className="mt-0.5">{definition.aggregation}</p>
              </div>
              <div className="flex items-center justify-between pt-1 text-[10px]">
                <span>Access scope: <strong className="text-foreground">{definition.role}</strong></span>
                <span>Connection status: <strong className="text-primary">{definition.status}</strong></span>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
