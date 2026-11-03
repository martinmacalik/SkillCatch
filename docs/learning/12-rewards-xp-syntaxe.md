# 12 – Stránka Rewards, XP a zajímavá syntaxe

## 1. Co bylo uděláno

Nová stránka **Rewards** (`/dashboard/rewards`) ukazuje, kolik máš SkillCoinů a XP a za co je dostáváš.

```
┌──────────────┬──────────────┬─────────────────────────────┐
│ 🪙 SkillCoins │ ⚡ XP         │ Level 3  ▓▓▓▓▓░░░  120 XP…  │  ← přehled
└──────────────┴──────────────┴─────────────────────────────┘
┌────────────────────────────┐ ┌────────────────────────────┐
│ How to earn          (scroll)│ │ Level path           (scroll)│
│  LEARNING   +10 XP           │ │  (2) 100 XP          [?]     │
│  CONSISTENCY                 │ │  (3) 250 XP          [?]     │
│  COMMUNITY                   │ │  …                           │
│  CONTRIBUTING  +🪙25          │ │  Shop  [?][?][?]             │
└────────────────────────────┘ └────────────────────────────┘
```

**Logika odměn:**
- **XP** = jak moc se učíš. Dostáváš je za to, k čemu je aplikace (přidat skill, level up, flashcards…). Z XP se počítá **level**.
- **SkillCoins** = odměna od aplikace za to, že ji **doplňuješ** (obsah na learning stránkách, návrh nového skillu, úprava struktury).

Na stránku vedou dva prokliky:
1. **Pilulka v horní liště** (coiny | XP) je teď tlačítko.
2. **Help → Skillcoins**: tlačítko „See rewards and how to earn“ dole v kartě, stejné jako u structure builderu.

> Zatím se reálně vyplácí jen **10 coinů za schválený návrh struktury**. Ostatní pravidla mají štítek **„Soon“**. Je to plán, backend je ještě neuděluje.

## 2. Nové a změněné soubory

| Soubor | Co se změnilo |
|---|---|
| `supabase/migrations/20261103001_xp.sql` | **nová** migrace: sloupec `profiles.xp`, tabulka `xp_transactions`, funkce `award_xp()` |
| `apps/web/src/lib/rewards.ts` | **nový**: seznam pravidel odměn + výpočet levelu |
| `apps/web/src/pages/RewardsPage.tsx` | **nová** stránka |
| `apps/web/src/App.tsx` | route `rewards` |
| `apps/web/src/components/layout/TopBar.tsx` | pilulka s coiny i XP, proklik na Rewards |
| `apps/web/src/pages/HelpPage.tsx` | odstavec o XP + tlačítko na Rewards |
| `apps/web/src/components/learn/EditInfoPanel.tsx` | `BLOCK_INFO` je teď `export` |
| `docs/database.md` | popis `xp` a `xp_transactions` |

## 3. Databáze: XP stejně jako coiny

Migrace kopíruje vzor SkillCoinů (`20260423002_skillcoins.sql`):

| Část | K čemu |
|---|---|
| `profiles.xp` | aktuální součet, rychle se čte (např. v horní liště) |
| `xp_transactions` | **účetní kniha**: každý zisk XP je jeden řádek s důvodem (`reason`). Zpětně jde dohledat, za co člověk XP dostal. |
| `award_xp(user, amount, reason)` | jediné místo, které XP přičítá. Zvýší `profiles.xp` **a** zapíše řádek do knihy, takže se ty dvě věci nikdy nerozejdou. |

`SECURITY DEFINER` + `REVOKE ALL … FROM PUBLIC` znamená: funkce běží s právy vlastníka databáze, ale **uživatel ji sám zavolat nemůže**. Volat ji budou jen jiné funkce (třeba při schválení návrhu), jinak by si každý mohl XP přičíst sám.

## 4. Zajímavá syntaxe

### 4.1 Jeden zdroj pravdy: `export const` místo kopírování

Ceny bloků (heading 5 coinů … flashcards 35) už byly v `EditInfoPanel.tsx`. Místo opsání čísel jsme pole exportovali a v `rewards.ts` ho použili:

```ts
import { BLOCK_INFO } from '@/components/learn/EditInfoPanel'

const blockCoins = BLOCK_INFO.map(b => b.coins)        // [5, 10, 15, 20, 25, 35]
coins: `${Math.min(...blockCoins)}–${Math.max(...blockCoins)}`  // "5–35"
```

- `.map(b => b.coins)` z pole objektů udělá pole čísel.
- `...blockCoins` je **spread**: rozbalí pole na jednotlivé argumenty. `Math.min` pole neumí, chce `Math.min(5, 10, 15, …)`.
- Když někdo změní cenu bloku, Rewards stránka se změní sama.

### 4.2 Union typ: `number | string`

```ts
coins?: number | string // string for ranges like "5–35"
```

- `?` = vlastnost je **nepovinná** (pravidlo nemusí dávat coiny).
- `number | string` = hodnota je **buď** číslo, **nebo** text. U bloků potřebujeme rozsah `"5–35"`, jinde stačí číslo `25`.

### 4.3 `!= null` místo `&&`

```tsx
{rule.xp != null && <span>+{rule.xp} XP</span>}
```

Proč ne jen `{rule.xp && …}`? Kdyby `xp` bylo `0`, `&&` by vrátilo `0` a **React by na stránku vypsal nulu**. `!= null` (se dvěma `=`) je pravda pro všechno kromě `null` a `undefined`, takže chybějící hodnotu schová a `0` by správně zobrazil.

### 4.4 `Array.from({ length }, …)`: smyčka v JSX

V JSX nejde napsat `for`. Potřebujeme vykreslit level 2 až 10:

```tsx
Array.from({ length: PATH_LEVELS - 1 }, (_, i) => i + 2)   // [2, 3, 4, …, 10]
  .map(lvl => <li key={lvl}>…</li>)
```

- `Array.from({ length: 9 }, fn)` vytvoří pole o 9 prvcích a každý spočítá funkcí `fn`.
- `(_, i)`: první parametr (hodnotu) nepotřebujeme, podtržítko je konvence pro „nepoužito“. `i` je index 0…8.

Stejně se dělá 6 prázdných políček v shopu.

### 4.5 Výpočet levelu: `while` a funkce na víc místech

```ts
export const LEVEL_XP = [0, 100, 250, 500, 1000, 2000, 3500, 5000]

export function levelFor(xp: number) {
  let level = 1
  while (xpForLevel(level + 1) <= xp) level++
  return { level, from: xpForLevel(level), to: xpForLevel(level + 1) }
}
```

- `while`: dokud mám dost XP na **další** level, zvyšuj. Takhle se nikdy nepřeskočí.
- Funkce vrací **objekt**, a komponenta si ho hned rozbalí destrukturací:

```tsx
const { level, from, to } = levelFor(balance.xp)
```

- `{ level, from, … }` v `return` je zkratka za `{ level: level, … }`. Když se proměnná jmenuje stejně jako klíč, stačí ji napsat jednou.
- Za koncem tabulky (`xpForLevel`) stojí každý další level stejně jako poslední krok (+1500 XP), takže levely nikdy „nedojdou“.

### 4.6 Vnořený ternár pro tři stavy

Kolečko levelu má tři vzhledy: dosažený, příští, zamčený.

```tsx
className={`… ${
  reached
    ? 'bg-linear-to-br from-indigo-600 to-fuchsia-600 text-white'
    : next
      ? 'bg-white text-purple-700 ring-2 ring-purple-300'
      : 'bg-gray-100 text-gray-400'
}`}
```

Čte se jako `if / else if / else`. Víc než dvě úrovně už je špatně čitelné, pak je lepší pomocná proměnná nebo objekt.

### 4.7 Scroll jen ve sloupci, a jen na desktopu

Levý i pravý sloupec mají vlastní scroll, ale jen od `lg` (desktop). Na mobilu se scrolluje celá stránka. Klíč je řetěz `min-h-0`:

```tsx
<div className="flex min-h-0 flex-1 flex-col">                      {/* stránka */}
  <div className="grid … lg:min-h-0 lg:flex-1 lg:grid-cols-2">      {/* dva sloupce */}
    <section className="flex flex-col … lg:min-h-0">
      <div className="lg:min-h-0 lg:overflow-y-auto">…</div>         {/* tohle scrolluje */}
```

Ve flexboxu má prvek výchozí `min-height: auto`, tedy „nikdy menší než můj obsah“. Proto by se sloupec natáhl a `overflow-y-auto` by nikdy nezačal. `min-h-0` na **každé úrovni** řekne „klidně se zmenši“ a scroll naskočí. Když jedna úroveň chybí, scroll nefunguje. Je to nejčastější chyba u scrollovatelných panelů.

### 4.8 Přechod z navigace i jinde

XP ikona (`Flash`) má stejný fialový přechod jako aktivní položka menu, stačí jí dát třídu z minulé lekce (11):

```tsx
<Flash weight="Filled" className="nav-icon-active h-5 w-5" />
```

Funguje kdekoliv uvnitř dashboardu, protože `#navIconGrad` je definovaný v `DashboardLayout`.

## 5. Co dál

1. Rozhodnout finální čísla odměn v `lib/rewards.ts` (teď jsou návrh).
2. Postupně volat `award_xp` / `award_skillcoins` v databázi u jednotlivých akcí a přepínat `live: true`.
3. Doplnit odměny za levely (teď `?`) a položky shopu.
