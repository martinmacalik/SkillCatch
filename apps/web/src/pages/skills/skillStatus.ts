export type Status = "watchlist" | "learning" | "learned" | "dormant";

export const STATUS_OPTIONS: {
  key: Status;
  label: string;
  active: string;
  inactive: string;
}[] = [
  { key: "watchlist", label: "Watchlist", active: "bg-violet-600 text-white",  inactive: "bg-violet-50 text-violet-700 hover:bg-violet-100" },
  { key: "learning",  label: "Learning",  active: "bg-blue-600 text-white",    inactive: "bg-blue-50 text-blue-700 hover:bg-blue-100" },
  { key: "learned",   label: "Learned",   active: "bg-emerald-600 text-white", inactive: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" },
  { key: "dormant",   label: "Dormant",   active: "bg-slate-500 text-white",   inactive: "bg-slate-50 text-slate-600 hover:bg-slate-100" },
];
