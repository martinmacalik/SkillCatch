# 22 – Editor bloků na stránce Learn

Navazuje na [20 – Komponenty na profilu](20-profil-komponenty-bloky.md) (drag & drop přes `@dnd-kit/core`, uložení textu při `blur`) a [21](21-teach-ukoly-odevzdani.md) (`normalizeUrl` při renderu). Tady jsou hlavně **nové** věci:

- `@dnd-kit/sortable` místo vlastních drop zón
- lokální stav editoru
- ovládání seznamu klávesnicí
- textarea, která roste s textem
- optimistické přeskládání s návratem při chybě

Návrh: [spec](../superpowers/specs/2026-11-27-learn-block-editor-design.md) · plán: [plan](../superpowers/plans/2026-11-27-learn-block-editor.md)

## 1. Co bylo uděláno

Dřív: blok → šipka → **JSON v textovém poli** → uložení až při odchodu z pole (a jen když byl JSON platný).
Teď se píše **přímo do bloku**, který vypadá skoro stejně jako při čtení:

```
⋮⋮  Základní akordy                      [H1][H2][H3]    🗑
⋮⋮  Napiš něco…                                          ← textarea roste s textem
⋮⋮  ( 💡 Tip, warning or note…  )   [Tip][Warning][Note]
⋮⋮  ☐ Nalaď kytaru                                    ×  ← Enter = další krok
    ☐ Zahraj G dur                                    ×  ← Backspace v prázdném = smazat
    + Add step
```

- **6 editorů:** Heading, Text, Callout, Resources, Checklist, Flashcards ([components/learn/editors/](../../apps/web/src/components/learn/editors/)).
- **Přetahování** za ⋮⋮ funguje v obou režimech. *Direct* (editor nebo admin) pořadí uloží rovnou do databáze, *suggestion* (návrh od kohokoli) ho změní jen v lokálním konceptu.
- **Nový blok** je prázdný a kurzor skočí rovnou do něj. Dřív v něm byl text „Section heading“, který se musel smazat.
- **Formát `content` se nezměnil**, takže databáze, schvalování návrhů ani admin aplikace se upravovat nemusely.
- **Bezpečnost navíc:** `ResourceListBlock` dával do `href` cokoli, co bylo v datech, tedy i `javascript:…`. Teď jde odkaz přes `normalizeUrl` (jen http/https), stejně jako na profilu.

## 2. Soubory

| Soubor | Co dělá |
|---|---|
| [editors/BlockEditor.tsx](../../apps/web/src/components/learn/editors/BlockEditor.tsx) | rozcestník: podle `type` vybere editor (mapa `Record<BlockType, Komponenta>`) |
| [editors/*Editor.tsx](../../apps/web/src/components/learn/editors/) | editor pro každý typ, všechny mají props `{ content, onChange, autoFocus }` |
| [editors/AutoTextarea.tsx](../../apps/web/src/components/learn/editors/AutoTextarea.tsx) | textarea, která roste s textem |
| [EditableBlockRow.tsx](../../apps/web/src/components/learn/EditableBlockRow.tsx) | obal bloku: `useSortable`, úchyt, koš, editor |
| [LearnPage.tsx](../../apps/web/src/pages/LearnPage.tsx) | `DndContext` + `SortableContext`, `onDragEnd`, prázdné šablony, `autoFocusId` |
| [blocks/*Block.tsx](../../apps/web/src/components/learn/blocks/) | renderery přeskočí prázdné položky, odkazy jdou přes `normalizeUrl` |

## 3. `@dnd-kit/sortable`: seznam, který se přeskládá sám

Na profilu ([20](20-profil-komponenty-bloky.md)) jsme si drop zóny kreslili sami: mezery mezi řádky a levou a pravou polovinu bloku. Bylo to nutné, protože blok mohl jít **vedle** jiného. Tady je to obyčejný svislý seznam a pro ten má dnd-kit hotovou nadstavbu **sortable**:

```tsx
<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
  <SortableContext items={blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
    {blocks.map(b => <EditableBlockRow key={b.id} block={b} … />)}
  </SortableContext>
</DndContext>
```

Každá položka si zavolá `useSortable`:

```tsx
const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: block.id })
<div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }}>
  <button ref={setActivatorNodeRef} {...listeners} {...attributes}>⋮⋮</button>
```

- **Ostatní bloky samy uhýbají.** `verticalListSortingStrategy` každému spočítá `transform`, takže při tažení se otevře mezera. Drop zóny ani `DragOverlay` nejsou potřeba.
- **`setActivatorNodeRef`:** tahat jde jen za úchyt. Kdyby `listeners` byly na celém bloku, nedalo by se klikat do polí.
- **`CSS.Translate`, ne `CSS.Transform`:** Transform přidává i `scale`, takže by se vysoké bloky při tažení deformovaly.
- Po puštění `onDragEnd` dostane `active.id` a `over.id`. Indexy dohledáme a pole přeskládáme pomocí `arrayMove(pole, from, to)`.

## 4. Optimistické přeskládání s návratem

```ts
const before = data.blocks
const after = arrayMove(before, from, to)
setData({ ...data, blocks: after })                       // 1. hned na obrazovce
reorderLearningBlocks(pageId, after.map(b => b.id))       // 2. uložit (RPC už existovala)
  .catch(() => {
    setData(d => … { ...d, blocks: before })              // 3. chyba → vrátit původní pořadí
    alert('Could not save the new order.')
  })
```

Uživatel nečeká na server, blok skočí hned. Kdyby uložení selhalo, třeba kvůli RLS, stránka se vrátí do stavu, který odpovídá databázi. Proto si `before` schováme **před** změnou. Návrat používá funkční `setData(d => …)`, protože mezitím mohl přijít jiný update (viz [20](20-profil-komponenty-bloky.md), funkční `setState`).

## 5. Lokální stav editoru a ukládání při `blur`

Každý editor si obsah zkopíruje do vlastního stavu **jednou**, při vytvoření:

```ts
const [text, setText] = useState(() => str(content.text))   // funkce = jen při prvním renderu
<input value={text} onChange={e => setText(e.target.value)}
       onBlur={() => { if (text !== content.text) onChange({ ...content, text }) }} />
```

- **Psaní nevolá databázi.** Při každém stisku klávesy se změní jen lokální stav. Uloží se, až kurzor odejde.
- **Proč ne rovnou `value={content.text}`:** každé písmeno by šlo nahoru do LearnPage a v režimu direct by se volal `updateLearningBlock`. To je 50 zápisů na jednu větu.
- **Přepínače (H1–H3, Tip/Warning) a přidání nebo smazání řádku** se ukládají hned. Je to jedna akce, ne psaní.
- Seznamové editory ukládají při každém `blur` a funkce `same(a, b)` (porovnání přes `JSON.stringify`) zbytečný zápis přeskočí, když se nic nezměnilo.

**Pozor na pořadí událostí:** když píšeš a klikneš na koš jiného bloku, prohlížeč nejdřív vyvolá `blur` (text se uloží) a teprve potom `click`. Proto se rozepsaný text neztratí.

## 6. Klávesnice v checklistu: Enter a Backspace + fokus přes ref

```ts
const inputs = useRef<(HTMLInputElement | null)[]>([])   // pole odkazů na inputy
const focusNext = useRef<number | null>(null)            // „po renderu zaostři řádek N“

useEffect(() => {                                        // běží po každém renderu
  if (focusNext.current === null) return
  inputs.current[focusNext.current]?.focus()
  focusNext.current = null
})

// Enter: vlož prázdný řádek za i a řekni, že po renderu má dostat kurzor
const insertAfter = (i: number) => { …; setItems(next); focusNext.current = i + 1 }
```

Zaostřit nový řádek **hned** v `onKeyDown` nejde, protože input ještě neexistuje (React ho vytvoří až v dalším renderu). Proto si do `ref` jen poznamenáme, který řádek chceme, a efekt po renderu ho zaostří.

- `useRef` místo `useState`: změna refu nespustí další render a efekt jen sahá na DOM (`.focus()`), takže lint pravidlo `set-state-in-effect` je spokojené.
- `ref={el => { inputs.current[i] = el }}` je **ref callback**. React ho zavolá s prvkem při vložení do DOM a s `null` při odstranění.
- Backspace maže jen **prázdný** řádek (`it.text === ''`) a `e.preventDefault()` zabrání tomu, aby se smazal i znak v předchozím řádku, kam skočí kurzor.

## 7. Textarea, která roste s textem

```ts
const fit = () => {
  el.style.height = 'auto'                  // 1. nejdřív zmenšit, jinak by se nikdy nezmenšila
  el.style.height = `${el.scrollHeight}px`  // 2. pak nastavit výšku, kterou obsah potřebuje
}
useEffect(fit, [value])                     // po každé změně textu
```

`scrollHeight` je výška celého obsahu včetně toho, co se nevejde. S `overflow-hidden` a `resize-none` se z textarey stane „rostoucí odstavec“, který vypadá jako text při čtení, jen se do něj dá psát.

## 8. Prázdné položky: editor je nechá, čtení je přeskočí

Editor prázdné řádky **nemaže**. Kdyby je při uložení zahodil, řádek, který jsi právě přidal přes „+ Add step“, by po odchodu z pole zmizel. Prázdné položky proto filtrují až renderery:

```ts
const items = ((content.items as Item[]) ?? []).filter(it => it?.text?.trim())
```

Stejně tak `HeadingBlock`, `TextBlock` a `CalloutBlock` vrací `null`, když je text prázdný. Nový prázdný blok, který autor nevyplnil, se čtenářům neukáže jako prázdná mezera.

## 9. Po revizi: data z databáze nejsou vždycky taková, jak čekáš

Nezávislá revize našla tři věci, které „fungovaly“, ale v okrajových případech by ztratily data.

### Obsah bloku čti přes `asText` a `asList`

`content` je volný JSON. Starý řádek může mít `text: 5` místo `"5"` nebo `items` jako objekt místo pole. Kód `(content.text as string).trim()` pak spadne na „trim is not a function“, a protože stránka nemá error boundary, **spadne celá Learn stránka**. Řešení je v [components/learn/content.ts](../../apps/web/src/components/learn/content.ts):

```ts
export const asText = (v: unknown) => typeof v === 'string' ? v : typeof v === 'number' ? String(v) : ''
export const asList = (v: unknown) => Array.isArray(v) ? v.map(x => (x && typeof x === 'object' ? x : {})) : []
```

`as string` v TypeScriptu **nic nekontroluje**, jen říká kompilátoru „věř mi“. U dat zvenku (databáze, API) je bezpečnější skutečná kontrola za běhu přes `typeof` a `Array.isArray`. `asText` navíc převede číslo na text, takže editor po pouhém kliknutí do pole a ven starou hodnotu nesmaže.

### Chyba uložení nesmí být tichá

`updateLearningBlock` při chybě vyhodí výjimku, ale nikdo ji nechytal. Editor ukazoval text jako uložený, a po obnovení stránky byl pryč. Teď `.catch(() => alert(…))`, stejně jako u přeskládání.

### Zápisy jednoho bloku jdou za sebou (fronta slibů)

Píšeš do kroku 2 a klikneš na × u kroku 1. Odejdou dva zápisy: `blur` (text) a `click` (smazání řádku). Síť ale pořadí nezaručuje, takže kdyby první dorazil později, smazaný řádek se vrátí. Proto si pro každý blok pamatujeme poslední rozjetý zápis a další zařadíme za něj:

```ts
const saveQueue = useRef(new Map<string, Promise<void>>())
const prev = saveQueue.current.get(id) ?? Promise.resolve()
const next = prev.then(() => updateLearningBlock(id, content)).catch(() => alert(…))
saveQueue.current.set(id, next)
```

`.then` na předchozím slibu znamená „začni, až ten předchozí skončí“. `.catch` je až na konci, takže i po chybě fronta pokračuje dalším zápisem. Různé bloky se navzájem nečekají.

### Drobnosti

- Návrat po neúspěšném přeskládání vrací **jen pořadí** (seřadí bloky podle `before`), ne obsah. Text uložený mezitím zůstane.
- `AutoTextarea` sleduje i **šířku** přes `ResizeObserver`. Když se okno zúží, text se zalomí na víc řádků a výška se musí přepočítat. Vlastní změnu výšky ignoruje (kontroluje, jestli se změnila šířka), jinak by se volala donekonečna.
- `autoFocusId` se při novém vstupu do editace vynuluje, aby kurzor neskočil do bloku přidaného minule.


## 10. Jak si to vyzkoušet

1. Jako editor otevři Learn → **Edit**, přidej Heading a hned piš (kurzor tam už je).
2. V Checklistu napiš krok, Enter, další krok. Pak v prázdném řádku Backspace.
3. Přetáhni blok za ⋮⋮ jinam a obnov stránku: pořadí drží.
4. Jako běžný uživatel dej **Suggest edits**, přeskládej bloky a obnov stránku bez odeslání: nic se neuložilo.
5. Do Resources napiš `javascript:alert(1)`: pole zčervená a odkaz při čtení nejde prokliknout.

## 11. Kontrolní otázky

1. Proč tady stačí `@dnd-kit/sortable`, ale na profilu jsme drop zóny kreslili sami?
2. Proč je `listeners` na úchytu přes `setActivatorNodeRef`, a ne na celém bloku?
3. Co by se stalo, kdyby se nový řádek checklistu zaostřoval přímo v `onKeyDown`?
4. Proč editor prázdné položky neodstraňuje a dělá to až renderer?
5. Proč si `directReorder` ukládá `before` ještě před `setData`?
6. Proč `(content.text as string).trim()` může shodit stránku, i když TypeScript nic nehlásí?
7. Co zajistí, že se dva zápisy stejného bloku nepředběhnou?
