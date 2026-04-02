import { useEffect, useState } from 'react'

export type SportNode = {
  name: string
  children: SportNode[]
}

export type SportSection = {
  title: string
  items: SportNode[]
}

type UseWikipediaSportsResult = {
  sections: SportSection[]
  loading: boolean
  error: string
}

// Extract only the immediate text of an <li>, excluding nested lists
function getLiOwnText(li: HTMLLIElement): string {
  const clone = li.cloneNode(true) as HTMLLIElement
  clone.querySelectorAll('ul, ol').forEach((n) => n.remove())

  return (clone.textContent || '')
    .replace(/\[\d+]/g, '') // remove citation markers like [1]
    .replace(/\s+/g, ' ')
    .trim()
}

// Recursively build a tree of { name, children } from an <li>
function nodeFromLi(li: HTMLLIElement): SportNode {
  const name = getLiOwnText(li)

  const children = Array.from(li.querySelectorAll(':scope > ul > li, :scope > ol > li'))
    .map((child) => nodeFromLi(child as HTMLLIElement))
    .filter((n) => n.name)

  return { name, children }
}

// Check if an <li> is top-level (not nested inside another <li>)
function isTopLevelLi(li: HTMLLIElement): boolean {
  const parentList = li.parentElement // ul/ol
  if (!parentList) return false

  // If the list is inside another <li>, then this li is nested
  return !parentList.closest('li')
}

// Parse Wikipedia HTML and extract sections with sports
function parseWikipediaListPage(html: string): SportSection[] {
  if (!html || html.length < 100) {
    console.warn('HTML too short or empty:', html.length)
    return []
  }

  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

  const sections: SportSection[] = []
  
  // Try to find the main content
  const contentDiv = doc.querySelector('.mw-parser-output')
  if (!contentDiv) {
    console.warn('No .mw-parser-output found in HTML')
    return []
  }

  // Find all lists in the document
  const allLists = contentDiv.querySelectorAll('ul')
  console.log(`Found ${allLists.length} <ul> lists in document`)

  if (allLists.length === 0) {
    return []
  }

  // Create a single section with all top-level sports
  const mainSection: SportSection = { title: 'Sports', items: [] }
  const seenSports = new Set<string>()

  // Process each list
  for (const list of Array.from(allLists)) {
    // Skip navigation lists, footnotes, etc
    const listClasses = list.className || ''
    if (
      listClasses.includes('navbox') ||
      listClasses.includes('references') ||
      listClasses.includes('metadata')
    ) {
      continue
    }

    // Get direct <li> children
    const directLis = Array.from(list.children).filter(
      (child) => child.tagName.toLowerCase() === 'li'
    )

    for (const li of directLis) {
      const htmlLi = li as HTMLLIElement
      
      // Check if this li is truly top-level
      if (isTopLevelLi(htmlLi)) {
        const sportNode = nodeFromLi(htmlLi)
        
        // Deduplicate and filter out very short names
        if (
          sportNode.name &&
          sportNode.name.length > 1 &&
          !seenSports.has(sportNode.name.toLowerCase())
        ) {
          seenSports.add(sportNode.name.toLowerCase())
          mainSection.items.push(sportNode)
        }
      }
    }
  }

  console.log(`Parsed ${mainSection.items.length} unique sports`)
  
  if (mainSection.items.length > 0) {
    sections.push(mainSection)
  }

  return sections
}

// Fetch Wikipedia page and parse it
async function fetchWikipediaSports(subcategory: string): Promise<SportSection[]> {
  // Map subcategories to Wikipedia page names
  const pageMap: Record<string, string> = {
    all: 'List_of_sports',
    summer: 'Summer_Olympic_sports',
    winter: 'Winter_Olympic_sports',
    team: 'Team_sport',
    individual: 'Individual_sport',
    water: 'List_of_water_sports',
    combat: 'Combat_sport',
  }

  const pageName = pageMap[subcategory] || 'List_of_sports'
  const url = `https://en.wikipedia.org/w/api.php?action=parse&page=${pageName}&format=json&origin=*&prop=text`

  console.log('Fetching Wikipedia page:', pageName, url)

  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const data = await res.json()
  console.log('Wikipedia API response:', data)

  if (data.error) throw new Error(data.error.info)

  const html = data.parse?.text?.['*'] || ''
  console.log('HTML length:', html.length)

  return parseWikipediaListPage(html)
}

export function useWikipediaSportsSearch(subcategory: string): UseWikipediaSportsResult {
  const [sections, setSections] = useState<SportSection[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const ac = new AbortController()

    async function run() {
      try {
        setLoading(true)
        setError('')
        setSections([])

        const parsedSections = await fetchWikipediaSports(subcategory)
        
        if (!ac.signal.aborted) {
          setSections(parsedSections)
          if (parsedSections.length === 0) {
            console.warn('No sections parsed from Wikipedia')
          }
        }
      } catch (e: any) {
        if (e?.name !== 'AbortError' && !ac.signal.aborted) {
          console.error('Wikipedia fetch error:', e)
          setError(e?.message ?? String(e))
        }
      } finally {
        if (!ac.signal.aborted) {
          setLoading(false)
        }
      }
    }

    run()
    return () => ac.abort()
  }, [subcategory])

  return { sections, loading, error }
}
