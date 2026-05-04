import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useSearch } from "../../contexts/SearchContext";
import AddSkillsView from "./AddSkillsView";
import AllSkillsView from "./AllSkillsView";

type View = "all" | "add";

export default function SkillsPage() {
  const { setQuery } = useSearch();
  const [view, setView] = useState<View>("all");

  const goTo = (v: View) => {
    if (v !== "add") setQuery("");
    setView(v);
  };

  if (view === "add") {
    return (
      <div
        className="flex flex-1 flex-col overflow-y-auto overflow-x-hidden -mx-7 px-7 -mt-5 pt-5 -mb-7 pb-8"
        style={{ scrollbarColor: "rgba(156,163,175,0.5) transparent" }}
      >
        <div className="mb-6 flex items-center gap-3">
          <button
            onClick={() => goTo("all")}
            className="rounded-lg p-1.5 text-gray-400 transition hover:bg-white hover:text-gray-700"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-3xl font-normal text-gray-900">Add Skills</h1>
        </div>
        <AddSkillsView onSkillAdded={() => {}} />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col -mx-7 px-7 -mt-5 pt-5 -mb-7 pb-8 min-h-0">
      <AllSkillsView onGoToAdd={() => goTo("add")} />
    </div>
  );
}
