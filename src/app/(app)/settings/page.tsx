"use client";

import { useTheme } from "next-themes";
import Link from "next/link";
import { ChevronDown, ChevronUp, Monitor, Moon, RotateCcw, Sun, Trash2, Wand2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, SectionLabel } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { AccountCard } from "@/components/settings/account-card";
import { navByKey } from "@/components/nav/nav-items";
import { MAX_PRIMARY_NAV, useUI } from "@/store/ui";
import { useData } from "@/store/data";
import { useMounted } from "@/lib/use-mounted";
import { cn } from "@/lib/utils";

const APP_VERSION = "1.0 — prototype";

const THEMES = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" showPrivacy={false} />
      <div className="mx-auto max-w-xl space-y-4">
        <AccountCard />
        <AppearanceSection />
        <NavigationSection />
        <RulesSection />
        <PrivacySection />
        <DataSection />
        <AboutSection />
      </div>
    </>
  );
}

function SettingRow({ title, description, control }: { title: string; description?: string; control: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  const active = mounted ? theme ?? "system" : undefined;

  return (
    <Card>
      <SectionLabel className="mb-3">Appearance</SectionLabel>
      <SettingRow
        title="Theme"
        description="Match your system, or pick a fixed look."
        control={
          <div className="flex gap-1 rounded-full glass-inset p-1">
            {THEMES.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                aria-label={label}
                aria-pressed={active === value}
                onClick={() => setTheme(value)}
                className={cn(
                  "pressable flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium",
                  active === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" />
                {label}
              </button>
            ))}
          </div>
        }
      />
    </Card>
  );
}

function NavigationSection() {
  const { navConfig, setNavPrimary, moveNavItem, resetNav } = useUI();
  const primaryCount = navConfig.filter((n) => n.primary).length;

  return (
    <Card>
      <div className="mb-1 flex items-center justify-between">
        <SectionLabel>Navigation bar</SectionLabel>
        <button type="button" onClick={resetNav} className="pressable flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
          <RotateCcw className="size-3.5" /> Reset
        </button>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Choose up to {MAX_PRIMARY_NAV} tabs for the bar; the rest live under “More”. Reorder with the arrows.
      </p>
      <ul className="space-y-1">
        {navConfig.map((n, i) => {
          const item = navByKey.get(n.key);
          if (!item) return null;
          const Icon = item.icon;
          const atCap = !n.primary && primaryCount >= MAX_PRIMARY_NAV;
          return (
            <li key={n.key} className="flex items-center gap-3 rounded-xl glass-inset px-3 py-2">
              <div className="flex flex-col">
                <button
                  type="button"
                  aria-label={`Move ${item.label} up`}
                  disabled={i === 0}
                  onClick={() => moveNavItem(n.key, -1)}
                  className="pressable text-muted-foreground hover:text-foreground disabled:opacity-30"
                >
                  <ChevronUp className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label={`Move ${item.label} down`}
                  disabled={i === navConfig.length - 1}
                  onClick={() => moveNavItem(n.key, 1)}
                  className="pressable text-muted-foreground hover:text-foreground disabled:opacity-30"
                >
                  <ChevronDown className="size-4" />
                </button>
              </div>
              <Icon className="size-4 shrink-0 text-muted-foreground" />
              <span className="flex-1 text-sm font-medium">{item.label}</span>
              <span className="text-[11px] text-muted-foreground">{n.primary ? "In bar" : "More"}</span>
              <Switch
                checked={n.primary}
                disabled={atCap}
                onCheckedChange={(v) => setNavPrimary(n.key, v)}
                aria-label={`Show ${item.label} in bar`}
              />
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function RulesSection() {
  return (
    <Card>
      <SectionLabel className="mb-3">Categorization</SectionLabel>
      <SettingRow
        title="Rules"
        description="Create rules that auto-categorize transactions before the AI runs."
        control={<Link href="/rules" className="pressable inline-flex items-center gap-1.5 rounded-full glass-inset px-3 py-1.5 text-xs font-medium"><Wand2 className="size-3.5" /> Open</Link>}
      />
    </Card>
  );
}

function PrivacySection() {
  const masked = useUI((s) => s.masked);
  const toggleMask = useUI((s) => s.toggleMask);
  return (
    <Card>
      <SectionLabel className="mb-3">Privacy</SectionLabel>
      <SettingRow
        title="Mask amounts"
        description="Hide every amount as •••• kr across the app."
        control={<Switch checked={masked} onCheckedChange={toggleMask} aria-label="Mask amounts" />}
      />
    </Card>
  );
}

function DataSection() {
  const { clearData } = useData();
  return (
    <Card>
      <SectionLabel className="mb-3">Data</SectionLabel>
      <SettingRow
        title="Clear all data"
        description="Permanently remove all accounts, transactions, budgets, goals, categories and tags from this device."
        control={
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="danger" size="sm" className="gap-1.5">
                <Trash2 className="size-4" /> Clear
              </Button>
            </DialogTrigger>
            <DialogContent title="Clear all data?">
              <div className="space-y-5">
                <p className="text-sm text-muted-foreground">
                  This wipes everything stored on this device and can&apos;t be undone. The app will be empty afterwards.
                </p>
                <div className="flex justify-end gap-2">
                  <DialogClose asChild>
                    <Button variant="ghost" size="sm">Cancel</Button>
                  </DialogClose>
                  <DialogClose asChild>
                    <Button variant="danger" size="sm" onClick={clearData} className="gap-1.5">
                      <Trash2 className="size-4" /> Clear all data
                    </Button>
                  </DialogClose>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        }
      />
    </Card>
  );
}

function AboutSection() {
  return (
    <Card>
      <SectionLabel className="mb-3">Locale &amp; about</SectionLabel>
      <div className="divide-y divide-[hsl(var(--glass-border))]">
        <SettingRow title="Region &amp; currency" description="Swedish formatting (fixed in this version)." control={<span className="tnum text-sm text-muted-foreground">sv-SE · SEK</span>} />
        <SettingRow title="Install as app" description="Use your browser's “Add to Home Screen” / “Install” to run Pegels as a PWA." control={<span className="text-sm text-muted-foreground">PWA</span>} />
        <SettingRow title="Version" control={<span className="tnum text-sm text-muted-foreground">{APP_VERSION}</span>} />
      </div>
    </Card>
  );
}
