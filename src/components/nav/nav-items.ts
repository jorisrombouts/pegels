import {
  Home,
  List,
  Layers,
  PiggyBank,
  Landmark,
  Tag,
  Wand2,
  GraduationCap,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  key: string;
  href: string;
  label: string;
  icon: LucideIcon;
  /** true = a tab in the bottom bar; false = under "More". */
  primary: boolean;
}

/** Master registry of all navigable destinations (Import is a separate action). */
export const NAV_REGISTRY: NavItem[] = [
  { key: "home", href: "/", label: "Home", icon: Home, primary: true },
  { key: "transactions", href: "/transactions", label: "Activity", icon: List, primary: true },
  { key: "budgets", href: "/budgets", label: "Budgets", icon: PiggyBank, primary: true },
  { key: "categories", href: "/categories", label: "Categories", icon: Layers, primary: true },
  { key: "accounts", href: "/accounts", label: "Accounts", icon: Landmark, primary: false },
  { key: "tags", href: "/tags", label: "Tags", icon: Tag, primary: false },
  { key: "training", href: "/training", label: "Training", icon: GraduationCap, primary: false },
  { key: "rules", href: "/rules", label: "Rules", icon: Wand2, primary: false },
  { key: "settings", href: "/settings", label: "Settings", icon: Settings, primary: false },
];

export const PRIMARY_NAV = NAV_REGISTRY.filter((i) => i.primary);
export const MORE_NAV = NAV_REGISTRY.filter((i) => !i.primary);
