# 20 – Komponenty na profilu (bloky v řádcích)

Navazuje na [19 – Profil jako stránka ve stylu Notionu](19-profil-stranka-notion-styl.md). Tlačítko **+** pod hlavičkou profilu už neukazuje „Coming soon“, ale přidává bloky. Tahle poznámka popisuje hlavně věci, které v dřívějších poznámkách nebyly: drag & drop přes `@dnd-kit`, React Context, jednorázový převod dat v migraci a ochranu odkazů.

## 1. Co bylo uděláno

```
┌─ řádek ─────────────────────────────────────────────┐
│ [ Text            ] [ Obrázek          ]       (+)  │ ← + vedle řádku = blok do stejného řádku
└─────────────────────────────────────────────────────┘
┌─ řádek ─────────────────────────────────────────────┐
│ [ Skill spotlight          ] [ Skill list         ] │
└─────────────────────────────────────────────────────┘
  (+)                                                   ← + dole = nový řádek
```

- **5 bloků:** Text, Image, Embed (YouTube nebo odkaz), Skill list a Skill spotlight.
- **Bloky se skládají vedle sebe.** Kombinovaný typ „text s obrázkem“ už neexistuje, jsou to prostě dva bloky v jednom řádku. Řádek pojme nejvýš 3 bloky. Spotlight potřebuje místo, takže smí být nejvýš ve dvojici.
- **Přesun:** při najetí myší se objeví úchyt ⋮⋮. Blok jde přetáhnout vedle jiného bloku (svislá modrá čára) nebo mezi řádky (vodorovná čára = nový řádek).
- **Skillové bloky ukazují živá data** (aktuální level, progres, atributy) a odznak **„Teaches · verified“**, pokud skill učíš. Spotlight navíc ukáže čas z time trackeru, který jde vypnout přepínačem **Show time**.
- **Návštěvník** si skill z cizího profilu může přidat k sobě (stejný modal jako u karty v chatu).
- Na mobilu se bloky v řádku složí pod sebe.

## 2. Nové a změněné soubory

| Soubor | Co dělá |
|---|---|
| [20261126001_profile_components.sql](../../supabase/migrations/20261126001_profile_components.sql) | sloupce `row_index` a `col_index`, nové typy, převod starých karet, RPC `save_profile_layout` a `get_profile_skills` |
| [lib/profile-blocks.ts](../../apps/web/src/lib/profile-blocks.ts) | typy, dotazy a **čisté funkce rozložení** (`toRows`, `flatten`, `canJoinRow`, `moveBlock`), YouTube a URL helpery |
| [components/profile-blocks/](../../apps/web/src/components/profile-blocks/) | `EditableBlocks` (editor + drag & drop), `ReadOnlyBlocks` (veřejný profil), `registry.tsx`, `BlocksContext.ts`, `AddBlockMenu`, `SkillPicker`, `blocks/*` |
| [components/skills/SkillVisuals.tsx](../../apps/web/src/components/skills/SkillVisuals.tsx) | `LevelDots`, `ProgressBar`, `StatusPill`, `TeachesBadge`: sdílí je chat karta i profil |
| [lib/skill-format.ts](../../apps/web/src/lib/skill-format.ts) | `formatAttrValue` (přesunuto ze `SkillShareCard`) |
| [ProfileBuilderPage.tsx](../../apps/web/src/pages/ProfileBuilderPage.tsx), [PublicProfilePage.tsx](../../apps/web/src/pages/PublicProfilePage.tsx) | zapojení bloků |
| ~~`components/profile-builder/`~~ | **smazáno** (starý seznam karet a editor v bočním panelu) |

## 3. Datový model: řádky a sloupce místo stromu

Každý blok je jeden řádek tabulky `profile_cards` a nese si svou pozici:

```
row_index = 0   col_index = 0 | col_index = 1
row_index = 1   col_index = 0
```

Zvažovali jsme i strom jako v Notionu (blok „columns“ s dětmi přes `parent_id`). Ten by umožnil vnořování, které na profilu nikdo nepotřebuje, a výrazně by zkomplikoval načítání i přetahování. **Plochá tabulka + dvě čísla** stačí a RLS, bucket i dotazy zůstávají stejné.

**Proč ne `row` a `col`?** `ROW` je v PostgreSQL rezervované slovo (`ROW(1, 2)` je konstruktor záznamu). Sloupec by se musel všude psát v uvozovkách, proto `row_index`.

### Rozložení jako čisté funkce

Logika rozložení vůbec nesahá na React ani na databázi. Dostane pole a vrátí nové pole:

```ts
toRows(blocks)        // [Block] → [[Block, Block], [Block]]   (seskupí podle row_index)
flatten(rows)         // zpátky + přečísluje 0, 1, 2 … bez mezer
canJoinRow(row, type) // max 3, spotlight max ve dvojici
moveBlock(rows, id, target) // nové rows, nebo null = takhle to nejde
```

Výhoda: dá se o tom přemýšlet (i testovat) bez prohlížeče a editor jen zavolá `moveBlock` → `flatten` → uloží.

Zajímavý detail v `moveBlock`: při přesunu do mezery mezi řádky se nový řádek **vloží dřív, než se odstraní prázdné řádky**. Kdyby se nejdřív smazal řádek, ze kterého blok odešel, posunuly by se indexy a blok by přistál o řádek vedle.

## 4. Drag & drop s `@dnd-kit`

Knihovna byla v projektu už dřív (starý seznam karet ji používal přes `@dnd-kit/sortable`). Tady stačí nižší vrstva `@dnd-kit/core` se třemi stavebními kameny:

| Kus | Co dělá |
|---|---|
| `<DndContext>` | obal, který sleduje tah a na konci zavolá `onDragEnd({ active, over })` |
| `useDraggable({ id })` | „tohle jde chytit“: vrátí `listeners` a `attributes`, které dáš na úchyt ⋮⋮ |
| `useDroppable({ id })` | „sem jde pustit“: vrátí `isOver`, takže víš, kdy rozsvítit čáru |

**Cílové zóny jsou vlastní.** `sortable` umí jen seznam v jedné ose, my potřebujeme dvě (vedle a pod). Proto se během tahu vykreslí neviditelné zóny:

```
       gap:0            ← mezera nad řádkem 0 (nový řádek)
┌──────────┬──────────┐
│ beside:  │ beside:  │ ← levá a pravá polovina každého bloku
│ A:left   │ A:right  │
└──────────┴──────────┘
       gap:1
```

ID zóny nese, co se má stát (`"beside:<id>:left"`). `onDragEnd` ho rozparsuje na `DropTarget` a předá `moveBlock`.

Další nastavení:
- **`collisionDetection={pointerWithin}`**: cíl je zóna, ve které je kurzor. Výchozí `rectIntersection` počítá s překryvem obdélníků, což u tenkých zón mezi řádky skáče.
- **`activationConstraint: { distance: 4 }`**: tah začne až po 4 px pohybu, takže obyčejný klik na úchyt nespustí tah.
- **`<DragOverlay>`**: za kurzorem jede malý štítek („Text“). Původní blok zůstane na místě poloprůhledný, takže se při tahu nic neposouvá.
- Zóna „vedle“ se vykreslí jen tam, kam blok **smí**: `canJoinRow(řádek bez taženého bloku, typ)`. Neplatný cíl tak vůbec nejde trefit.

## 5. Jeden blok, dva režimy: React Context

Stejné komponenty (`TextBlock`, `SkillSpotlightBlock` …) běží v editoru i na veřejném profilu. Kdyby se `editable`, `skills`, `mySkillIds`, `onAddSkill` … předávaly přes props, musel by je posílat každý mezikus (mřížka → řádek → blok → řádek skillu). Místo toho:

```ts
export const BlocksContext = createContext<BlocksContextValue | null>(null)

// EditableBlocks / ReadOnlyBlocks
<BlocksContext.Provider value={{ editable: true, ownerId, skills, autoFocusId }}>

// kdekoli uvnitř, třeba SkillRow
const { editable, mySkillIds, onAddSkill } = useBlocks()
```

`useBlocks()` vyhodí chybu, když se komponenta použije mimo Provider. Chyba se tak ukáže hned, místo tichého `undefined`.

**Registr bloků** ([registry.tsx](../../apps/web/src/components/profile-blocks/registry.tsx)) je jediné místo, které zná všechny typy (název, ikona, popis, komponenta). Menu **+** i obě mřížky z něj čtou. Nový typ bloku = jeden řádek v registru + komponenta + hodnota v DB `CHECK`.

## 6. Soukromí: co RPC vůbec pošle

Levely (`user_skill_level`) a čas (`time_sessions`) má cizí uživatel přes RLS zakázané. `get_profile_skills(p_user_id)` je proto `SECURITY DEFINER` (princip viz [10](10-chat-sdileni-skillu.md)). Nové je, **jak omezuje výstup**: skilly nebere z `user_skills`, ale z bloků, které si vlastník sám poskládal.

```sql
picked AS (
  SELECT e.id, false AS show_time                       -- skill list: čas nikdy
  FROM blocks b, jsonb_array_elements_text(b.data->'skill_ids') AS e(id)
  WHERE b.type = 'skill_list'
  UNION ALL
  SELECT b.data->>'skill_id', coalesce((b.data->>'show_time')::boolean, true)
  FROM blocks b WHERE b.type = 'skill_spotlight'
)
…
'time', CASE WHEN w.show_time THEN (…součet time_sessions…) END
```

- `jsonb_array_elements_text` rozbalí JSON pole `["id1","id2"]` na řádky, jako by to byla tabulka.
- Vypnutý **Show time** neznamená jen „schovat v prohlížeči“. Server čas **vůbec nepošle**, takže ho nevyčte ani někdo, kdo se dívá do Network tabu.
- `data` zapisuje klient, takže v něm může být cokoli. Proto `WHERE id ~* '^[0-9a-f]{8}-…'` (regex na UUID) ještě před `::uuid`, jinak by jeden nesmysl shodil celý dotaz.
- Čas je jen z **time trackeru** (`time_sessions`), ne z automatického měření na stránce Learn. Při měření během učení by se jinak tatáž minuta započítala dvakrát.

## 7. Jednorázový převod dat v migraci

Staré karty (`text_photo`, `photo`, `skills`, `cv`) se musely převést, jinak by uživatelům zmizely. Migrace ale musí jít spustit znovu (idempotence), a druhý běh by přepsal rozložení, které si mezitím uživatel naskládal. Řešení: převod běží jen tehdy, když nový sloupec ještě neexistuje.

```sql
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'profile_cards' AND column_name = 'row_index') THEN
    RETURN;                                  -- už převedeno → nic nedělat
  END IF;
  ALTER TABLE public.profile_cards ADD COLUMN row_index int …;
  … převod …
END $$;
```

- `DO $$ … $$` je anonymní blok PL/pgSQL: kód s `IF`, proměnnými a `RETURN`, který se jednou spustí a nikde neuloží (na rozdíl od `CREATE FUNCTION`).
- `information_schema.columns` je standardní katalog „jaké sloupce existují“.
- **`text_photo` → dva bloky:** `INSERT … SELECT` vyrobí k textu nový obrázkový blok ve stejném řádku. Strana se vezme z toho, co návštěvníci viděli doteď. Starý veřejný profil kvůli `flex-row-reverse` zobrazoval `photo_position: 'right'` vlevo, takže migrace to zachová, i když je to protiintuitivní.
- `split_part(url, '/object/public/profile-media/', 2)` udělá z celé veřejné URL jen cestu v bucketu (vrátí 2. kus po rozdělení).
- `jsonb_strip_nulls(jsonb_build_object('heading', data->'heading', …))` odstraní klíče, jejichž hodnota je `null`. Pokud karta nadpis neměla, klíč `heading` se nevytvoří.

## 8. Drobnosti, které se hodí znát

**Odkaz z databáze nikdy přímo do `href`.** `<a href="javascript:alert(1)">` spustí kód. Data bloku jsou z klienta, takže by tam někdo mohl zapsat cokoli přímo přes API. `normalizeUrl()` pustí jen `http:` a `https:` a volá se **při vykreslení**, ne jen při uložení:

```ts
const url = block.data.url ? normalizeUrl(block.data.url) ?? undefined : undefined
```

**Iframe jen pro YouTube, a to `youtube-nocookie.com`.** Tahle verze přehrávače neukládá sledovací cookies, dokud video nespustíš. Jiné weby se vkládají jen jako karta s odkazem: cizí iframe by mohl napodobit přihlašovací formulář apod.

**Stale closure a funkční `setState`.** Upload obrázku trvá několik sekund. `onChange` se zavolá až potom, a kdyby měnil `setBlocks(blocks.map(…))`, použil by `blocks` z doby, kdy upload začal. Co jsi mezitím napsal do jiného bloku, by se vrátilo. Proto:

```ts
setBlocks(prev => prev.map(b => (b.id === block.id ? { ...b, data } : b)))
```

`prev` je vždy aktuální stav v okamžiku zápisu.

**Lint `react-refresh/only-export-components`.** Soubor `.tsx`, ze kterého se exportují komponenty, nemá exportovat i obyčejné funkce. Vite pak umí při úpravě vyměnit komponentu bez reloadu stránky (Fast Refresh). Proto se `formatAttrValue` přestěhovala do `lib/skill-format.ts`.

## 9. Co si vyzkoušet

1. Spusť migraci (SQL editor nebo `supabase db push`) a otevři svůj profil. Staré karty by měly být převedené na bloky.
2. Přidej Text a pak přes **+** vedle řádku Image. Zkus přidat 4. blok: menu ho nepustí.
3. Přetáhni obrázek pod text (nový řádek) a zpátky vedle textu.
4. Přidej Spotlight, vypni **Show time** a v DevTools → Network se podívej na odpověď `get_profile_skills`: `time` je `null`.
5. Otevři svůj profil z jiného účtu a u skillu, který nemáš, klikni na **Add skill**.
6. Do Embedu vlož `youtu.be/…`, `youtube.com/shorts/…` a obyčejný web.

## 10. Kontrolní otázky

1. Proč se sloupec jmenuje `row_index` a ne `row`?
2. Co by se pokazilo, kdyby `moveBlock` při přesunu do mezery nejdřív odstranil prázdné řádky a až potom vložil nový?
3. Proč editor používá `pointerWithin` a ne výchozí detekci kolizí?
4. Jak `get_profile_skills` zajistí, že návštěvník neuvidí skill, který vlastník na profil nedal?
5. Proč nestačí zkontrolovat URL jen při uložení bloku?
6. Jak migrace zařídí, že druhé spuštění nepřepíše rozložení, které si uživatel mezitím naskládal?
7. Kdy potřebuješ `setState(prev => …)` místo `setState(hodnota)`?

## 11. Dodatek: úpravy po zpětné vazbě

Po prvním vyzkoušení se ukázaly tři věci, které „fungovaly“, ale pracovalo se s nimi špatně.

### Výběr skillu se otevíral moc nízko → inline picker a dropdown, který se otočí nahoru

- **Prázdný** Skill list nebo Spotlight ukáže hledání **přímo uvnitř bloku** (`<SkillPicker inline>`) v čárkovaném rámečku. Nic nevyskakuje a nemůže to vyjet z obrazovky.
- **Úprava** existujícího seznamu otevře dropdown. Když pod tlačítkem není místo, otevře se **nad** ním a pořadí se otočí, takže hledání je dole u tlačítka.

```tsx
<div className={`flex ${up ? 'flex-col-reverse' : 'flex-col'} …`}>   {/* stejné děti, opačné pořadí */}
```

`flex-col-reverse` vykreslí stejné potomky odspodu nahoru, takže v JSX se nic nepřehazuje.

### Hook `useDropUp`: rozhodnout jednou, před vykreslením

[useDropUp.ts](../../apps/web/src/components/profile-blocks/useDropUp.ts) změří, kolik místa je pod rodičem, a vrátí `up`:

```ts
const attach = useCallback((el: HTMLElement | null) => {
  const anchor = el?.parentElement
  if (disabled || !anchor || placed.current) return
  placed.current = true
  const { top, bottom } = anchor.getBoundingClientRect()
  const roomBelow = window.innerHeight - bottom
  if (roomBelow < maxHeight && top > roomBelow) setUp(true)
}, [maxHeight, disabled])
```

- **Ref callback** (`ref={attach}`) React zavolá hned, jak prvek vloží do DOM, ještě před vykreslením na obrazovku. Měření v `useLayoutEffect` + `setState` by narazilo na lint pravidlo `set-state-in-effect`.
- `placed` (ref) zajistí, že se rozhoduje **jen jednou**. Dropdown pak neposkakuje nahoru a dolů, když se při hledání mění jeho výška.
- Stejný hook používá i menu **Add a block**.

### Menu „Add a block“ → dlaždice vedle sebe

Pět typů bloků je teď vedle sebe jako dlaždice (ikona + název, popis v tooltipu). Menu je široké a nízké (asi 100 px), takže se pod **+** vejde skoro vždycky. Když ne, `useDropUp(120)` ho otevře nahoru.

### Štítek při přetahování „utíkal“ od kurzoru

`DragOverlay` začíná tam, kde byl levý horní roh přetahovaného bloku. Úchyt ⋮⋮ je ale vpravo nahoře, takže štítek visel daleko vlevo od myši. Pomohl vlastní **modifier** z dnd-kit, funkce, která upraví posun overlaye:

```ts
const labelUnderCursor: Modifier = ({ activatorEvent, draggingNodeRect, transform }) => {
  const start = activatorEvent && getEventCoordinates(activatorEvent)   // kde jsem klikl
  if (!start || !draggingNodeRect) return transform
  return {
    ...transform,
    x: transform.x + start.x - draggingNodeRect.left - 18,               // úchyt štítku pod kurzor
    y: transform.y + start.y - draggingNodeRect.top - draggingNodeRect.height / 2,
  }
}
<DragOverlay modifiers={[labelUnderCursor]}>
```

Rozdíl `start − roh bloku` je vzdálenost kliknutí od rohu. O ni overlay posuneme, takže štítek drží přesně tam, kde jsi blok chytil.
