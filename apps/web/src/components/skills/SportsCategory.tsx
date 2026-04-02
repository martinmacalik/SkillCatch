import { useState } from 'react'
import { ChevronDown, ChevronRight, Plus, Search, Trophy, X } from 'lucide-react'

import { useWikipediaSportsSearch, type SportNode } from '@/hooks/useWikipediaSportsSearch'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

type Subcategory = {
  id: string
  name: string
}

const subcategories: Subcategory[] = [
  { id: 'all', name: 'Všechny sporty' },
  { id: 'summer', name: 'Letní sporty' },
  { id: 'winter', name: 'Zimní sporty' },
  { id: 'team', name: 'Týmové sporty' },
  { id: 'individual', name: 'Individuální sporty' },
  { id: 'water', name: 'Vodní sporty' },
  { id: 'combat', name: 'Bojové sporty' },
]

type SportFormData = {
  sportId: string
  sportName: string
  duration: string
  competitions: string[]
}

export function SportsCategory() {
  const [search, setSearch] = useState('')
  const [selectedSubcategory, setSelectedSubcategory] = useState('all')
  const [selectedSport, setSelectedSport] = useState<SportFormData | null>(null)
  const [newCompetition, setNewCompetition] = useState('')
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())

  const { sections, loading, error } = useWikipediaSportsSearch(selectedSubcategory)

  // Client-side filtering
  const filteredSections = sections.map((section) => ({
    ...section,
    items: filterNodes(section.items, search),
  })).filter((section) => section.items.length > 0)

  function filterNodes(nodes: SportNode[], searchTerm: string): SportNode[] {
    if (!searchTerm.trim()) return nodes

    const term = searchTerm.toLowerCase()
    return nodes
      .map((node) => {
        const matchesName = node.name.toLowerCase().includes(term)
        const filteredChildren = filterNodes(node.children, searchTerm)

        if (matchesName || filteredChildren.length > 0) {
          return { ...node, children: filteredChildren }
        }
        return null
      })
      .filter((node): node is SportNode => node !== null)
  }

  const handleSelectSport = (sportId: string, sportName: string) => {
    setSelectedSport({
      sportId,
      sportName,
      duration: '',
      competitions: [],
    })
  }

  const handleAddCompetition = () => {
    if (!selectedSport || !newCompetition.trim()) return
    setSelectedSport({
      ...selectedSport,
      competitions: [...selectedSport.competitions, newCompetition.trim()],
    })
    setNewCompetition('')
  }

  const handleRemoveCompetition = (index: number) => {
    if (!selectedSport) return
    setSelectedSport({
      ...selectedSport,
      competitions: selectedSport.competitions.filter((_, i) => i !== index),
    })
  }

  const handleSave = () => {
    if (!selectedSport) return
    // TODO: Save to backend/state
    console.log('Saving sport:', selectedSport)
    // Reset form
    setSelectedSport(null)
    setSearch('')
  }

  const toggleNode = (nodeName: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev)
      if (next.has(nodeName)) {
        next.delete(nodeName)
      } else {
        next.add(nodeName)
      }
      return next
    })
  }

  const renderSportNode = (node: SportNode, depth: number = 0) => {
    const hasChildren = node.children && node.children.length > 0
    const isExpanded = expandedNodes.has(node.name)

    return (
      <div key={node.name}>
        <button
          onClick={() => {
            if (hasChildren) {
              toggleNode(node.name)
            } else {
              handleSelectSport(node.name, node.name)
            }
          }}
          className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-zinc-800/50"
          style={{ paddingLeft: `${depth * 1.5 + 1}rem` }}
        >
          {hasChildren ? (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center">
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-zinc-400" />
              ) : (
                <ChevronRight className="h-4 w-4 text-zinc-400" />
              )}
            </div>
          ) : (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
              <Trophy className="h-4 w-4 text-blue-400" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className={`${hasChildren ? 'font-medium text-zinc-300' : 'font-medium'}`}>
              {node.name}
            </div>
            {hasChildren && (
              <div className="mt-0.5 text-xs text-zinc-500">
                {node.children.length} variant{node.children.length !== 1 ? 'y' : 'a'}
              </div>
            )}
          </div>
        </button>
        {hasChildren && isExpanded && (
          <div>{node.children.map((child) => renderSportNode(child, depth + 1))}</div>
        )}
      </div>
    )
  }

  if (selectedSport) {
    return (
      <Card>
        <CardContent className="space-y-6 p-6">
          <div className="flex items-center gap-3 border-b border-zinc-800 pb-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/10">
              <Trophy className="h-6 w-6 text-blue-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">{selectedSport.sportName}</h3>
              <p className="text-sm text-zinc-400">Doplň podrobnosti o tvém skillu</p>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">Jak dlouho tento sport děláš?</label>
            <div className="flex gap-3">
              <input
                type="number"
                min="0"
                placeholder="Např. 5"
                value={selectedSport.duration}
                onChange={(e) =>
                  setSelectedSport({ ...selectedSport, duration: e.target.value })
                }
                className="w-32 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
              <span className="flex items-center text-sm text-zinc-400">let</span>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">Vyhrané soutěže (nepovinné)</label>
            <div className="space-y-3">
              {selectedSport.competitions.map((comp, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2"
                >
                  <span className="text-sm">{comp}</span>
                  <button
                    onClick={() => handleRemoveCompetition(index)}
                    className="text-zinc-400 hover:text-red-400"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}

              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Název soutěže..."
                  value={newCompetition}
                  onChange={(e) => setNewCompetition(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleAddCompetition()
                    }
                  }}
                  className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
                <Button size="sm" onClick={handleAddCompetition} disabled={!newCompetition.trim()}>
                  <Plus className="h-4 w-4" />
                  Přidat
                </Button>
              </div>
            </div>
          </div>

          <div className="flex gap-3 border-t border-zinc-800 pt-4">
            <Button onClick={handleSave} disabled={!selectedSport.duration}>
              Uložit skill
            </Button>
            <Button variant="ghost" onClick={() => setSelectedSport(null)}>
              Zrušit
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {subcategories.map((sub) => (
          <button
            key={sub.id}
            onClick={() => setSelectedSubcategory(sub.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              selectedSubcategory === sub.id
                ? 'bg-blue-500 text-white'
                : 'border border-zinc-700 bg-zinc-900/50 text-zinc-300 hover:bg-zinc-800'
            }`}
          >
            {sub.name}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        <input
          type="text"
          placeholder="Vyhledat sport..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 py-2 pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none"
        />
      </div>

      {loading && (
        <div className="py-8 text-center text-sm text-zinc-400">Načítám sporty z Wikipedie...</div>
      )}

      {error && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="p-4">
            <p className="text-sm text-red-400">Chyba: {error}</p>
          </CardContent>
        </Card>
      )}

      {!loading && !error && filteredSections.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-zinc-400">
            {search ? 'Žádné výsledky' : 'Žádné sporty nenalezeny'}
          </CardContent>
        </Card>
      )}

      {!loading && !error && filteredSections.length > 0 && (
        <div className="space-y-4">
          {filteredSections.map((section) => (
            <Card key={section.title}>
              <CardContent className="p-0">
                <div className="border-b border-zinc-800 px-4 py-3">
                  <h3 className="font-semibold text-zinc-300">{section.title}</h3>
                </div>
                <div className="divide-y divide-zinc-800">
                  {section.items.map((item) => renderSportNode(item))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-3">
        <p className="text-xs text-zinc-400">
          Data z{' '}
          <a
            href="https://en.wikipedia.org"
            target="_blank"
            rel="noreferrer"
            className="text-blue-400 hover:underline"
          >
            Wikipedie
          </a>
          . Pouze top-level sporty jsou zobrazeny, vnořené položky jsou varianty.
        </p>
      </div>
    </div>
  )
}
