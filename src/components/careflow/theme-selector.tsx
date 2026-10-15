import { Monitor, Moon, Sun } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { parseTheme, useTheme } from "@/lib/theme";

const options = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

export function ThemeSelector() {
  const { theme, setTheme } = useTheme();
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      aria-label="Appearance"
      value={theme}
      onValueChange={(v) => v && setTheme(parseTheme(v))}
      className="justify-start"
    >
      {options.map(({ value, label, icon: Icon }) => (
        <ToggleGroupItem key={value} value={value} aria-label={label} className="gap-2 px-3 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground">
          <Icon className="size-4" aria-hidden="true" />
          <span className="text-sm">{label}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
