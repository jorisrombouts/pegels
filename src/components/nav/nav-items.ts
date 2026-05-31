import {
  Home,
  List,
  Layers,
  PiggyBank,
  Target,
  Landmark,
  Tag,
  Wand2,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  key: string;
  href: string;
  label: string;
  icon: LucideIcon;
}

/** Master registry of all navigable destinations (Import is a separate action). */
export const NAV_REGISTRY: NavItem[] = [
  { key: "home", href: "/", label: "Home", icon: Home },
  { key: "transactions", href: "/transactions", label: "Activity", icon: List },
  { key: "budgets", href: "/budgets", label: "Budgets", icon: PiggyBank },
  { key: "goals", href: "/goals", label: "Goals", icon: Target },
  { key: "categories", href: "/categories", label: "Categories", icon: Layers },
  { key: "accounts", href: "/accounts", label: "Accounts", icon: Landmark },
  { key: "tags", href: "/tags", label: "Tags", icon: Tag },
  { key: "rules", href: "/rules", label: "Rules", icon: Wand2 },
  { key: "settings", href: "/settings", label: "Settings", icon: Settings },
];

export const navByKey = new Map(NAV_REGISTRY.map((i) => [i.key, i]));
