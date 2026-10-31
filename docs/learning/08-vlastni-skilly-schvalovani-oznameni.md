# 08 – Vlastní skilly, schvalování adminem a oznámení

## 1. Co bylo uděláno

Když uživatel svůj skill v aplikaci nenajde, může ho **vytvořit**. Skill pak čeká na schválení adminem.

```
Add Skills → hledám „ukulele“ → nic
        ┌───────────────────────────┐
        │   No skills found.        │
        │  [ + Create "ukulele" ]   │
        └───────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────┐
│ Create a new skill               ✕   │
│ Skill name  [Ukulele            ]    │
│ ┌ Is it one of these? ───────────┐   │  ← živá kontrola podobných skillů
│ │ Ukulele basics      Add this   │   │
│ └────────────────────────────────┘   │
│ Category    [Music › Instruments ]   │
│ In your profile as [Watchlist|…]     │
│ Show me as the creator      (o—)     │  ← toggle
│ [Cancel]        [Submit for review]  │
└──────────────────────────────────────┘
```

| Kdo | Co vidí |
|---|---|
| **autor** | skill hned v profilu se štítkem *Pending review* |
| **ostatní** | nic, dokud ho admin neschválí |
| **admin** | v admin app nová záložka **New Skills**: Approve / Reject + důvod + „mark as duplicate“ |
| **autor po rozhodnutí** | 🔔 vpravo nahoře (vedle Settings) červené číslo → popup s oznámením. U zamítnutí je důvod a případně odkaz „Add „X“ instead →“ |

Tlačítko na vytvoření je na dvou místech: ve **výsledcích hledání** a při procházení kategorie (**„Missing a skill here?“**, kategorie se rovnou předvyplní).

## 2. Nové a změněné soubory

| Soubor | K čemu slouží |
|---|---|
| `supabase/migrations/20261029001_user_created_skills.sql` | sloupce v `skill_nodes`, RLS, vyhledávání, RPC `create_user_skill`, tabulka `notifications` |
| `apps/admin-api/src/routes/skills.ts` | **nový**: seznam, hledání, approve, reject (+ zápis oznámení a audit logu) |
| `apps/admin/src/pages/UserSkillsPage.tsx`, `components/UserSkillCard.tsx` | **nové**: stránka New Skills v adminu |
| `apps/web/src/lib/skill-queries.ts` | **nový**: `searchSkills`, `fetchCategoryOptions`, `createUserSkill` (+ překlad chyb), `fetchCreatorName` |
| `apps/web/src/pages/skills/CreateSkillModal.tsx` | **nový**: formulář na vytvoření |
| `apps/web/src/pages/skills/skillStatus.ts` | **nový**: `STATUS_OPTIONS` vytažené z `AddSkillModal` (sdílí ho dva modaly) |
| `apps/web/src/pages/skills/AddSkillsView.tsx` | tlačítka Create, hledání přes nové RPC |
| `apps/web/src/pages/skills/AddSkillModal.tsx` | „Created by …“, pokud to autor povolil |
| `apps/web/src/pages/skills/EditSkillModal.tsx` | autor může toggle změnit později, štítek Pending |
| `apps/web/src/pages/skills/cards.tsx` | štítek *Pending review* na kartě |
| `apps/web/src/lib/notification-queries.ts`, `hooks/useNotifications.ts` | **nové**: načtení oznámení + Realtime |
| `apps/web/src/components/notifications/NotificationsBell.tsx` | **nový**: zvoneček + popup |
| `apps/web/src/components/layout/TopBar.tsx` | zvoneček vedle Settings |
| `apps/web/src/pages/skills/index.tsx` | odkaz z oznámení otevře Add Skills s předvyplněným hledáním |

## 3. Jak to funguje

### Jeden sloupec `status` místo nové tabulky

Nový skill je normální řádek v `skill_nodes`, jen má `status = 'pending'`. Výhoda: `user_skills` na něj může hned ukazovat (cizí klíč), takže ho autor má v profilu. Po schválení se jen změní `status` na `approved`. Nic se nepřesouvá ani nekopíruje.

### RLS schová neschválené skilly všude najednou

Do `skill_nodes` se dotazuje 7 souborů. Místo přidávání `.eq('status','approved')` do každého z nich je pravidlo v databázi:

```sql
CREATE POLICY "skill_nodes_hide_unapproved" ON public.skill_nodes
  AS RESTRICTIVE FOR SELECT TO anon, authenticated
  USING (status = 'approved' OR (status = 'pending' AND created_by = auth.uid()));
```

**Permissive vs. restrictive policy:** permissive politiky se spojují přes **OR** (stačí, když projde jedna). Restrictive se přidávají přes **AND** (musí projít vždycky). Tabulka vznikla v dashboardu a nevíme, jaké politiky už má. Restrictive filtr proto funguje správně, ať tam je cokoliv.

Admin-api používá `service_role`, který RLS obchází, takže admin vidí všechno.

### Prevence duplicit ve třech vrstvách

1. **Lepší hledání.** Dřív `ilike '%kytara%'` nenašlo „Kytára“ ani překlep „kytra“. Nově RPC `search_skill_nodes`:
   - `skill_name_key(name)` = `lower(unaccent(trim(name)))`, takže z „  Kytára “ je „kytara“,
   - `similarity(...) > 0.3` z rozšíření **pg_trgm** porovnává trojice písmen („kyt“, „yta“, „tar“…), proto zvládne překlepy.
2. **Upozornění ve formuláři.** Při psaní názvu se (s 300ms zpožděním) hledají podobné skilly: „Is it one of these? → Add this“.
3. **Tvrdá kontrola v DB.** `create_user_skill` odmítne stejný název pod stejným rodičem. Aby to platilo i při souběhu dvou lidí, funkce nejdřív vezme zámek:
   ```sql
   PERFORM pg_advisory_xact_lock(hashtext('skill_nodes_children:' || p_parent_id::text));
   ```
   Druhý požadavek na stejného rodiče počká, až první transakce skončí, a pak už duplicitu uvidí.
4. **Admin** jako poslední síť: u zamítnutí vybere „mark as duplicate“ a uživatel dostane odkaz na existující skill.

Stejný název v **jiné** kategorii povolený je (např. Biathlon může být pod Zimními sporty i pod Střelbou). Tyhle případy chytí body 2 a 4.

### Zamítnutí

Admin-api nastaví `status='rejected'`, uloží `rejection_reason` a `duplicate_of`, smaže `user_skills` k tomuto skillu, zapíše audit log a vloží řádek do `notifications`. Skill zůstane v DB jako historie (záložka Rejected v adminu), ale RLS ho neukáže nikomu.

### Oznámení

`notifications` má `type` + `data` (JSON), text se skládá až ve frontendu. Kdybychom chtěli změnit formulaci nebo přidat češtinu, staré řádky není potřeba přepisovat.

Živé doručení je stejné jako v chatu: Realtime kanál poslouchá `INSERT` do `notifications` s filtrem `user_id=eq.{moje_id}`. Po otevření popupu se zavolá `mark_notifications_read()`. Je to RPC, protože kdyby uživatel mohl dělat UPDATE přímo, mohl by si přepsat i `type`/`data`.

## 4. React syntaxe použitá v této funkci

### `useState`: stav komponenty

```tsx
const [createDraft, setCreateDraft] = useState<{ name: string; parentId: string | null } | null>(null);
```
- `createDraft` je aktuální hodnota, `setCreateDraft` ji mění a způsobí nové vykreslení.
- `<…>` je TypeScript typ: buď objekt, nebo `null` (modal zavřený).
- Modal se ukazuje podmíněně: `{createDraft && <CreateSkillModal … />}`. Když je `createDraft` `null`, `&&` vrátí `null` a React nevykreslí nic.

### `useEffect` s debounce a cleanup

```tsx
useEffect(() => {
  const t = setTimeout(() => { searchSkills(q, 6).then(...) }, 300);
  return () => clearTimeout(t);
}, [name]);
```
- Efekt se spustí po každé změně `name` (pole závislostí `[name]`).
- **Cleanup** (vrácená funkce) se spustí před dalším během efektu. Při psaní „ukulele“ se tak 6 timerů zruší a dotaz odejde jen jednou, 300 ms po posledním písmenu. Tomu se říká **debounce**.

### Ochrana proti „zastaralé odpovědi“

```tsx
let stale = false;
searchSkills(q).then((rows) => { if (!stale) setSearchResults(rows); });
return () => { stale = true; };
```
Když dotaz na „uku“ doběhne až po dotazu na „ukulele“, nesmí přepsat novější výsledky. Cleanup nastaví `stale = true` pro starý běh. V `useNotifications` dělá totéž `useRef` čítač `requestSeq`.

### `useMemo`: přepočítat jen když je potřeba

```tsx
const visibleCategories = useMemo(() => {...filter...}, [categories, categoryFilter]);
```
Filtr kategorií se přepočítá jen při změně seznamu nebo filtru, ne při každém písmenu v názvu skillu.

### Úprava stavu během renderu (místo efektu)

```tsx
const [handledKey, setHandledKey] = useState<string | null>(null);
if (addQuery && handledKey !== location.key) {
  setHandledKey(location.key);
  setView("add");
}
```
React doporučuje tenhle vzor, když se stav má změnit podle props nebo URL. Kdyby to bylo v `useEffect`, komponenta by se nejdřív vykreslila se starým `view` a hned znovu s novým (ESLint pravidlo `react-hooks/set-state-in-effect`). `handledKey` zajistí, že se to provede jen jednou pro každou navigaci.

### Optimistic update

```tsx
const toggleShowCreator = async () => {
  const next = !showCreator;
  setShowCreator(next);               // UI se přepne hned
  try { await setSkillShowCreator(node.id, next); }
  catch { setShowCreator(!next); }    // když to selže, vrátíme zpět
};
```

### Discriminated union (TypeScript)

```ts
type AppNotification =
  | { type: 'skill_approved'; data: { skill_id: string; skill_name: string } … }
  | { type: 'skill_rejected'; data: { reason: string; duplicate_of_name?: string … } … }
```
Ve větvi `n.type === 'skill_rejected'` TypeScript ví, že `n.data.reason` existuje. Ve větvi `skill_approved` by ho použít nešlo.

### Vlastní třída chyby

`createUserSkill` převede text z DB (`'duplicate_skill'`) na `CreateSkillFailed` s `reason.kind`. Komponenta pak dělá `if (r.kind === "duplicate")` a nemusí znát databázové řetězce.

### Zavření popupu kliknutím mimo

```tsx
const rootRef = useRef<HTMLDivElement>(null);
const onDown = (e: MouseEvent) => {
  if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
};
document.addEventListener('mousedown', onDown);
return () => document.removeEventListener('mousedown', onDown);
```
`useRef` drží odkaz na DOM element zvonečku. Když kliknutí nebylo uvnitř, popup se zavře. Listener se přidává jen když je popup otevřený (`if (!open) return`) a cleanup ho odebere.

### `role="switch"` + `aria-checked`

Toggle je `<button>`, ne checkbox. Atributy říkají čtečkám obrazovky, že jde o přepínač a v jakém je stavu.

## 5. Tailwind použitý v této funkci

| Třídy | Co dělají |
|---|---|
| `fixed inset-0 z-50` | vrstva přes celou obrazovku (`inset-0` = top/right/bottom/left 0) nad vším ostatním |
| `bg-black/40 backdrop-blur-sm` | černá s 40% průhledností + rozmazání pozadí za modalem |
| `flex items-center justify-center` | vycentrování modalu vodorovně i svisle |
| `max-h-[90vh] overflow-y-auto` | **arbitrary value** v `[]`: modal max. 90 % výšky okna, obsah se scrolluje |
| `relative` + `absolute right-0 top-full mt-2` | popup se umístí pod tlačítko (`top-full` = 100 % výšky rodiče), zarovnaný doprava |
| `absolute -right-0.5 -top-0.5` | červený odznak lehce přesahuje roh zvonečku (záporný posun) |
| `min-w-4.5 h-4.5` | Tailwind 4 umí i „poloviční“ kroky: 4.5 × 0.25rem = 18 px |
| `max-w-[calc(100vw-2rem)]` | na mobilu popup nepřeteče obrazovku |
| `translate-x-5` vs `translate-x-0` + `transition-transform` | posun kolečka v toggle s animací |
| `hover:bg-amber-100`, `disabled:opacity-60` | **varianty**: styl jen při najetí myší / u zakázaného tlačítka |
| `last:border-b-0` | poslední oznámení v seznamu nemá spodní čáru |
| `truncate` | dlouhý text se ořízne a doplní „…“ |
| `bg-purple-50/60` | zvýraznění nepřečtených oznámení (60% průhlednost) |

Dynamické třídy se skládají přes template string:
```tsx
className={`... ${showCreator ? "bg-purple-700" : "bg-gray-300"}`}
```
Obě třídy musí být v kódu napsané **celé**. Tailwind prochází zdrojáky jako text a třídu poskládanou jako `"bg-" + barva` by nenašel.

## 6. Jak otestovat

1. **Spustit migraci** `20261029001_user_created_skills.sql` v SQL editoru Supabase. Bez ní nefunguje hledání (`search_skill_nodes`) ani zvoneček.
2. Restartovat admin-api (nový router `/skills`).
3. Web → Skills → Add Skills → hledat nesmysl („ukulele123“) → **Create** → vyplnit → Submit. Skill je v „My skills“ se štítkem *Pending review*.
4. V jiném prohlížeči jako jiný uživatel skill hledat → **nesmí** být vidět.
5. Zkusit vytvořit stejný název ve stejné kategorii znovu → chyba „already exists“ s tlačítkem „Add … instead“.
6. Admin app → **New Skills** → Approve → u autora se zvoneček rozsvítí bez obnovení stránky.
7. Vytvořit další → Reject + „mark as duplicate“ → oznámení s důvodem a odkazem. Klik na odkaz otevře Add Skills s vyhledaným existujícím skillem. Zamítnutý skill zmizel z profilu.
8. Zapnout „Show me as the creator“ → druhý uživatel po schválení vidí v detailu „Created by …“.

## 7. Nové pojmy

| Pojem | Význam |
|---|---|
| **restrictive policy** | RLS politika, která se ANDuje se všemi ostatními (musí projít vždy) |
| **pg_trgm / trigram** | porovnání textů podle trojic znaků, umí najít překlepy |
| **unaccent** | odstraní diakritiku (`á` → `a`) |
| **IMMUTABLE funkce** | pro stejný vstup vždy stejný výstup. Jen takovou lze použít v indexu |
| **advisory lock** | zámek na libovolné číslo (ne na řádek), tady „rodič X“. `_xact_` = uvolní se s koncem transakce |
| **debounce** | počkat, až uživatel přestane psát, a teprve pak poslat dotaz |
| **optimistic update** | UI se změní hned, server se dotáhne potom (a při chybě se vrátí) |
| **discriminated union** | TS typ „jedna z variant“ rozlišená polem (`type`) |

## 8. Kontrolní otázky

1. Proč je neschválený skill v `skill_nodes`, a ne v samostatné tabulce „návrhů“?
2. Co by se stalo, kdyby politika `skill_nodes_hide_unapproved` byla *permissive*, a tabulka už měla politiku „každý čte vše“?
3. Proč nestačí kontrolovat duplicitu jen ve frontendu (dotazem před odesláním)?
4. Proč `mark_notifications_read` je RPC, a ne UPDATE policy?
5. Proč je text oznámení skládaný ve frontendu, a ne uložený v DB?
6. Co dělá cleanup v debounce efektu a co by se stalo bez něj?
7. Proč nejde v Tailwindu napsat `` `bg-${color}-500` ``?
