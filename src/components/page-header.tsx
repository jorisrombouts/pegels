import { PrivacyToggle } from "@/components/nav/privacy-toggle";
import { ThemeToggle } from "@/components/nav/theme-toggle";
import { AccountMenu } from "@/components/nav/account-menu";

/**
 * Page chrome: large title (e.g. "Dashboard"), optional subtitle, a slot for
 * page-specific controls, then the always-present privacy + theme toggles + account avatar.
 */
export function PageHeader({
  title,
  subtitle,
  controls,
  showPrivacy = true,
}: {
  title: string;
  subtitle?: string;
  controls?: React.ReactNode;
  showPrivacy?: boolean;
}) {
  return (
    <header className="mb-6 space-y-4">
      {/* Title + always-present toggles share the top row. */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl font-bold">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {showPrivacy && <PrivacyToggle />}
          <ThemeToggle />
          <AccountMenu />
        </div>
      </div>

      {/* Page-specific controls get their own row so they don't crowd the toggles. */}
      {controls && <div className="flex flex-wrap items-center gap-2">{controls}</div>}
    </header>
  );
}
