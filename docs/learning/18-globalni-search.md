# 18 – Globální search (⌘K) přes celou aplikaci

## 1. Co bylo uděláno

Pole v horní liště dřív fungovalo jen na Skills a v Chats. Jinde jen ukazovalo placeholder. Teď **hledá všechno a všude**, podobně jako `⌘P` ve VS Code:

```
┌ guit ─────────────────────────────────────────────┐
│ MY SKILLS                                         │
│   🎸 Guitar · Learning                        ↵   │
│ ACTIONS                                           │
│   ⏱ Track time on Guitar                          │
│   ➕ Create skill "guit"                          │
│ NEW SKILLS                                        │
│   Bass Guitar · Guitar Fingerstyle                │
│   All new skills · 30                          ›  │  ← zúží hledání jen na tuhle kategorii
│ PEOPLE                                            │
│   Jana N. · @jana                                 │
└───────────────────────────────────────────────────┘
```

- **Kategorie:** moje skilly, chaty, akce, stránky, nastavení, nové skilly, lidi, učitelé, nápověda a odměny.
- **Zúžení na kategorii:** klik na „All … ›“, klávesa `Tab`, nebo prefix `>` (akce), `@` (lidi), `#` (moje skilly). V poli se pak objeví štítek `[New skills ×]` a hledá se jen v ní. `Backspace` / `Esc` / `×` štítek zruší.
- **Pořadí sekcí:** první je ta, ke které patří aktuální stránka (na Skills moje skilly, v Teach učitelé).
- **Stránky se seznamem** (Chats, Discover, Add Skills) dál filtrují svůj seznam. Search pod polem ukáže jen „Also found: People · 3 ›“, aby seznam nezakryl.
- **Výsledek z nastavení nebo nápovědy** odscrolluje na sekci a na chvíli ji fialově rozsvítí.
- **Mobil:** lupa v liště otevře hledání přes celou obrazovku.
- **Discover** už nemá vlastní pole, filtruje podle horní lišty.

## 2. Nové a změněné soubory

| Soubor | Co dělá |
|---|---|
| `supabase/migrations/20261125001_global_search.sql` | **nová** RPC `global_search()`: moje skilly, nové skilly, lidi, učitelé |
| `src/components/search/GlobalSearch.tsx` | **nová** komponenta: pole, panel, klávesnice, mobilní overlay |
| `src/lib/search/search-index.ts` | **nový**: statický seznam akcí, stránek, nastavení a nápovědy |
| `src/lib/search/match.ts` | **nový**: skóre shody + místo pro zvýraznění |
| `src/lib/search/search-queries.ts` | **nový**: typy a volání RPC |
| `src/hooks/usePageSearchScope.ts` | **nový**: stránka řekne „tuhle kategorii filtruju sama“ |
| `src/hooks/useSearchFocus.ts` | **nový**: po příchodu ze search odscrolluje a rozsvítí sekci |
| `src/contexts/SearchContext.tsx` | přibyl `pageScope` |
| `TopBar`, `ChatsPage`, `DiscoverPage`, `AddSkillsView`, `SettingsPage`, `HelpPage`, `TimeTrackerCard`, `index.css` | napojení |

## 3. Kde se co hledá

Ne všechno musí do databáze:

| Co | Kde se hledá | Proč |
|---|---|---|
| Akce, stránky, nastavení, nápověda | v prohlížeči | je to pevný seznam v kódu, výsledek je okamžitě |
| Chaty | v prohlížeči | konverzace se stáhnou jednou při otevření panelu, je jich málo |
| Moje / nové skilly, lidi, učitelé | **jedna** RPC | data jsou v databázi a je jich hodně |

Jedno volání místo čtyř: funkce vrátí najednou výsledky i počty pro všechny čtyři kategorie. Méně čekání a méně requestů.

## 4. Databáze

### 4.1 `SECURITY INVOKER` – tentokrát schválně bez zvláštních práv

V lekcích 13 a 17 měly funkce `SECURITY DEFINER`: běžely s právy vlastníka a RLS je neomezovalo, protože potřebovaly zapisovat nebo číst cizí data.

Search nic takového nepotřebuje, a proto běží jako **volající uživatel**:

```sql
CREATE OR REPLACE FUNCTION public.global_search(...)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
```

RLS tak dál platí: neschválené skilly, cizí čekající skilly i vyřazené skilly z licencí se do výsledků nedostanou samy. Funkce jen šetří requesty a nemusí nic hlídat znovu. **Pravidlo:** DEFINER jen tam, kde opravdu potřebuješ víc práv, než má uživatel.

`STABLE` říká, že funkce nic nemění, jen čte. Postgres s ní pak může zacházet volněji.

### 4.2 Hledaný text je data, ne vzor

```sql
v_esc := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_');
v_any := '%' || v_esc || '%';
...
WHERE k.key LIKE v_any
```

V `LIKE` mají `%` (cokoliv) a `_` (jeden znak) zvláštní význam. Kdyby uživatel napsal `_`, našlo by to všechno. Proto se nejdřív **escapují**: `\%` = opravdové procento. Nejdřív se zdvojí zpětné lomítko, jinak by se rozbilo escapování samo.

Totéž ve frontendu na Discover, kde se text skládá do filtru `or(...)`:

```ts
const q = peopleQuery.trim().replace(/[,()%*]/g, ' ').trim()
```

Čárka a závorky by rozbily syntaxi PostgREST filtru.

### 4.3 Překlepy: trigramy

Rozšíření `pg_trgm` rozseká text na trojice písmen (`kytara` → `kyt`, `yta`, `tar`, `ara`). `similarity(a, b)` vrátí 0–1 podle toho, kolik trojic mají texty společných:

```sql
AND (k.key LIKE v_any OR (v_fuzzy AND similarity(k.key, v_q) > 0.3))
```

- `kytra` najde `kytara`, i když neobsahuje přesný podřetězec.
- `v_fuzzy` je zapnuté až od 3 znaků, protože u kratších textů by „podobné“ bylo skoro všechno.
- `skill_name_key()` (lekce 8) text předtím převede na malá písmena bez diakritiky, takže `Čeština` = `cestina`.

### 4.4 Výsledky + celkový počet v jednom dotazu: okenní funkce

Panel ukáže 2 řádky, ale potřebuje vědět, že jich je celkem 30 („All new skills · 30 ›“). Dva dotazy (jeden `LIMIT`, jeden `count`) nejsou potřeba:

```sql
SELECT jsonb_build_object(
         'count', coalesce(max(total), 0),
         'items', coalesce(jsonb_agg(item ORDER BY rn) FILTER (WHERE rn <= v_lim), '[]'::jsonb))
FROM (
  SELECT jsonb_build_object('id', n.id, 'name', n.name) AS item,
         count(*) OVER () AS total,                       -- kolik řádků prošlo WHERE, na každém řádku
         row_number() OVER (ORDER BY ...) AS rn           -- pořadí podle relevance
  FROM skill_nodes n
  WHERE ...
) x
```

- **`count(*) OVER ()`**: okenní funkce. Na rozdíl od obyčejného `count(*)` řádky **neslučuje**. Každý řádek dostane celkový počet jako další sloupec.
- **`row_number() OVER (ORDER BY …)`** očísluje řádky 1, 2, 3… podle relevance.
- **`jsonb_agg(...) FILTER (WHERE rn <= v_lim)`** složí do pole jen prvních N. `FILTER` je podmínka jen pro tuhle jednu agregaci.
- `coalesce(..., '[]')`: když nic nenajde, `jsonb_agg` vrátí `NULL`, ale frontend chce prázdné pole.

### 4.5 Řazení podle více kritérií

```sql
row_number() OVER (ORDER BY
  (k.key LIKE v_prefix) DESC,          -- začíná tím → nahoru (true > false)
  us.pinned DESC,                      -- připnuté
  us.last_opened_at DESC NULLS LAST,   -- naposledy otevřené
  similarity(k.key, v_q) DESC,         -- podobnost
  n.name)                              -- nakonec abecedně
```

Podmínka v `ORDER BY` vrací `boolean`, a `DESC` dá `true` dopředu. Tak se jednoduše řekne „tohle má přednost“.

### 4.6 `CROSS JOIN LATERAL`: spočítat hodnotu jednou

```sql
FROM skill_nodes n
CROSS JOIN LATERAL (SELECT public.skill_name_key(n.name) AS key) k
WHERE k.key LIKE v_any ...
ORDER BY (k.key LIKE v_prefix) DESC, similarity(k.key, v_q) DESC
```

`LATERAL` je poddotaz, který vidí sloupce předchozí tabulky (`n.name`). Výsledek (`k.key`) se pak dá použít ve `WHERE`, `ORDER BY` i `SELECT` bez opakování volání funkce. Je to „lokální proměnná na řádek“.

### 4.7 Skládání JSON odpovědi

```sql
r := '{}'::jsonb;
IF p_only IS NULL OR p_only = 'my_skills' THEN
  r := r || jsonb_build_object('my_skills', (...));
END IF;
```

`||` u `jsonb` **spojí dva objekty** (`{"a":1} || {"b":2}` = `{"a":1,"b":2}`). S parametrem `p_only` se při rozkliknutí kategorie počítá jen ta jedna.

## 5. Frontend

### 5.1 Skóre shody jako ve VS Code

```ts
export function matchScore(query: string, title: string, keywords = ''): number {
  const q = searchKey(query).trim()
  const t = searchKey(title)
  if (t.startsWith(q)) return 100                                    // "Set…" → Settings
  if (t.split(/[\s\-/·]+/).some((w) => w.startsWith(q))) return 80   // "pho…" → Profile photo
  if (t.includes(q)) return 60
  if (keywords && searchKey(keywords).includes(q)) return 40         // "avatar" → Profile photo
  if (q.length >= 2 && isSubsequence(q, t)) return 20                // "stg" → Settings
  return 0
}
```

- Vyšší číslo = lepší shoda, výsledky se seřadí `sort((a, b) => b.score - a.score)`.
- **`keywords`**: slova, která člověk napíše, i když nejsou v názvu („dark mode“ → Theme). Díky nim search „chápe“ synonyma.
- **Subsequence** (písmena ve stejném pořadí, s mezerami): tak funguje `⌘P` ve VS Code, `gsrch` najde `GlobalSearch`.

```ts
function isSubsequence(needle: string, haystack: string): boolean {
  let i = 0
  for (const ch of haystack) {
    if (ch === needle[i]) i++
    if (i === needle.length) return true
  }
  return false
}
```

### 5.2 Zvýraznění shody i s diakritikou

```ts
export function matchRange(query: string, text: string): [number, number] | null {
  const q = searchKey(query).trim()
  const t = searchKey(text)
  if (!q || t.length !== text.length) return null
  const i = t.indexOf(q)
  return i < 0 ? null : [i, i + q.length]
}
```

Hledá se v textu bez diakritiky, ale zvýraznit se má originál. `searchKey` u latinky mění znak za znak (`Č` → `c`), takže **indexy sedí**. Kdyby délky nesouhlasily (exotické znaky), radši se nezvýrazní nic, než aby se zvýraznilo špatně.

```tsx
{text.slice(0, r[0])}
<mark className="bg-purple-100">{text.slice(r[0], r[1])}</mark>
{text.slice(r[1])}
```

`[number, number]` je **tuple**: pole s přesně dvěma čísly, každé má svůj význam (začátek, konec).

### 5.3 Akce jako data

Statické položky jsou jen data. Co se má stát, je popsané objektem, ne funkcí:

```ts
export type StaticRun =
  | { kind: 'go'; to: string; state?: Record<string, unknown> }
  | { kind: 'logout' }

{ id: 'a-new-chat', category: 'actions', title: 'New chat', keywords: 'message write',
  icon: MessageCirclePlus, run: go('/dashboard/chats', { newChat: true }) }
```

Komponenta to pak „vykoná“:

```ts
if (e.run.kind === 'logout') return supabase.auth.signOut().then(() => navigate('/'))
navigate(e.run.to, e.run.state ? { state: e.run.state } : undefined)
```

Výhoda: seznam nepotřebuje `navigate` ani React, je to obyčejný soubor dat. **Navigace se stavem** (`state: { newChat: true }`) pak cílové stránce řekne, co má udělat. Chats otevře modal, Skills formulář „Create skill“ s předvyplněným názvem.

Pravidla odměn se do nápovědy **generují** z `REWARD_GROUPS` (lekce 12). Když přibude odměna, search ji najde sám.

### 5.4 Klávesnice: jeden plochý seznam

Výsledky jsou po sekcích, ale šipky nahoru/dolů musí jít přes všechno, i přes řádky „All … ›“. Proto vznikne **plochý seznam** `items` a v něm se pohybuje jeden index:

```ts
type Item = { kind: 'row'; row: Row } | { kind: 'more'; category: Category; total: number }

case 'ArrowDown': setActiveIndex((active + 1) % items.length)   // % = na konci skočí na začátek
```

Při vykreslování je potřeba vědět, který řádek má jaký index. První verze ho počítala přičítáním proměnné uvnitř JSX (`i += 1`), a to ESLint (`react-hooks/immutability`) zakázal: render má být čistý výpočet. Řešení je spočítat indexy **předem** v obyčejné funkci:

```ts
function indexSections(sections: Section[], scope: Category | null) {
  let next = 0
  return sections.map((section) => {
    const rowIndexes = section.rows.map(() => next++)
    const moreIndex = !scope && section.total > section.rows.length ? next++ : null
    return { section, rowIndexes, moreIndex }
  })
}
```

Mimo komponentu je lokální proměnná v pořádku: funkce dostane vstup a vrátí výsledek.

### 5.5 Focus zůstává v poli: `onMouseDown` + `preventDefault`

```tsx
<button onMouseDown={(e) => e.preventDefault()} onClick={onPick}>
```

Klik má dvě fáze: `mousedown` (tady prohlížeč přesune focus na tlačítko, input dostane `blur`) a `click`. Kdyby input ztratil focus, panel by se zavřel dřív, než klik doběhne. `preventDefault()` na `mousedown` přesun focusu zruší, ale `click` proběhne normálně. Stejný trik používá `ComboboxList` u licencí.

### 5.6 ARIA pro našeptávač

```tsx
<input role="combobox" aria-expanded={open} aria-controls="global-search-results"
       aria-activedescendant={active >= 0 ? `gs-item-${active}` : undefined} />
<button id="gs-item-3" role="option" aria-selected={active === 3}>
```

Focus zůstává v inputu, ale čtečka obrazovky přes `aria-activedescendant` ví, který řádek je zrovna „vybraný“. Proto každý řádek potřebuje unikátní `id`. Stejné `id` použije `scrollIntoView({ block: 'nearest' })`, aby vybraný řádek nikdy neujel z panelu.

### 5.7 ⌘K a skryté pole

```ts
const onKey = (e: KeyboardEvent) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()                                  // Ctrl+K jinak skočí do adresního řádku
    if (inputRef.current && inputRef.current.offsetParent === null) onRequestOverlay?.()
    else inputRef.current?.focus()
  }
}
```

- `metaKey` = ⌘ na Macu, `ctrlKey` = Ctrl na Windows.
- **`offsetParent === null`** znamená, že prvek není vidět (`display: none`, tedy mobil, kde je pole schované). Pak se místo focusu otevře overlay přes celou obrazovku.

### 5.8 Stránka řekne „tohle filtruju sama“

```ts
export function usePageSearchScope(scope: PageScope) {
  const { setPageScope } = useSearch()
  useEffect(() => {
    setPageScope(scope)
    return () => setPageScope(null)   // odchod ze stránky → zase normální panel
  }, [scope, setPageScope])
}

// ChatsPage
usePageSearchScope('chats')
```

Search v liště nemusí znát stránky. Stránka se při mountu sama přihlásí do kontextu a při unmountu odhlásí. Panel podle toho přepne do kompaktního „Also found“.

Hook je ve vlastním souboru, ne v `SearchContext.tsx`. Pravidlo `react-refresh/only-export-components` chce, aby soubor s komponentou (Provider) exportoval jen komponenty, jinak hot reload při vývoji přenačte celou stránku.

### 5.9 Skok na sekci a zopakování CSS animace

```ts
const el = document.getElementById(focus)
el.scrollIntoView({ behavior: 'smooth', block: 'start' })
el.classList.remove('search-flash')
void el.offsetWidth          // donutí prohlížeč přepočítat layout
el.classList.add('search-flash')
```

Animace se spustí, když třída **přibude**. Když ji element už má (dvakrát po sobě hledáš „Theme“), odebrání a okamžité přidání prohlížeč sloučí a nic se nestane. Přečtení `offsetWidth` prohlížeč donutí změnu mezi tím opravdu provést, takže animace jede znova. `void` říká „hodnotu nepotřebuju, jde jen o vedlejší efekt“.

```css
@keyframes search-flash {
  0%, 35% { box-shadow: 0 0 0 3px rgb(168 85 247 / 0.55); }
  100%    { box-shadow: 0 0 0 3px rgb(168 85 247 / 0); }
}
```

`box-shadow` bez rozmazání (`0 0 0 3px`) vypadá jako rámeček, ale neposune layout jako `border`.

`scroll-mt-4` (Tailwind `scroll-margin-top`) nechá nad sekcí po odscrollování trochu místa.

## 6. Jak otestovat

1. Spustit migraci `20261125001_global_search.sql`, až po `20261124001`, protože používá `license_skills.status`.
2. Napsat kus názvu svého skillu: nahoře „My skills“ a akce „Track time on …“, která spustí stopky.
3. Napsat `@` a jméno: hledá se jen v lidech.
4. Na Discover napsat jméno: mřížka se filtruje, pod polem je jen „Also found“.
5. Napsat „dark“: Settings · Theme → stránka odscrolluje na Preferences a rozsvítí je.
6. Napsat „kytra“ (překlep): pořád najde „Kytara“.
7. Mobil: lupa v liště → hledání přes celou obrazovku.

## 7. Co dál (v2)

- Hledání v obsahu Learn stránek a ve zprávách. Bude potřeba fulltext (`tsvector`) a index, aby to nebylo pomalé.
- Výsledek z nastavení skočí na sekci, ne na konkrétní pole.
- „Nedávno hledané“ v prázdném panelu.
