# 13 – Time Tracker, heatmapa a zápis jen přes RPC

## 1. Co bylo uděláno

Na dashboardu jsou dvě nové karty:

```
┌──────────────────────────────────────────┐ ┌──────────────┐
│ Learning Progress          [All skills ▾] │ │ Skills       │
│     Nov  Dec  Jan  …                      │ │ Learning     │
│ Mon ▢▢▣▢▢▢▣▣▢▢▢▢▢▢▣▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢ │ │              │
│ Wed ▢▢▢▣▢▢▢▢▢▢▢▣▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢ │ └──────────────┘
│ Fri ▢▢▢▢▢▢▢▢▣▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢ │ ┌──────────────┐
│ Hours 12.5 · Streak 4 days · Best 3 Nov   │ │ Time Tracker │
└──────────────────────────────────────────┘ │ [Guitar ▾]   │
                                              │  00:24:13    │
                                              │ [Pause][Stop]│
                                              └──────────────┘
```

- **Time Tracker**: stopky navázané na skill. Start / Pause / Resume / Stop. Po Stop se otevře modal s délkou, získaným XP, poznámkou a checklistem.
- **Heatmapa**: kolik minut denně ses učil za poslední rok (jako na GitHubu). Najetím na čtvereček uvidíš rozpad podle skillů.
- **XP**: 1 XP za minutu, +10 bonus od 25 minut, pod 1 minutu nic, maximálně 4 hodiny na session.

## 2. Nové a změněné soubory

| Soubor | Co se změnilo |
|---|---|
| `supabase/migrations/20261109001_time_tracker.sql` | **nová** migrace: `time_sessions`, `time_session_checks`, 8 funkcí `timer_*` |
| `apps/web/src/lib/timer-queries.ts` | **nový**: volání RPC + pomocné funkce (čas, formátování) |
| `apps/web/src/lib/app-events.ts` | **nový**: jednoduché události přes `window` |
| `apps/web/src/components/time-tracker/TimeTrackerCard.tsx` | **nová** karta se stopkami |
| `apps/web/src/components/time-tracker/SessionSummaryModal.tsx` | **nový** modal po Stop |
| `apps/web/src/components/time-tracker/ActivityHeatmap.tsx` | **nová** heatmapa (dá se použít i na detailu skillu) |
| `apps/web/src/pages/DashboardPage.tsx` | karty místo placeholderů, přeskládaný grid |
| `apps/web/src/components/layout/TopBar.tsx` | po Stop znovu načte XP |
| `apps/web/src/lib/rewards.ts` | pravidlo „Track learning time“ (`live: true`) |

## 3. Databáze

### 3.1 Klient smí jen číst, zapisují jen funkce

Dosud měly tabulky typicky policy „uživatel smí všechno se svými řádky“ (`FOR ALL … USING (auth.uid() = user_id)`). U stopek by to nešlo: kdo může psát do `time_sessions`, ten si nastaví `duration_seconds = 99999` a vezme si XP.

Proto má tabulka **jen SELECT policy**:

```sql
ALTER TABLE public.time_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY time_sessions_self_select ON public.time_sessions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
-- žádná INSERT/UPDATE/DELETE policy → z klienta zápis neprojde
```

Když je zapnuté RLS a pro nějakou operaci **neexistuje žádná policy**, je ta operace zakázaná. Zapisovat můžou jen funkce s `SECURITY DEFINER`, protože běží s právy vlastníka a RLS je neomezuje. A ty si čas počítají samy ze `now()` na serveru, takže klient nemá jak podvádět.

Druhé pravidlo: funkce **nikdy nebere `user_id` z parametru**, vždy si ho vezme sama:

```sql
v_uid uuid := auth.uid();
```

Kdyby `user_id` přišlo v parametru, mohl bych zastavit stopky komukoliv jinému.

### 3.2 Partial unique index: „max. 1 běžící session“

```sql
CREATE UNIQUE INDEX time_sessions_one_active_idx
  ON public.time_sessions (user_id) WHERE ended_at IS NULL;
```

Obyčejný unique index na `user_id` by dovolil jen jednu session **vůbec**. Část `WHERE ended_at IS NULL` znamená, že unikátnost se hlídá jen mezi řádky, které ještě neskončily. Ukončených session můžeš mít kolik chceš, běžící jen jednu. I kdyby dvě záložky klikly na Start ve stejnou milisekundu, databáze druhý insert odmítne.

### 3.3 `SELECT … FOR UPDATE`: zamknout řádek, než ho měním

```sql
SELECT * INTO v_row
  FROM time_sessions
 WHERE user_id = v_uid AND ended_at IS NULL
 FOR UPDATE;
```

`FOR UPDATE` řádek zamkne do konce transakce. Kdyby dvě záložky zmáčkly Stop současně, druhá počká, a až dojde na řadu, řádek už má `ended_at`, takže `NOT FOUND` → chyba. XP se nevyplatí dvakrát. (Navíc to jistí i unikátní index z lekce 12 na `xp_transactions`.)

### 3.4 Výpočet v `timer_stop`

```sql
v_duration := floor(extract(epoch FROM v_now - v_row.started_at))::int - v_paused;
v_duration := greatest(0, least(v_duration, 4 * 3600));

v_xp := CASE
  WHEN v_duration < 60 THEN 0
  ELSE v_duration / 60 + CASE WHEN v_duration >= 25 * 60 THEN 10 ELSE 0 END
END;
```

- `v_now - started_at` je `interval`. `extract(epoch FROM …)` z něj udělá počet sekund.
- `least(x, 4h)` ořízne shora, `greatest(0, …)` zdola: dohromady „clamp“.
- `v_duration / 60`: dělení dvou `int` v Postgresu **zaokrouhluje dolů** (jako `floor`), takže 119 s = 1 minuta.
- `CASE … END` je SQL obdoba ternáru `? :`.

Pauza: při Pause se uloží `paused_at = now()`. Při Resume se přičte délka pauzy:

```sql
SET paused_seconds = paused_seconds + floor(extract(epoch FROM now() - paused_at))::int,
    paused_at = NULL
```

Takže celý stav stopek jsou jen tři hodnoty: `started_at`, `paused_seconds`, `paused_at`.

### 3.5 Den v české časové zóně

```sql
(s.started_at AT TIME ZONE 'Europe/Prague')::date
```

`started_at` je `timestamptz`, uložený v UTC. Session začatá 30 minut po půlnoci u nás je v UTC ještě předchozí den. `AT TIME ZONE` převede čas na místní a teprve pak `::date` vezme datum. Frontend dělá totéž:

```ts
new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague' }).format(new Date())  // "2026-11-09"
```

`en-CA` je trik: kanadský formát data je přesně `YYYY-MM-DD`.

### 3.6 `RETURNS SETOF` + `.maybeSingle()`

`timer_active` vrací 0 nebo 1 řádek. Kdyby vracela jeden složený typ a session neexistovala, PostgREST umí vrátit objekt plný `null` místo `null`. Proto `SETOF` (seznam) a na klientu:

```ts
const { data } = await supabase.rpc('timer_active').maybeSingle()   // řádek nebo null
```

`.maybeSingle()` = „čekám nanejvýš jeden řádek, když není žádný, dej `null`“ (na rozdíl od `.single()`, které pak hodí chybu).

## 4. Frontend: zajímavá syntaxe

### 4.1 Stopky počítané ze serveru, ne přičítáním

Naivní stopky: `setInterval(() => setSeconds(s => s + 1), 1000)`. Po refreshi začnou od nuly a když je záložka na pozadí, prohlížeč interval zpomalí a čas se rozjede.

Tady se čas pokaždé **spočítá** z hodnot ze serveru:

```ts
export function elapsedSeconds(s: TimeSession, now = Date.now()): number {
  const end = s.ended_at ? Date.parse(s.ended_at) : now
  const openPause = s.paused_at ? end - Date.parse(s.paused_at) : 0
  const ms = end - Date.parse(s.started_at) - openPause - s.paused_seconds * 1000
  return Math.max(0, Math.floor(ms / 1000))
}
```

Interval slouží jen k tomu, aby se komponenta jednou za vteřinu překreslila:

```ts
const [, setTick] = useState(0)                 // hodnota nás nezajímá, jen setter
useEffect(() => {
  if (!running) return
  const t = setInterval(() => setTick(n => n + 1), 1000)
  return () => clearInterval(t)                 // úklid při pauze / odchodu
}, [running])
```

- `const [, setTick]`: destrukturace pole s **vynechaným** prvním prvkem.
- `now = Date.now()` je **výchozí hodnota parametru**: když ho nepředáš, vezme se aktuální čas. V testu by šel podstrčit pevný čas.

### 4.2 Událost přes `window`: komunikace mezi vzdálenými komponentami

TopBar a Time Tracker spolu nemají společného rodiče se stavem. Po Stop ale TopBar musí znovu načíst XP. Místo nového Contextu stačí událost:

```ts
export function emitAppEvent(name: AppEvent) {
  window.dispatchEvent(new Event(name))
}

export function onAppEvent(name: AppEvent, handler: () => void): () => void {
  window.addEventListener(name, handler)
  return () => window.removeEventListener(name, handler)
}
```

`onAppEvent` vrací funkci, která odběr zruší, a to je přesně tvar, který chce `useEffect` jako úklid:

```ts
useEffect(() => onAppEvent('timer:stopped', () => setReloadKey(k => k + 1)), [])
```

Šipka bez složených závorek vrací výsledek `onAppEvent`, tedy úklidovou funkci. React ji zavolá při odchodu ze stránky.

`type AppEvent = 'profile:refresh' | 'timer:stopped'` je union **textových literálů**: překlep v názvu události TypeScript odhalí.

### 4.3 `loading` bez `setState` v efektu

ESLint (`react-hooks/set-state-in-effect`) hlásil chybu u:

```ts
useEffect(() => {
  setLoading(true)          // ✗ synchronní setState v těle efektu → render navíc
  fetch…
}, [filter])
```

Řešení: `loading` není samostatný stav, ale **odvozená hodnota**. Pamatuju si, pro jaký dotaz mám data, a porovnám to s aktuálním:

```ts
const queryKey = `${effectiveSkill ?? 'all'}|${reloadKey}`
const loading = loadedKey !== queryKey          // počítá se při každém renderu

useEffect(() => {
  let cancelled = false
  timerHeatmap(effectiveSkill)
    .then(rows => { if (!cancelled) { setData(…); setLoadedKey(queryKey) } })
  return () => { cancelled = true }
}, [queryKey])
```

`setState` je teď jen v callbacku po načtení, a to je v pořádku. Flag `cancelled` zajistí, že když rychle přepneš filtr, pomalejší starší odpověď nepřepíše novější data.

### 4.4 Datumy jako text + počítání v UTC

Heatmapa potřebuje 371 dní za sebou. Kdyby se přičítalo `24 h` k lokálnímu `Date`, při přechodu na letní/zimní čas by se jeden den zdvojil nebo zmizel. Proto se všechno počítá v UTC a dny se drží jako text `YYYY-MM-DD`:

```ts
const DAY_MS = 86_400_000                                   // _ = jen oddělovač tisíců
const toMs = (iso: string) => Date.parse(`${iso}T00:00:00Z`)  // Z = UTC
const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10)
```

Pondělí jako první den týdne:

```ts
const weekday = (new Date(todayMs).getUTCDay() + 6) % 7   // Ne=0 → Po=0 … Ne=6
```

`getUTCDay()` vrací neděli jako 0. `+ 6` a `% 7` posune všechno o jeden den, takže pondělí je 0.

Data ze serveru přijdou jen pro dny s aktivitou. Mapa udělá z „chybějících dní“ nulu:

```ts
const data = new Map(rows.map(r => [r.day, r.minutes]))
data.get(day) ?? 0
```

`new Map(…)` umí vzít pole dvojic `[klíč, hodnota]`.

### 4.5 CSS grid 53 × 7 bez knihovny

```tsx
<div
  className="grid min-w-160 gap-[3px]"
  style={{ gridTemplateColumns: `auto repeat(${WEEKS}, minmax(0, 1fr))` }}
>
```

- `auto`: první sloupec pro popisky Mon / Wed / Fri, široký podle textu.
- `repeat(53, minmax(0, 1fr))`: 53 stejně širokých sloupců. `minmax(0, 1fr)` místo `1fr` dovolí sloupci zúžit se pod šířku obsahu (stejný princip jako `min-h-0` z lekce 12).
- Čtverečky mají `aspect-square`: výška = šířka, takže rostou s kartou.
- `min-w-160` (640 px): pod touto šířkou se grid už nezmenšuje a rodič s `overflow-x-auto` začne scrollovat **uvnitř karty**, ne celá stránka.

Grid se plní po řádcích, ale data jsou po týdnech (sloupcích). Proto se vykreslují řádky (dny v týdnu) a v každém se projde všech 53 sloupců: `columns.map(col => col[r])`.

### 4.6 Tooltip přes `getBoundingClientRect` + `position: fixed`

Tooltip uvnitř scrollovacího kontejneru by se ořízl (`overflow` ořezává i absolutně pozicované děti). Proto je `fixed` a pozici bere z polohy čtverečku na obrazovce:

```ts
const rect = el.getBoundingClientRect()
setHover({ x: rect.left + rect.width / 2, y: rect.top })
```

```tsx
<div className="fixed -translate-x-1/2 -translate-y-full" style={{ left: x, top: y - 6 }}>
```

`-translate-x-1/2` ho vycentruje nad čtverečkem, `-translate-y-full` ho posune celou svou výškou nahoru.

### 4.7 Lazy načítání s cache v `useRef`

Rozpad podle skillů se načte, až když na den najedeš, a jen jednou:

```ts
const requested = useRef(new Set<string>())

if (cell.minutes > 0 && !requested.current.has(cell.day)) {
  requested.current.add(cell.day)
  timerDayBreakdown(cell.day).then(rows => setBreakdown(b => ({ ...b, [cell.day]: rows })))
}
```

- `useRef` drží hodnotu mezi rendery, ale její změna **nevyvolá render**. Hodí se pro „už jsem o to požádal“, které na obrazovce vidět není.
- `{ ...b, [cell.day]: rows }`: **computed key**. Hranaté závorky znamenají „klíčem je hodnota proměnné“, ne text `cell.day`.

### 4.8 `<optgroup>` v selectu

```tsx
<select>
  <optgroup label="Pinned">…</optgroup>
  <optgroup label="Learning">…</optgroup>
</select>
```

Nativní seskupení položek s nadpisem. Řazení „pinned → learning → ostatní“ dělá `sort` s pořadím ze slovníku:

```ts
const rank = { pinned: 0, learning: 1, other: 2 } as const
list.sort((a, b) => rank[a.group] - rank[b.group] || a.name.localeCompare(b.name))
```

`||` tady funguje jako „když jsou ve stejné skupině (rozdíl 0), rozhodni podle jména“.

### 4.9 `unknown` v `catch` místo `any`

```ts
export function errorMessage(e: unknown, fallback = 'Something went wrong'): string {
  const msg = (e as { message?: unknown } | null)?.message
  return typeof msg === 'string' && msg ? msg : fallback
}
```

V `catch (e)` může `e` být cokoliv. Chyby ze Supabase jsou objekty s `message`, ne vždy `Error`. Místo `any` (ESLint ho zakazuje) se `e` bere jako `unknown` a před použitím se ověří `typeof`.

## 5. Co dál

1. Spustit migraci a projít ruční test (Start → refresh → Pause → Resume → Stop).
2. `<ActivityHeatmap skillNodeId={…} />` vložit na detail skillu v Learn.
3. Zvážit automatické ukončení zapomenuté session (teď ji ořízne strop 4 h až při Stop).
