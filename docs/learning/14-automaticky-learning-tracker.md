# 14 – Automatický Learning Tracker

## 1. Co bylo uděláno

Místo stopek je teď na dashboardu **automatický tracker**. Uživatel nic nezapíná ani nezastavuje.

```
otevřu aplikaci ───► čas v aplikaci běží (dokud je karta viditelná)
        │
        ├─ 10 minut za den ───► streak +1, plamínek se rozsvítí
        │
        └─ /dashboard/learn/<basketball> ───► běží i čas basketballu
```

Widget na dashboardu ukazuje **jen dnešek**:

```
┌──────────────────────────────┐
│ Learning Tracker          ⌃  │  ← slide 1: celá aplikace
│                           •  │
│      8   :   23           ·  │
│   Minutes  Seconds        ·  │
│ ▬▬▬▬▬▬▬▬▬▬▬▬▬░░░░░  🔥    ⌄  │  ← bar = cesta k 10 min (streak)
└──────────────────────────────┘
        ⌄ šipka dolů
┌──────────────────────────────┐
│ Basketball                ⌃  │  ← slide 2: skill, na kterém jsem dnes byl
│      4   :   10              │
│ ▬▬▬▬▬▬░░░░░░░░░░░░  🔥    ⌄  │  ← bar = podíl na dnešním čase
└──────────────────────────────┘
```

Na dashboardu čas aplikace přibývá, čas basketballu ne (zrovna nejsem na jeho stránce). Nový den začíná prázdný.

**Streak** na dashboardu se teď počítá z dnů s 10+ minutami v aplikaci, ne z přihlášení.

## 2. Nové a změněné soubory

| Soubor | K čemu slouží |
|---|---|
| `supabase/migrations/20261118001_activity_tracking.sql` | **nový**: tabulky `user_daily_activity`, `user_skill_daily_time`, RPC `log_activity` |
| `apps/web/src/lib/activity-queries.ts` | **nový**: `localDay`, `fetchDayActivity`, `logActivity`, `fetchStreakDays`, `streakEndingYesterday` |
| `apps/web/src/hooks/useActivityTracker.ts` | **nový**: měření času + malý „store“ s dnešními součty |
| `apps/web/src/components/dashboard/LearningTracker.tsx` | **nový**: widget se slidy |
| `apps/web/src/App.tsx` | spouští `useActivityTracker()` jednou pro celou aplikaci |
| `apps/web/src/pages/DashboardPage.tsx` | nový streak, widget místo „Time Tracker“ |
| `docs/database.md` | popis nových tabulek |

## 3. Jak to funguje

### 3.1 Databáze: součty po dnech

Neukládáme každou sekundu ani každou návštěvu. Jeden řádek = **jeden uživatel, jeden den** a v něm součet sekund:

```
user_daily_activity          user_skill_daily_time
user_id | day        | s     user_id | day        | skill      | s
--------+------------+----   --------+------------+------------+---
martin  | 2026-11-18 | 734   martin  | 2026-11-18 | basketball | 250
```

Klient posílá jen **přírůstky** („přidej 30 s“) přes funkci `log_activity`, která udělá *upsert s přičtením*:

```sql
INSERT INTO user_daily_activity AS a (user_id, day, app_seconds)
VALUES (v_uid, p_day, v_app)
ON CONFLICT (user_id, day) DO UPDATE
  SET app_seconds = a.app_seconds + EXCLUDED.app_seconds;
```

- `ON CONFLICT (user_id, day)`: když řádek pro tenhle den už existuje, místo chyby se provede `UPDATE`.
- `EXCLUDED` je řádek, který jsme se pokoušeli vložit. `a.app_seconds + EXCLUDED.app_seconds` tedy znamená „staré + nové“.
- Přičítá se **v databázi**, ne v prohlížeči. Dvě otevřené karty proto nepřepíšou jedna druhé: obě jen přičítají.

### 3.2 Proč zápis jen přes funkci (SECURITY DEFINER)

Tabulky mají RLS politiku **jen na čtení vlastních řádků**. Zápis jde jen přes `log_activity`, která běží s právy vlastníka (`SECURITY DEFINER`) a hlídá vstupy:

```sql
v_app integer := LEAST(GREATEST(COALESCE(p_app_seconds, 0), 0), 300);
```

Přečteno zevnitř ven: `NULL` → 0, záporné → 0, víc než 300 → 300. Kdyby šel zápis přímo do tabulky, kdokoliv by si z konzole prohlížeče nastavil `app_seconds = 999999` a měl nekonečný streak.

`p_day` se kontroluje na rozsah `current_date ± 1`, protože den posílá klient ve **své** časové zóně (viz 3.4).

`(SELECT auth.uid())` v RLS politice je zabalené v `SELECT`, aby ho Postgres spočítal jednou za dotaz, ne pro každý řádek.

### 3.3 Měření v prohlížeči: `useActivityTracker`

Hook běží jednou pro celou aplikaci (v `App.tsx`) a dělá tři věci:

1. **Načte dnešní uložené součty** a teprve potom začne počítat. Jinak by se po obnovení stránky začínalo od nuly.
2. **Každou sekundu** (`setInterval`), pokud je karta viditelná (`document.visibilityState === 'visible'`):
   - přičte 1 s k aplikaci,
   - pokud URL odpovídá `/dashboard/learn/:skillId`, přičte 1 s i tomu skillu,
   - po 30 s pošle nasbírané sekundy na server (`flush`).
3. **Při skrytí nebo zavření karty** (`visibilitychange`, `pagehide`) pošle zbytek.

Který skill se učím, se pozná z URL, ne z `LearnPage`:

```ts
const learnMatch = useMatch('/dashboard/learn/:skillId')
const activeSkillId = learnMatch?.params.skillId ?? null
```

`LearnPage` tak o trackeru vůbec neví a nemusela se měnit.

Když flush selže (výpadek sítě), sekundy se vrátí do `pending` a zkusí se to znovu za dalších 30 s.

### 3.4 „Dnes“ podle hodin uživatele

```ts
new Date().toISOString().slice(0, 10)   // ❌ UTC: v ČR mezi 0:00 a 1:00 (v létě 2:00) je to ještě „včera“
localDay()                              // ✅ getFullYear/getMonth/getDate = místní čas
```

Starý streak používal `toISOString()`, takže po půlnoci mohl započítat špatný den.

### 3.5 Store mimo React: `useSyncExternalStore`

Čas se mění **každou sekundu**. Kdyby byl ve `useState` v `App`, překreslovala by se každou sekundu celá aplikace. Proto je v obyčejné proměnné modulu a React se k ní připojí jen tam, kde ji opravdu potřebuje:

```ts
let today = { day, appSeconds, skills, loaded }
const listeners = new Set<() => void>()

function setToday(next) {
  today = next                 // nový objekt, React pozná změnu podle reference
  listeners.forEach(l => l())  // dej vědět odběratelům
}

export function useTodayActivity() {
  return useSyncExternalStore(subscribe, () => today)
}
```

- `subscribe(listener)` přidá odběratele a vrátí funkci na odhlášení.
- Druhý argument vrací aktuální hodnotu (*snapshot*).
- Každou sekundu se překreslí jen komponenty, které volají `useTodayActivity()`, tedy widget a `DashboardPage`.

Je to stejný princip, na jakém stojí knihovny jako Zustand, jen bez knihovny.

### 3.6 Streak: minulost ze serveru, dnešek naživo

```ts
const dayStreak = streakBefore + (todayActivity.appSeconds >= STREAK_GOAL_SECONDS ? 1 : 0)
```

- `streakBefore` = kolik dní **do včerejška** za sebou mělo 10+ min (`streakEndingYesterday`).
- Dnešek se přičte, jakmile živý čas přesáhne 600 s, takže číslo na dashboardu poskočí přímo před očima.
- Když včera nic nebylo, `streakBefore` je 0. Starý `calcStreak` tohle nekontroloval, a když jsi měl řadu přihlášení končící před týdnem, pořád ji ukazoval.

### 3.7 Widget: svislý „stack“ slidů

```tsx
<div className="relative flex-1 overflow-hidden">        {/* okno */}
  <div
    className="absolute inset-0 transition-transform duration-300"
    style={{ transform: `translateY(-${current * 100}%)` }}  // posun o celé slidy
  >
    {slides.map(s => <TrackerSlide ... />)}               {/* každý h-full */}
  </div>
</div>
```

- Každý slide má `h-full`, tedy přesně výšku okna. Slidy jsou pod sebou.
- `translateY(-100%)` posune vnitřní div o jednu výšku nahoru, takže je vidět druhý slide. `-200%` ukáže třetí atd.
- `overflow-hidden` schová ty, které jsou mimo okno. `transition-transform` udělá plynulý posun.

`const current = Math.min(index, slides.length - 1)` hlídá, aby index nepřetekl, když slidů ubude (nový den).

Čas pod hodinu se ukazuje jako **Minutes : Seconds**, od hodiny jako **Hours : Minutes** (`splitTime`). `tabular-nums` dá číslicím stejnou šířku, takže čísla při tikání neposkakují.

## 4. Co zbývá

- Spustit migraci v Supabase (bez ní se nic neukládá).
- Roční widget nad `user_daily_activity`.
- Viz `docs/TODO.md`.
