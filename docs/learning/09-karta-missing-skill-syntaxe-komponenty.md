# 09 – Karta „Missing a skill here?“ a syntaxe React komponenty

## 1. Co bylo uděláno

Tlačítko **„Missing a skill here?“** bylo v hlavičce kategorie vpravo jako malý šedý text. Teď je to **poslední karta v řadě skillů**: stejně velká jako skill karta, zasazená dovnitř a s černým čárkovaným okrajem.

```
Dřív:
 All skills › Sports › Winter                 [+ Missing a skill here?]
 ┌────────┐ ┌────────┐ ┌────────┐
 │ Skiing │ │Snowbrd │ │Skating │
 └────────┘ └────────┘ └────────┘

Teď:
 All skills › Sports › Winter
 ┌────────┐ ┌────────┐ ┌────────┐ ┌╌╌╌╌╌╌╌╌┐
 │ Skiing │ │Snowbrd │ │Skating │ ╎   +    ╎   ← zasazená, čárkovaný okraj
 │        │ │        │ │        │ ╎Missing ╎
 └────────┘ └────────┘ └────────┘ └╌╌╌╌╌╌╌╌┘
```

Navíc: když kategorie **nemá žádné skilly**, řada se stejně zobrazí a je v ní jen tahle karta. Dřív tam byl text „No skills in this category yet.“ Teď jde skill přidat rovnou tam, kde chybí.

## 2. Změněné soubory

| Soubor | Co se změnilo |
|---|---|
| `apps/web/src/pages/skills/cards.tsx` | **nová** komponenta `MissingSkillCard` |
| `apps/web/src/pages/skills/AddSkillsView.tsx` | tlačítko zmizelo z hlavičky, karta se vykreslí za poslední `LeafCard` |

## 3. Celá komponenta

```tsx
/** Sunken placeholder card at the end of a leaf row, opens the create-skill flow. */
export function MissingSkillCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-56 shrink-0 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-black bg-gray-100 p-6 text-center text-gray-900 transition hover:bg-gray-200"
      style={{ boxShadow: "inset 0 2px 10px rgba(0,0,0,0.08)" }}
    >
      <Plus className="h-6 w-6" />
      <span className="text-lg font-medium leading-snug">Missing a skill here?</span>
    </button>
  );
}
```

Teď ji rozebereme řádek po řádku.

## 4. Syntaxe krok za krokem

### 4.1 Komentář `/** … */`

```tsx
/** Sunken placeholder card ... */
```

Je to **JSDoc** komentář (začíná `/**`, ne `/*`). Jeho výhoda: VS Code ho ukáže v bublině, když najedeš myší na `MissingSkillCard` kdekoliv v projektu. Popiš v něm *k čemu* komponenta je, ne *jak* funguje.

### 4.2 `export function Jmeno(...)`

```tsx
export function MissingSkillCard(...) { ... }
```

| Část | Význam |
|---|---|
| `export` | funkci jde importovat z jiného souboru. Bez `export` je vidět jen v `cards.tsx`. |
| `function` | komponenta v Reactu je **obyčejná funkce**, která vrací JSX |
| `MissingSkillCard` | jméno **musí začínat velkým písmenem**. React podle toho pozná, že `<MissingSkillCard />` je tvoje komponenta a ne HTML tag (`<button>`, `<div>`) |

Jde o **pojmenovaný export**, takže se importuje ve složených závorkách:

```tsx
import { ScrollRow, LeafCard, BranchCard, MissingSkillCard } from "./cards";
```

(Opakem je `export default`, ten se importuje bez závorek: `import Foo from "./foo"`. V tomhle projektu se u karet používají pojmenované exporty, protože jich je víc v jednom souboru.)

### 4.3 Props: parametry komponenty

```tsx
({ onClick }: { onClick: () => void })
```

Tohle je nejhustší řádek, tak po částech:

```
({ onClick }          :   { onClick: () => void })
 └─ destrukturace        └─ TypeScript typ props
```

**a) Destrukturace.** React komponentě předá jeden objekt `props`. Zápis `{ onClick }` z něj rovnou vytáhne vlastnost `onClick`. Je to totéž jako:

```tsx
function MissingSkillCard(props: { onClick: () => void }) {
  const onClick = props.onClick;
  ...
}
```

**b) Typ za dvojtečkou.** `{ onClick: () => void }` říká TypeScriptu, co komponenta přijímá:

| Zápis | Čte se |
|---|---|
| `onClick:` | vlastnost se jmenuje `onClick` |
| `() =>` | je to funkce bez parametrů |
| `void` | funkce nic nevrací |

Když komponentu použiješ bez `onClick`, TypeScript zahlásí chybu ještě před spuštěním. Na tom stojí celý smysl typů.

**Víc props**: u větší komponenty se typ píše na víc řádků, jako u `LeafCard`:

```tsx
export function LeafCard({
  node,
  numUsers,
  index,
  action,
  fill,
  onView,
}: {
  node: SkillNode;
  numUsers: number;
  index: number;
  action?: { type: "add"; onClick: () => void } | { type: "added" };
  fill?: boolean;      // ← otazník = nepovinné
  onView?: () => void;
}) {
```

- `?` za jménem znamená **nepovinný** prop (může být `undefined`).
- `|` znamená **nebo** (union): `action` je buď jeden tvar objektu, nebo druhý.
- `"add"` v uvozovkách jako typ znamená, že hodnota musí být *přesně* řetězec `"add"`.

Když je typů hodně, dá se vytáhnout do samostatného `type`:

```tsx
type MissingSkillCardProps = {
  onClick: () => void;
  label?: string;
};

export function MissingSkillCard({ onClick, label = "Missing a skill here?" }: MissingSkillCardProps) {
```

`label = "..."` je **výchozí hodnota**: když prop nepředáš, použije se tenhle text.

### 4.4 `return ( ... )` a JSX

```tsx
return (
  <button ...>
    ...
  </button>
);
```

- Kulaté závorky kolem JSX jsou kvůli víceřádkovému zápisu. Bez nich by `return` na konci řádku vrátil `undefined`.
- **JSX** vypadá jako HTML, ale je to JavaScript. Rozdíly, na které narazíš:

| HTML | JSX | Proč |
|---|---|---|
| `class="..."` | `className="..."` | `class` je v JS rezervované slovo |
| `onclick="..."` | `onClick={funkce}` | camelCase, předáváš **funkci**, ne text |
| `style="color: red"` | `style={{ color: "red" }}` | style je JS objekt |
| `<img>` | `<img />` | každý tag musí být uzavřený |

- Komponenta smí vrátit **jeden kořenový element**. Když potřebuješ víc vedle sebe, obal je do fragmentu `<> ... </>` (viz konec `AddSkillsView.tsx`).

### 4.5 `{ }` uvnitř JSX = „tady je JavaScript“

```tsx
onClick={onClick}
style={{ boxShadow: "..." }}
```

- `onClick={onClick}`: vlevo je atribut tlačítka, vpravo proměnná z props. Komponenta sama neví, co se má stát po kliknutí. To rozhodne rodič. Tomuhle vzoru se říká **callback prop**.
- `style={{ ... }}`: **dvojité** závorky nejsou zvláštní syntaxe. Vnější `{}` přepne do JS, vnitřní `{}` je objekt.
- Vlastnosti ve `style` jsou camelCase: `boxShadow`, ne `box-shadow`.

### 4.6 `<button type="button">` místo `<div onClick>`

`LeafCard` je `<div onClick>`. Pro novou kartu jsem zvolil `<button>`, protože:
- jde vybrat **tabulátorem** a spustit **Enterem nebo mezerníkem**, bez práce navíc,
- čtečky obrazovky ho ohlásí jako tlačítko.

`type="button"` je pojistka. Výchozí typ tlačítka je `submit`, a kdyby karta někdy skončila uvnitř `<form>`, kliknutí by formulář odeslalo.

### 4.7 Ikona `<Plus />`

```tsx
import { Plus } from "lucide-react";
...
<Plus className="h-6 w-6" />
```

Ikony z knihovny **lucide-react** jsou React komponenty. Velikost určuje `className`, barvu přebírají z textu rodiče (`text-gray-900`).

## 5. Tailwind třídy: co dělá každá

```
flex w-56 shrink-0 flex-col items-center justify-center gap-2
rounded-2xl border-2 border-dashed border-black
bg-gray-100 p-6 text-center text-gray-900
transition hover:bg-gray-200
```

| Třída | CSS | Proč tady |
|---|---|---|
| `flex` | `display: flex` | rozložení obsahu |
| `flex-col` | `flex-direction: column` | ikona **nad** textem |
| `items-center` | `align-items: center` | vodorovně na střed (u sloupce) |
| `justify-center` | `justify-content: center` | svisle na střed |
| `gap-2` | mezera 0.5rem mezi dětmi | ikona a text se nedotýkají |
| `w-56` | `width: 14rem` | **stejně jako `LeafCard`**, karty mají jednotnou šířku |
| `shrink-0` | `flex-shrink: 0` | ve flex řadě se nezmenší |
| `rounded-2xl` | `border-radius: 1rem` | stejné zaoblení jako ostatní karty |
| `border-2` | okraj 2px | |
| `border-dashed` | `border-style: dashed` | **čárkovaný** |
| `border-black` | černá barva okraje | |
| `bg-gray-100` | světle šedé pozadí | odliší ji od bílých karet |
| `p-6` | padding 1.5rem | |
| `text-center` | zarovnání textu | víceřádkový text zůstane na středu |
| `transition` | plynulé přechody | hover nebliká |
| `hover:bg-gray-200` | tmavší pozadí **při najetí** | `hover:` je prefix, platí jen ve stavu hover |

**Jak se karta natáhne na výšku ostatních?** Rodič je `flex flex-wrap` a flex položky v řadě se výchozím nastavením (`align-items: stretch`) natáhnou na výšku nejvyšší položky. Výšku proto nemusíš nastavovat ručně.

**Prefixy**, které se ti budou hodit:

| Prefix | Kdy platí |
|---|---|
| `hover:` | myš je nad prvkem |
| `focus-visible:` | prvek je vybraný klávesnicí |
| `active:` | právě se kliká |
| `disabled:` | tlačítko je `disabled` |
| `md:`, `lg:` | od určité šířky obrazovky (např. `grid-cols-2 lg:grid-cols-3`) |

## 6. Efekt „zasazení“: vnitřní stín

```tsx
style={{ boxShadow: "inset 0 2px 10px rgba(0,0,0,0.08)" }}
```

Ostatní karty mají **vnější** stín (`0 4px 24px ...`), takže vypadají vyvýšené. Klíčové slovo `inset` otočí stín dovnitř a karta působí jako **prohlubeň**:

```
box-shadow: inset   0     2px    10px   rgba(0,0,0,0.08)
            │       │     │      │      └─ barva: černá s 8% průhledností
            │       │     │      └─ rozmazání
            │       │     └─ posun dolů
            │       └─ posun do strany
            └─ stín uvnitř
```

Proč je stín ve `style` a ne v Tailwind třídě? Ostatní karty v `cards.tsx` mají stín taky přes `style`. Stejný zápis udrží soubor konzistentní. Tailwindem by to šlo přes arbitrary value: `shadow-[inset_0_2px_10px_rgba(0,0,0,0.08)]` (mezery se nahrazují `_`).

Karta má navíc **schválně** jen `hover:bg-gray-200` a ne `hover:-translate-y-0.5` jako skill karty. Kdyby se při najetí zvedala, přestala by vypadat jako prázdné místo k vyplnění.

## 7. Použití v rodiči (`AddSkillsView.tsx`)

```tsx
{(currentBranch || allSkillsNodes.some((n) => n.is_leaf)) && (
  <div className="mt-5 flex flex-wrap gap-4">
    {allSkillsNodes
      .filter((n) => n.is_leaf)
      .map((node, i) => (
        <LeafCard key={node.id} node={node} ... />
      ))}
    {currentBranch && (
      <MissingSkillCard
        onClick={() => setCreateDraft({ name: "", parentId: currentBranch.id })}
      />
    )}
  </div>
)}
```

### 7.1 Podmíněné vykreslení `podminka && (<JSX/>)`

```tsx
{currentBranch && (<MissingSkillCard ... />)}
```

Když je `currentBranch` `null` (jsme na úrovni „All skills“), výraz je `null` a React nevykreslí nic. Jinak vykreslí kartu.

Varianta **buď–anebo** je ternární operátor:

```tsx
{allSkillsNodes.length === 0 && !currentBranch ? (
  <p>No skills in this category yet.</p>
) : (
  <>...karty...</>
)}
```

> ⚠️ Pozor na čísla: `{items.length && <List/>}` při délce 0 vykreslí na stránku znak **„0“**. Proto se píše `items.length > 0 && …` nebo `.some(...)`.

### 7.2 `.filter().map()` a `key`

- `.filter((n) => n.is_leaf)` nechá jen listy (skilly bez podkategorií).
- `.map((node, i) => <LeafCard ... />)` udělá z každého skillu kartu.
- `key={node.id}`: React potřebuje u seznamu **unikátní a stabilní klíč**, aby poznal, který prvek se změnil. Index `i` jako klíč nepoužívej, pokud se pořadí může měnit.

`MissingSkillCard` stojí **mimo** `.map()`, takže `key` nepotřebuje a vždycky skončí poslední.

### 7.3 Arrow funkce v `onClick`

```tsx
onClick={() => setCreateDraft({ name: "", parentId: currentBranch.id })}
```

Musí to být **funkce** `() => ...`, ne přímé volání. Rozdíl:

| Zápis | Co se stane |
|---|---|
| `onClick={() => setCreateDraft(x)}` | ✅ zavolá se až po kliknutí |
| `onClick={setCreateDraft(x)}` | ❌ zavolá se hned při vykreslení, a protože mění stav, vyvolá nekonečnou smyčku |

`setCreateDraft` je setter z `useState`. Jakmile `createDraft` není `null`, dole v souboru se otevře `CreateSkillModal` s předvyplněnou kategorií (`parentId`).

### 7.4 Proč se podmínka řady změnila

```tsx
// dřív
{allSkillsNodes.filter((n) => n.is_leaf).length > 0 && ( ...řada... )}
// teď
{(currentBranch || allSkillsNodes.some((n) => n.is_leaf)) && ( ...řada... )}
```

Dřív se řada vykreslila jen tehdy, když v kategorii byly skilly. Teď se vykreslí i v kategorii bez skillů, aby v ní mohla být samotná `MissingSkillCard`. `.some()` vrací `true`, jakmile najde první vyhovující prvek. Je kratší a rychlejší než `.filter().length > 0`.

## 8. Recept: jak si udělat vlastní komponentu

1. **Najdi podobnou komponentu** a okoukej rozměry a styl (tady `LeafCard`: `w-56`, `rounded-2xl`).
2. **Rozmysli props**: co se mění zvenku? Texty, data, callbacky (`onClick`, `onSelect`…).
3. **Napiš kostru:**

   ```tsx
   type MojeKartaProps = {
     title: string;
     onClick: () => void;
     highlighted?: boolean;
   };

   export function MojeKarta({ title, onClick, highlighted = false }: MojeKartaProps) {
     return (
       <button
         type="button"
         onClick={onClick}
         className={`w-56 rounded-2xl p-4 ${highlighted ? "bg-black text-white" : "bg-white"}`}
       >
         {title}
       </button>
     );
   }
   ```

   Všimni si `className={`...${...}`}`: **template string** (zpětné apostrofy) umožní vložit podmíněnou třídu.
4. **Exportuj a importuj**: `import { MojeKarta } from "./cards";`
5. **Použij**: `<MojeKarta title="Ahoj" onClick={() => console.log("klik")} />`
6. **Ověř typy**: `npx tsc -p tsconfig.app.json --noEmit` ve složce `apps/web`.

## 9. Cvičení

1. Přidej do `MissingSkillCard` nepovinný prop `label` s výchozí hodnotou `"Missing a skill here?"` a zkus kartu použít s jiným textem.
2. Přidej `focus-visible:ring-2 focus-visible:ring-black` a vyzkoušej tabulátorem, jak karta vypadá při výběru klávesnicí.
3. Zkus přepsat vnitřní stín z `style` na Tailwind arbitrary value `shadow-[inset_…]` a porovnej výsledek.
4. Vytvoř podobnou kartu „Add category“ pro mřížku `BranchCard` (ta je `w-full` v `grid`, ne `w-56` ve `flex`, tak co se v rozměrech změní?).
