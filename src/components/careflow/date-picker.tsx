import * as React from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { getClinicLocalDate } from "@/lib/appointments";

export interface DatePickerProps {
  value?: string; // "YYYY-MM-DD"
  onChange: (dateStr: string) => void;
  minDate?: string; // "YYYY-MM-DD"
  maxDate?: string; // "YYYY-MM-DD"
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  timeZone?: string;
  buttonVariant?: "outline" | "default" | "secondary" | "ghost";
}

export function DatePicker({
  value,
  onChange,
  minDate,
  maxDate,
  placeholder = "Select date",
  className,
  disabled = false,
  id,
  timeZone = "Asia/Kolkata",
  buttonVariant = "outline",
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);

  // Parse YYYY-MM-DD in local context
  const selectedDate = React.useMemo(() => {
    if (!value) return undefined;
    const [y, m, d] = value.split("-").map(Number);
    if (!y || !m || !d) return undefined;
    return new Date(y, m - 1, d);
  }, [value]);

  const min = React.useMemo(() => {
    if (!minDate) return undefined;
    const [y, m, d] = minDate.split("-").map(Number);
    if (!y || !m || !d) return undefined;
    return new Date(y, m - 1, d);
  }, [minDate]);

  const max = React.useMemo(() => {
    if (!maxDate) return undefined;
    const [y, m, d] = maxDate.split("-").map(Number);
    if (!y || !m || !d) return undefined;
    return new Date(y, m - 1, d);
  }, [maxDate]);

  const handleSelect = (date: Date | undefined) => {
    if (!date) return;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    onChange(`${year}-${month}-${day}`);
    setOpen(false);
  };

  const handleSelectToday = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const todayStr = getClinicLocalDate(new Date(), timeZone);
    onChange(todayStr);
    setOpen(false);
  };

  const currentYear = new Date().getFullYear();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant={buttonVariant}
          disabled={disabled}
          className={cn(
            "w-full justify-start text-left font-normal h-9 px-3",
            !selectedDate && "text-muted-foreground",
            className
          )}
          aria-label={selectedDate ? `Selected date: ${value}` : placeholder}
        >
          <CalendarIcon className="mr-2 size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">
            {selectedDate ? format(selectedDate, "EEE, MMM d, yyyy") : placeholder}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={handleSelect}
          disabled={(date) => {
            if (min && date < min) return true;
            if (max && date > max) return true;
            return false;
          }}
          captionLayout="dropdown"
          startMonth={new Date(currentYear - 10, 0)}
          endMonth={new Date(currentYear + 10, 11)}
          initialFocus
        />
        <div className="flex items-center justify-between border-t p-2 bg-muted/20">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleSelectToday}
            className="text-xs h-7 px-2 font-medium"
          >
            Today
          </Button>
          {selectedDate && (
            <span className="text-[11px] font-mono text-muted-foreground px-2">
              {value}
            </span>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
