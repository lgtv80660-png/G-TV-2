"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Tv, Maximize, LayoutGrid, ChevronDown, Check, Search } from "lucide-react";
import { useLiveCategories, useLiveStreams } from "@/lib/hooks";
import { SmartImage } from "@/components/ui/SmartImage";
import { useUI, DEFAULT_FILTER } from "@/store/ui";
import { sortItems, cleanName, cn } from "@/lib/utils";
import type { LiveStream } from "@/lib/xtream/types";

export function LiveBrowser() {
  // 1. Récupération et filtrage des catégories (Exclusion de "Free TV")
  const { data: allCats = [] } = useLiveCategories();
  const cats = useMemo(() => {
    return allCats.filter((c) => !c.category_name.toLowerCase().includes("free"));
  }, [allCats]);

  // 2. Gestion de l'état (Filtres et sélection)
  const filter = useUI((s) => s.filters.live ?? DEFAULT_FILTER);
  const patchFilter = useUI((s) => s.patchFilter);
  const category = filter.category || "all";
  const { sort, query } = filter;

  const setCategory = (id: string) => patchFilter("live", { category: id });

  // État local pour le popover de catégories mobile
  const [isCatOpen, setIsCatOpen] = useState(false);
  const [catSearch, setCatSearch] = useState("");
  const popoverRef = useRef<HTMLDivElement>(null);

  // Fermeture du popover au clic extérieur
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsCatOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredCats = useMemo(() => {
    if (!catSearch.trim()) return cats;
    return cats.filter((c) => c.category_name.toLowerCase().includes(catSearch.toLowerCase()));
  }, [cats, catSearch]);

  const activeCategoryName = useMemo(() => {
    if (category === "all") return "All categories";
    return cats.find((c) => c.category_id === category)?.category_name || "All categories";
  }, [category, cats]);

  // État local pour la chaîne sélectionnée
  const [activeChannel, setActiveChannel] = useState<LiveStream | null>(null);

  // 3. Récupération et filtrage des chaînes
  const { data, isLoading } = useLiveStreams(category === "all" ? undefined : category);

  const filtered = useMemo(() => {
    let items = data ?? [];
    const q = query.trim().toLowerCase();
    if (q) items = items.filter((c) => cleanName(c.name).toLowerCase().includes(q));
    return sortItems(items, sort);
  }, [data, query, sort]);

  // Génération de l'URL du lecteur Lumen
  const watchUrl = activeChannel
    ? `/watch?type=live&id=${activeChannel.stream_id}&ext=ts&title=${encodeURIComponent(cleanName(activeChannel.name))}`
    : null;

  return (
    <div className="flex flex-col md:flex-row h-auto md:h-[calc(100vh-80px)] w-full overflow-hidden border-t border-white/5">
      
      {/* BARRE POPUP CATÉGORIES (Mobile Uniquement : md:hidden) */}
      <div className="block md:hidden p-3 border-b border-white/5 relative z-40" ref={popoverRef}>
        <button
          onClick={() => setIsCatOpen(!isCatOpen)}
          className="w-full flex items-center justify-between glass px-4 py-3 rounded-2xl text-xs font-semibold text-white border border-white/10 shadow-xl active:scale-[0.99] transition-all"
        >
          <div className="flex items-center gap-2.5 truncate">
            <LayoutGrid className="w-4 h-4 text-iris-400 flex-shrink-0" />
            <span className="truncate">{activeCategoryName}</span>
          </div>
          <ChevronDown className={`w-4 h-4 text-fog-400 transition-transform duration-200 ${isCatOpen ? "rotate-180" : ""}`} />
        </button>

        {isCatOpen && (
          <div className="absolute top-full left-3 right-3 mt-2 panel rounded-2xl border border-white/10 p-2.5 shadow-2xl space-y-2 animate-in fade-in zoom-in-95 duration-150">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-fog-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search categories..."
                value={catSearch}
                onChange={(e) => setCatSearch(e.target.value)}
                className="w-full bg-ink-950 border border-white/10 rounded-xl text-xs pl-8 pr-3 py-2 text-white placeholder-fog-500 focus:outline-none focus:border-iris-400"
              />
            </div>

            <div className="max-h-60 overflow-y-auto space-y-1 pr-1">
              <button
                onClick={() => {
                  setCategory("all");
                  setIsCatOpen(false);
                }}
                className={cn(
                  "w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-colors",
                  category === "all" ? "bg-iris-500/20 text-iris-400 font-bold" : "text-fog-200 hover:bg-ink-800"
                )}
              >
                <span>All categories</span>
                {category === "all" && <Check className="w-3.5 h-3.5 text-iris-400" />}
              </button>

              {filteredCats.map((c) => (
                <button
                  key={c.category_id}
                  onClick={() => {
                    setCategory(c.category_id);
                    setIsCatOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-colors text-left",
                    category === c.category_id ? "bg-iris-500/20 text-iris-400 font-bold" : "text-fog-200 hover:bg-ink-800"
                  )}
                >
                  <span className="truncate pr-2">{c.category_name}</span>
                  {category === c.category_id && <Check className="w-3.5 h-3.5 text-iris-400 flex-shrink-0" />}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* COLONNE 1 : Catégories (Web Uniquement : hidden md:flex) */}
      <div className="hidden md:flex w-1/4 max-w-[280px] shrink-0 border-r border-white/5 bg-ink-900/50 flex-col">
        <div className="p-4 border-b border-white/5 font-semibold text-fog-200">Catégories</div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          <button
            onClick={() => setCategory("all")}
            className={cn(
              "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors",
              category === "all" ? "bg-iris-500/20 text-iris-400" : "hover:bg-ink-800 text-fog-400"
            )}
          >
            Toutes les chaînes
          </button>
          {cats.map((c) => (
            <button
              key={c.category_id}
              onClick={() => setCategory(c.category_id)}
              className={cn(
                "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors truncate",
                category === c.category_id ? "bg-iris-500/20 text-iris-400" : "hover:bg-ink-800 text-fog-400"
              )}
            >
              {c.category_name}
            </button>
          ))}
        </div>
      </div>

      {/* COLONNE 2 : Chaînes (Liste verticale) */}
      <div className="w-full md:w-1/3 md:min-w-[300px] md:shrink-0 border-r border-white/5 bg-ink-900/30 flex flex-col h-[320px] md:h-full">
        <div className="p-4 border-b border-white/5 flex items-center justify-between">
          <span className="font-semibold text-fog-200">Chaînes</span>
          <span className="text-xs text-fog-500">{filtered.length} chaînes</span>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {isLoading ? (
            <p className="text-center text-sm text-fog-500 mt-10">Chargement...</p>
          ) : filtered.length === 0 ? (
            <p className="text-center text-sm text-fog-500 mt-10">Aucune chaîne</p>
          ) : (
            filtered.map((c) => (
              <button
                key={c.stream_id}
                onClick={() => setActiveChannel(c)}
                className={cn(
                  "w-full flex items-center gap-3 p-2 rounded-lg transition-colors text-left",
                  activeChannel?.stream_id === c.stream_id ? "bg-ink-800" : "hover:bg-ink-850"
                )}
              >
<div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-ink-950 overflow-hidden border border-white/5">
  {c.stream_icon ? (
    <img
      src={c.stream_icon.startsWith("http://") ? `/api/image-proxy?url=${encodeURIComponent(c.stream_icon)}` : c.stream_icon}
      alt={c.name}
      className="h-full w-full object-contain p-1"
      onError={(e) => {
        // En cas d'erreur de chargement, remplace par l'icône TV
        (e.target as HTMLElement).style.display = "none";
        (e.target as HTMLElement).nextElementSibling?.classList.remove("hidden");
      }}
    />
  ) : null}
  <Tv className={`h-5 w-5 text-fog-600 ${c.stream_icon ? "hidden" : ""}`} />
</div>
                <span className="truncate text-sm font-medium text-fog-200 flex-1">{cleanName(c.name)}</span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* COLONNE 3 : Aperçu du Player */}
      <div className="flex-1 bg-ink-950 flex flex-col p-4 md:p-6">
        {activeChannel ? (
          <div className="w-full max-w-5xl mx-auto space-y-4">
            <div className="aspect-video w-full bg-black rounded-xl overflow-hidden relative border border-white/10 shadow-2xl group">
              <iframe
                src={watchUrl!}
                className="w-full h-full pointer-events-none"
                allow="autoplay; fullscreen"
              />
              <Link
                href={watchUrl!}
                className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm"
              >
                <div className="bg-iris-500 text-ink-950 px-6 py-3 rounded-full font-bold flex items-center gap-2 transform hover:scale-105 transition-transform">
                  <Maximize className="h-5 w-5" />
                  Regarder en plein écran
                </div>
              </Link>
            </div>

            <div className="px-2">
              <h2 className="text-xl md:text-2xl font-bold text-white">{cleanName(activeChannel.name)}</h2>
              <p className="text-fog-400 mt-1 text-xs md:text-sm">Cliquez sur la vidéo pour basculer vers le lecteur complet.</p>
            </div>
          </div>
        ) : (
          <div className="h-[220px] md:h-full flex flex-col items-center justify-center text-fog-500 space-y-4">
            <Tv className="h-12 md:h-16 w-12 md:w-16 opacity-20" />
            <p className="text-xs md:text-sm">Sélectionnez une chaîne dans la liste pour afficher l'aperçu</p>
          </div>
        )}
      </div>

    </div>
  );
}
