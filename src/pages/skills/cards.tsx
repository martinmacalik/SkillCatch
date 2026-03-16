import { useRef } from "react";
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { colorForIndex, type SkillNode } from "./types";

/* ── Horizontal scroll row ── */

export function ScrollRow({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: "left" | "right") =>
    ref.current?.scrollBy({ left: dir === "left" ? -320 : 320, behavior: "smooth" });

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-2xl font-normal text-gray-900">{label}</h2>
        <div className="flex gap-1">
          <button
            onClick={() => scroll("left")}
            className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-200 hover:text-gray-600"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            onClick={() => scroll("right")}
            className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-200 hover:text-gray-600"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>
      <div
        ref={ref}
        className="flex gap-4 overflow-x-auto -mx-7 px-7 pt-6 -mt-6 pb-8 -mb-8"
        style={{ scrollbarWidth: "none" }}
      >
        {children}
      </div>
    </section>
  );
}

/* ── Leaf skill card (small, horizontal-scrollable) ── */

export function LeafCard({
  node,
  numUsers,
  index,
  action,
}: {
  node: SkillNode;
  numUsers: number;
  index: number;
  action?: { type: "add"; onClick: () => void } | { type: "remove"; onClick: () => void };
}) {
  return (
    <div
      className="flex w-56 shrink-0 cursor-pointer flex-col rounded-2xl bg-white transition hover:-translate-y-0.5"
      style={{ boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}
    >
      <div className="relative p-2.5 pb-0">
        {node.image_url ? (
          <img
            src={node.image_url}
            alt={node.name}
            className="h-[164px] w-full rounded-xl object-cover"
          />
        ) : (
          <div className={`h-[164px] w-full rounded-xl ${colorForIndex(index)}`} />
        )}
        {action && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              action.onClick();
            }}
            className={`absolute right-4 top-4 rounded-lg p-1.5 text-white shadow-md transition ${
              action.type === "add"
                ? "bg-purple-600 hover:bg-purple-700"
                : "bg-gray-400 hover:bg-red-500"
            }`}
          >
            {action.type === "add" ? (
              <Plus className="h-3.5 w-3.5" />
            ) : (
              <X className="h-3.5 w-3.5" />
            )}
          </button>
        )}
      </div>
      <div className="flex flex-1 flex-col px-3.5 pb-3 pt-3">
        <p className="text-lg font-medium leading-snug text-gray-900">{node.name}</p>
        <p className="mt-auto pt-6 text-[11px] text-gray-400">
          {numUsers >= 1000 ? `${(numUsers / 1000).toFixed(0)}k` : numUsers} people assigned
        </p>
      </div>
    </div>
  );
}

/* ── Branch / category card (wider, grid) ── */

export function BranchCard({
  node,
  numUsers,
  index,
  onClick,
}: {
  node: SkillNode;
  numUsers: number;
  index: number;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className="flex w-full cursor-pointer flex-col rounded-2xl bg-white transition hover:-translate-y-0.5"
      style={{ boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}
    >
      <div className="p-3 pb-0">
        {node.image_url ? (
          <img
            src={node.image_url}
            alt={node.name}
            className="h-28 w-full rounded-xl object-cover"
          />
        ) : (
          <div className={`h-28 w-full rounded-xl ${colorForIndex(index)}`} />
        )}
      </div>
      <div className="px-4 pb-5 pt-4">
        <p className="text-2xl font-normal leading-snug text-gray-900">{node.name}</p>
        <p className="mt-8 text-xs text-gray-400">
          {numUsers >= 1000 ? `${(numUsers / 1000).toFixed(0)}k` : numUsers} skills located here
        </p>
      </div>
    </div>
  );
}
