# 11 – Ikony z knihovny Reicon a barevná aktivní ikona v navigaci

## 1. Co bylo uděláno

Ikony v navigaci (Sidebar na desktopu, BottomNav na mobilu) a v horní liště (hledání, zvoneček, nastavení) už nejsou z knihovny **lucide-react**, ale z **Reicon** (`reicon-react`).

Hlavní důvod: Reicon má každou ikonu ve **dvou variantách**, obrysové (`Outline`) a vyplněné (`Filled`). Díky tomu může aktivní položka v menu **přepnout na vyplněnou ikonu s fialovým přechodem**, neaktivní zůstanou šedé a obrysové.

```
 Neaktivní (Outline, šedá)      Aktivní (Filled, přechod indigo → fuchsie)
 ⌂  Overview                    ▌⬟  Overview
 ▢  Chats
 ✣  Skills
```

Zbytek aplikace (karty, chat, formuláře…) zatím používá lucide. Obě knihovny můžou existovat vedle sebe, takže se dá přecházet postupně.

## 2. Změněné soubory

| Soubor | Co se změnilo |
|---|---|
| `apps/web/package.json`, `pnpm-lock.yaml` | nová závislost `reicon-react` |
| `apps/web/src/components/layout/Sidebar.tsx` | ikony z Reiconu, aktivní ikona `weight="Filled"` + třída `nav-icon-active` |
| `apps/web/src/components/layout/BottomNav.tsx` | totéž pro mobilní spodní lištu |
| `apps/web/src/components/layout/TopBar.tsx` | `Search` a `Settings` z Reiconu |
| `apps/web/src/components/notifications/NotificationsBell.tsx` | `Bell` z Reiconu |
| `apps/web/src/components/layout/DashboardLayout.tsx` | přechod `#navIconGrad` přepnutý na `userSpaceOnUse` |
| `apps/web/src/index.css` | nové pravidlo `.nav-icon-active path` |

## 3. Postup: jak použít novou ikonu

### 3.1 Připojení knihovny (jednou pro celý projekt, už hotovo)

```bash
cd apps/web
pnpm add reicon-react
```

Tím se balíček zapíše do `apps/web/package.json`. Kolega pak jen spustí `pnpm install`.

### 3.2 Najít ikonu a její jméno

1. Otevři **https://reicon.dev/icons** a vyhledej, co potřebuješ (např. „chat“).
2. U ikony je její **jméno v PascalCase**, třeba `ChatRound`, `BookOpen`, `Logout2`. Přesně takhle se bude importovat.

Bez prohlížeče: ve VS Code napiš `import { Chat } from 'reicon-react'` a nech si napovědět (Ctrl+Space). Nabídne všechna jména, která začínají na `Chat`. Každá ikona má v nápovědě i **náhled obrázku**, když na jméno najedeš myší.

> Pozor: jména nejsou stejná jako v lucide. Lucide `MessageSquare` → Reicon `Message`, `LogOut` → `Logout2`, `Wrench` v Reiconu není (pro Skills jsme vzali `Puzzle`).

### 3.3 Import a použití v komponentě

```tsx
import { BookOpen } from 'reicon-react'

export function Example() {
  return <BookOpen className="h-5 w-5 text-gray-500" />
}
```

- Ikona je obyčejná React komponenta, vykreslí `<svg>`.
- **Velikost** dáváme Tailwindem (`h-5 w-5`), stejně jako u lucide. Prop `size` by šel taky, ale třída má přednost a drží jednotný styl s ostatním kódem.
- **Barva** se bere z `currentColor`, tedy z CSS `color`. Proto funguje `text-gray-500`, `hover:text-gray-800` atd.

### 3.4 Props, které Reicon umí

| Prop | Hodnoty | K čemu |
|---|---|---|
| `weight` | `'Outline'` (výchozí) / `'Filled'` | obrysová nebo vyplněná varianta |
| `color` | libovolná CSS barva | místo `text-*` třídy |
| `size` | číslo v px, výchozí `24` | šířka a výška |
| `strokeWidth` | číslo, výchozí `1.5` | tloušťka čar |
| `className`, `style`, `onClick`… | | cokoliv, co umí `<svg>` |

## 4. Jak funguje barevná aktivní ikona

### 4.1 Přepnutí varianty

V `Sidebar.tsx` dostává `NavLink` informaci `isActive` a podle ní měníme `weight` i třídu:

```tsx
<item.icon
  weight={isActive ? 'Filled' : 'Outline'}
  className={cn('h-5.5 w-5.5 shrink-0', isActive && 'nav-icon-active')}
/>
```

`item.icon` je komponenta uložená v poli `menuItems`. Normálně musí jméno komponenty v JSX začínat velkým písmenem, ale zápis s tečkou (`<item.icon />`) React bere vždy jako komponentu. Tak jde vykreslit „ikonu z proměnné“.

Typ pole je `IconComponent`, který Reicon exportuje (u lucide to byl `LucideIcon`):

```tsx
import { Home, Message, type IconComponent } from 'reicon-react'

const menuItems: { icon: IconComponent; label: string; to: string }[] = [
  { icon: Home,    label: 'Overview', to: '/dashboard' },
  { icon: Message, label: 'Chats',    to: '/dashboard/chats' },
]
```

### 4.2 Přechod (gradient) místo jedné barvy

CSS `color` umí jen jednu barvu, přechod do něj dát nejde. SVG ale umí výplň odkazem na `<linearGradient>`.

**a) Definice přechodu**, jednou pro celý dashboard v `DashboardLayout.tsx`:

```tsx
<svg aria-hidden="true" style={{ position: 'absolute', width: 0, height: 0 }}>
  <defs>
    <linearGradient id="navIconGrad" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stopColor="#4f46e5" />
      <stop offset="100%" stopColor="#c026d3" />
    </linearGradient>
  </defs>
</svg>
```

Neviditelné SVG (0×0) slouží jen jako „sklad“ přechodu, na který se pak odkazují všechny ikony přes `url(#navIconGrad)`.

**b) Použití přechodu**, v `index.css`:

```css
.nav-icon-active path {
  fill: url(#navIconGrad);
}
```

Proč přes CSS a ne prop: Reicon kreslí ikony jako `<path fill="currentColor">`. Atribut `fill` přímo na `<path>` je v SVG **nejslabší pravidlo**, takže ho jakékoliv CSS pravidlo přebije. Stačí ikoně přidat třídu `nav-icon-active` a všechny její cesty se vyplní přechodem.

### 4.3 Proč `userSpaceOnUse`

Dřív měl přechod `gradientUnits="objectBoundingBox"`, takže se roztahoval **přes každou cestu zvlášť**. U lucide to nevadilo, ikona se kreslila jednou čárou.

Reicon ikony mají často **víc cest** (např. `Home` = obrys domku + čárka dveří). S `objectBoundingBox` by každá cesta dostala vlastní celý přechod od indiga po fuchsii a ikona by vypadala pruhovaně.

`userSpaceOnUse` s `x2="24" y2="24"` znamená: přechod jde přes **souřadnice ikony** (viewBox všech Reicon ikon je 24×24), takže je jeden společný pro celou ikonu.

```
objectBoundingBox            userSpaceOnUse (0 → 24)
┌──────────┐                 ┌──────────┐
│ ▓▒░  ▓▒░ │ ← každá cesta    │ ▓▓▒▒▒░░░ │ ← jeden plynulý
│ ▓▒░      │   má svůj        │ ▓▒▒▒░░   │   přechod přes
└──────────┘   přechod        └──────────┘   celou ikonu
```

## 5. Shrnutí: nová ikona v 3 krocích

1. Najdi jméno na **reicon.dev/icons** (nebo nápovědou ve VS Code).
2. `import { JmenoIkony } from 'reicon-react'`
3. `<JmenoIkony className="h-5 w-5 text-gray-500" />`, případně `weight="Filled"` pro vyplněnou variantu.

Pro barevný přechod přidej ikoně třídu `nav-icon-active` (funguje kdekoliv uvnitř dashboardu, kde je definovaný `#navIconGrad`).
