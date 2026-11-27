# Editor bloků Learn přímo v bloku

Stav: schváleno, implementováno · 2026-11-27 · malá změna (krátký návrh)

## Záměr

Stránky Learn se dnes editují jako surový JSON v textovém poli (`EditableBlockRow`, komentář „MVP“). Cílem je pořádný editor přímo v bloku, ve stylu Notionu, pro všech 6 typů bloků a pro oba režimy (direct pro editora, suggestion pro návrh od kohokoli). Je to první krok. Později stejné editory dostanou i učitelé pro knihovnu materiálů (Teach fáze 2).

## Cíle a ne-cíle

- **Cíle:** editor pro každý typ bloku přímo na místě, přeskládání bloků přetažením, nový blok bez textu, který by se musel mazat, s kurzorem rovnou v něm.
- **Ne-cíle:** změna formátu `content` (DB, schvalování návrhů a admin `SuggestionCard` zůstanou beze změny), nové typy bloků, rich text (tučné písmo, odkazy v textu), použití v Teach.
- **Anti-cíl:** stránka v editaci vypadá úplně jinak než při čtení, nebo se při psaní ztrácí text.

## Přístupy

| | Přístup | Výsledek |
|---|---|---|
| **A** ✅ | Přímo v bloku (Notion) | Zvolen uživatelem. Stejný princip jako bloky na profilu, editace je blízko výsledku. |
| B | Náhled + formulář pod ním | Jednodušší, ale vzdálenější od výsledku a stránka při editaci poskakuje. |

## Návrh

- `components/learn/editors/`: jeden editor pro každý typ a `BlockEditor` jako rozcestník. Props: `{ content, onChange(content), autoFocus }`.
  - Heading: pole ve velikosti nadpisu, přepínač H1 / H2 / H3.
  - Text: textarea, která roste s obsahem.
  - Callout: tmavá pilulka s polem, přepínač Tip / Warning / Note.
  - Resources: řádky (název, URL, popis), × a „+ Add link“. Neplatná URL se označí.
  - Checklist: řádky ☐. Enter přidá řádek, Backspace v prázdném řádku ho smaže.
  - Flashcards: dvojice Front / Back, × a „+ Add card“.
- **Ukládání:** text se ukládá při `blur`, přepínače a přidání či smazání řádku hned. Prázdné řádky se před uložením neodstraňují, aby nemizely pod rukama, ale renderery prázdné položky přeskočí.
- **`EditableBlockRow`:** obal s úchytem ⋮⋮ a košem (zobrazí se při najetí myší) kolem `BlockEditor`.
- **Pořadí:** `@dnd-kit/sortable`. Direct volá `reorderLearningBlocks(pageId, ids)`, suggestion přeskládá `draftBlocks`.
- **`BLOCK_TEMPLATES`:** prázdné hodnoty (heading `{level:2,text:''}`, callout `{tone:'tip',text:''}` …). Nově přidaný blok dostane `autoFocus`.

## Na implementaci

Rozdělení stylů a pojmenování komponent. Renderery se upraví jen tak, aby přeskakovaly prázdné položky.
