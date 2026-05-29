import type {
  Account,
  Budget,
  Category,
  Goal,
  Tag,
  Transaction,
} from "@/lib/domain/types";

export interface Dataset {
  accounts: Account[];
  categories: Category[];
  tags: Tag[];
  transactions: Transaction[];
  budgets: Budget[];
  goals: Goal[];
}

export const accounts: Account[] = [
  { id: "acc-lon", name: "Nordea Lönekonto", type: "Checking", kind: "spending", icon: "🏦", color: "217 91% 60%", balance: 18450, archived: false },
  { id: "acc-spar", name: "Nordea Sparkonto", type: "Savings", kind: "savings", icon: "🐷", color: "150 60% 48%", balance: 64200, archived: false },
  { id: "acc-rev", name: "Revolut", type: "Revolut", kind: "spending", icon: "💳", color: "270 70% 62%", balance: 3850, archived: false },
];

export const categories: Category[] = [
  // Top-level hues spread cleanly around the wheel; sub-categories sit near their parent.
  { id: "cat-food", name: "Food & Drinks", icon: "🍔", color: "145 58% 47%", parentId: null },
  { id: "cat-restaurants", name: "Restaurants", icon: "🍽️", color: "158 52% 50%", parentId: "cat-food" },
  { id: "cat-groceries", name: "Groceries", icon: "🛒", color: "132 50% 46%", parentId: "cat-food" },
  { id: "cat-housing", name: "Housing", icon: "🏠", color: "214 85% 60%", parentId: null },
  { id: "cat-rent", name: "Rent", icon: "🏠", color: "222 82% 64%", parentId: "cat-housing" },
  { id: "cat-electricity", name: "Electricity", icon: "⚡", color: "198 88% 58%", parentId: "cat-housing" },
  { id: "cat-transport", name: "Transport", icon: "🚌", color: "32 92% 56%", parentId: null },
  { id: "cat-transit", name: "Public Transit", icon: "🚇", color: "42 90% 58%", parentId: "cat-transport" },
  { id: "cat-fuel", name: "Fuel", icon: "⛽", color: "20 85% 57%", parentId: "cat-transport" },
  { id: "cat-entertainment", name: "Entertainment", icon: "🎬", color: "276 72% 65%", parentId: null },
  { id: "cat-clothing", name: "Clothing", icon: "👕", color: "330 76% 62%", parentId: null },
  { id: "cat-health", name: "Health", icon: "💊", color: "172 64% 44%", parentId: null },
  { id: "cat-subscriptions", name: "Subscriptions", icon: "📦", color: "255 78% 67%", parentId: null },
  { id: "cat-other", name: "Other", icon: "📎", color: "220 10% 55%", parentId: null },
];

export const tags: Tag[] = [
  { id: "tag-subscription", name: "Subscription", color: "35 90% 55%" },
  { id: "tag-fixed", name: "Fixed cost", color: "217 91% 60%" },
  { id: "tag-partner", name: "Partner night out", color: "0 75% 60%" },
  { id: "tag-swish", name: "Swish group", color: "150 65% 50%" },
  { id: "tag-other", name: "Other", color: "35 85% 55%" },
];

// Helper to build a transaction with sensible defaults.
let n = 0;
function t(
  date: string,
  description: string,
  amount: number,
  categoryId: string | null,
  opts: Partial<Transaction> = {},
): Transaction {
  n += 1;
  return {
    id: `tx-${String(n).padStart(3, "0")}`,
    date,
    description,
    amount,
    accountId: "acc-lon",
    categoryId,
    predictedCategoryId: categoryId,
    categoryConfidence: opts.categorySource === "user" ? null : 0.94,
    categorySource: "model",
    needsReview: false,
    tagIds: [],
    ignored: false,
    kind: amount < 0 ? "expense" : "income",
    goalId: null,
    ...opts,
  };
}

export const transactions: Transaction[] = [
  // ── March 2025 (the month shown in the screenshots) ──
  t("2025-03-01", "Hyra Mars", -12500, "cat-rent", { tagIds: ["tag-fixed"], categoryConfidence: 0.97 }),
  t("2025-03-01", "Lön Företaget AB", 38500, null, { needsReview: true, categoryConfidence: null, kind: "income" }),
  t("2025-03-02", "ICA Maxi Haninge", -487, "cat-groceries"),
  t("2025-03-03", "Spotify AB", -119, "cat-subscriptions", { tagIds: ["tag-subscription"] }),
  t("2025-03-04", "SL Månadskort", -970, "cat-transit", { tagIds: ["tag-fixed"] }),
  t("2025-03-05", "Hemköp Södermalm", -326, "cat-groceries"),
  t("2025-03-05", "Netflix", -169, "cat-subscriptions", { tagIds: ["tag-subscription"] }),
  t("2025-03-06", "Coop Konsum Kungsholmen", -215, "cat-groceries"),
  t("2025-03-07", "Restaurang Pelikan", -890, "cat-restaurants", {
    tagIds: ["tag-partner"],
    splits: [
      { id: "sp1", label: "Mine", amount: 445, mine: true },
      { id: "sp2", label: "Partner", amount: 445, mine: false },
    ],
  }),
  t("2025-03-08", "H&M Online", -599, "cat-clothing", { accountId: "acc-rev" }),
  t("2025-03-08", "Swish - Erik lunch", -85, "cat-restaurants", { needsReview: true, tagIds: ["tag-swish"], categoryConfidence: 0.61 }),
  t("2025-03-09", "Apotek Hjärtat", -189, "cat-health"),
  t("2025-03-10", "Elräkning Vattenfall", -845, "cat-electricity", { tagIds: ["tag-fixed"] }),
  t("2025-03-11", "Willys Fridhemsplan", -412, "cat-groceries"),
  t("2025-03-12", "Filmstaden Sergel", -185, "cat-entertainment", { tagIds: ["tag-partner"] }),
  t("2025-03-13", "OKQ8 Bensin", -720, "cat-fuel"),
  t("2025-03-13", "Max Burgers", -132, "cat-restaurants", { accountId: "acc-rev" }),
  t("2025-03-14", "Överföring till Sparkonto", -5000, null, { ignored: true, categoryConfidence: null, categorySource: "user", kind: "transfer" }),
  t("2025-03-14", "Överföring från Lönekonto", 5000, null, { accountId: "acc-spar", ignored: true, categoryConfidence: null, categorySource: "user", kind: "transfer" }),
  t("2025-03-15", "Systembolaget", -349, "cat-food", { tagIds: ["tag-partner"] }),
  t("2025-03-16", "ICA Nära", -268, "cat-groceries"),
  t("2025-03-17", "Klarna - Zalando", -1290, "cat-clothing"),
  t("2025-03-18", "HBO Max", -109, "cat-subscriptions", { tagIds: ["tag-subscription"] }),
  t("2025-03-19", "Pressbyrån", -64, "cat-other", { needsReview: true, categoryConfidence: 0.44 }),
  t("2025-03-20", "Espresso House", -58, "cat-restaurants"),
  t("2025-03-21", "SF Bio popcorn", -95, "cat-entertainment", { accountId: "acc-rev" }),
  t("2025-03-22", "Lidl Globen", -311, "cat-groceries"),
  t("2025-03-23", "Apoteket", -240, "cat-health"),
  t("2025-03-24", "Uber", -156, "cat-transport", { accountId: "acc-rev" }),
  t("2025-03-25", "ICA Maxi Haninge", -524, "cat-groceries"),
  t("2025-03-26", "iCloud+", -39, "cat-subscriptions", { tagIds: ["tag-subscription"] }),
  t("2025-03-27", "Restaurang Pelikan", -680, "cat-restaurants", { tagIds: ["tag-partner"] }),
  t("2025-03-28", "Coop Konsum", -198, "cat-groceries"),
  t("2025-03-29", "Bauhaus", -845, "cat-other"),
  t("2025-03-30", "Willys", -376, "cat-groceries"),
  t("2025-03-31", "Café Saturnus", -142, "cat-restaurants"),

  // ── February 2025 (for trend comparisons) ──
  t("2025-02-01", "Hyra Februari", -12500, "cat-rent", { tagIds: ["tag-fixed"] }),
  t("2025-02-01", "Lön Företaget AB", 38500, null, { kind: "income" }),
  t("2025-02-05", "ICA Maxi", -612, "cat-groceries"),
  t("2025-02-09", "SL Månadskort", -970, "cat-transit"),
  t("2025-02-14", "Restaurang Operakällaren", -1450, "cat-restaurants", { tagIds: ["tag-partner"] }),
  t("2025-02-18", "Spotify AB", -119, "cat-subscriptions", { tagIds: ["tag-subscription"] }),
  t("2025-02-22", "Elräkning Vattenfall", -910, "cat-electricity"),
  t("2025-02-25", "Hemköp", -388, "cat-groceries"),

  // ── January 2025 (trend) ──
  t("2025-01-01", "Hyra Januari", -12500, "cat-rent", { tagIds: ["tag-fixed"] }),
  t("2025-01-03", "ICA Maxi", -540, "cat-groceries"),
  t("2025-01-12", "SL Månadskort", -970, "cat-transit"),
  t("2025-01-20", "Netflix", -169, "cat-subscriptions", { tagIds: ["tag-subscription"] }),
  t("2025-01-28", "Elräkning Vattenfall", -1020, "cat-electricity"),
];

export const budgets: Budget[] = [
  { id: "bud-transport", categoryId: "cat-transport", limit: 2000, month: null },
  { id: "bud-food", categoryId: "cat-food", limit: 5000, month: null },
  { id: "bud-entertainment", categoryId: "cat-entertainment", limit: 1500, month: null },
  { id: "bud-groceries", categoryId: "cat-groceries", limit: 3000, month: null },
];

export const goals: Goal[] = [
  {
    id: "goal-emergency",
    name: "Emergency Fund",
    icon: "🛟",
    target: 50000,
    baseline: 24000,
    deadline: "2025-12-31",
    accountId: "acc-spar",
    contributions: [
      { id: "gc1", date: "2025-01-31", amount: 3000 },
      { id: "gc2", date: "2025-02-28", amount: 2000 },
      { id: "gc3", date: "2025-03-14", amount: 3000 },
    ],
  },
  {
    id: "goal-japan",
    name: "Japan Trip",
    icon: "🗾",
    target: 25000,
    baseline: 6000,
    deadline: "2025-06-02",
    accountId: "acc-spar",
    contributions: [
      { id: "gc4", date: "2025-02-15", amount: 1500 },
      { id: "gc5", date: "2025-03-10", amount: 1000 },
    ],
  },
];

export const seedDataset: Dataset = { accounts, categories, tags, transactions, budgets, goals };
