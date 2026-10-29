import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Toaster } from "sonner";

type Theme = "system" | "light" | "dark";
const ThemeContext = createContext<Theme>("system");
const storageKey = "groupgrub-theme";

// Runs before page content paints so saved/system dark mode does not flash light.
export const themeInitScript = `(()=>{let t='system';try{t=localStorage.getItem('${storageKey}')||'system'}catch{}const d=t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light'})()`;

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("system");
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    let current: Theme = "system";
    const apply = () => {
      const isDark = current === "dark" || (current === "system" && media.matches);
      document.documentElement.classList.toggle("dark", isDark);
      document.documentElement.style.colorScheme = isDark ? "dark" : "light";
      setTheme(current);
      setDark(isDark);
    };
    const read = () => {
      let saved: string | null = null;
      try {
        saved = localStorage.getItem(storageKey);
      } catch {
        /* Device preference still works without storage. */
      }
      current = saved === "light" || saved === "dark" ? saved : "system";
      apply();
    };
    const change = (event: Event) => {
      current = (event as CustomEvent<Theme>).detail;
      apply();
    };
    const storage = (event: StorageEvent) => {
      if (event.key === storageKey || event.key === null) read();
    };
    read();
    media.addEventListener("change", apply);
    window.addEventListener("storage", storage);
    window.addEventListener("groupgrub-theme-change", change);
    return () => {
      media.removeEventListener("change", apply);
      window.removeEventListener("storage", storage);
      window.removeEventListener("groupgrub-theme-change", change);
    };
  }, []);
  return (
    <ThemeContext.Provider value={theme}>
      {children}
      <Toaster position="top-center" richColors theme={dark ? "dark" : "light"} />
    </ThemeContext.Provider>
  );
}

export function ThemeControl() {
  const theme = useContext(ThemeContext);
  return (
    <label className="flex items-center gap-2 text-sm font-medium">
      Appearance
      <select
        className="rounded-lg border-2 bg-card px-3 py-2 text-foreground"
        value={theme}
        onChange={(event) => {
          const next = event.target.value as Theme;
          try {
            localStorage.setItem(storageKey, next);
          } catch {
            /* Keep the choice for this page session. */
          }
          window.dispatchEvent(new CustomEvent("groupgrub-theme-change", { detail: next }));
        }}
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}
