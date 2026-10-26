# 07 – Chat: nastavení skupiny (fotka, název, členové, smazání)

## 1. Co bylo uděláno

V hlavičce skupinového chatu je vedle 👤+ nová ikona ✏️ `Pencil`. Otevře popup uprostřed stránky:

```
┌──────────────────────────────────────┐
│ (foto)  Název skupiny          [✓] ✕ │
│                                      │
│ MEMBERS · 4                          │
│ (o) Martin Máčalík (you)      Admin  │
│ (o) Adam                    [Remove] │
│ (o) Petr                    [Remove] │
│ (o) Eva            Invited  [Remove] │
│──────────────────────────────────────│
│                        Delete group  │
└──────────────────────────────────────┘
```

| Co | Kdo smí |
|---|---|
| změnit **fotku** (klik na kolečko → výběr obrázku) | každý člen skupiny |
| změnit **název** (napsat, Enter nebo ✓) | každý člen skupiny |
| **Remove** u člena (2 kliky: Remove → Confirm) | jen zakladatel (v UI „Admin“) |
| **Delete group** (s potvrzením) | jen zakladatel – smaže chat i zprávy všem |

Fotka skupiny nahradí fialové kolečko s ikonou lidí všude: v seznamu chatů, v hlavičce i v prázdném chatu. Změna fotky a názvu se ostatním ukáže jako systémová zpráva („Adam changed the group photo“).

## 2. Nové a změněné soubory

| Soubor | K čemu slouží |
|---|---|
| `supabase/migrations/20261026001_chat_group_settings.sql` | sloupec `conversations.avatar_path`, RPC `set_group_avatar`, `delete_group`, `rename_conversation` nově pro všechny členy |
| `apps/web/src/components/chat/GroupSettingsModal.tsx` | **nový** – popup |
| `apps/web/src/components/chat/ChatHeader.tsx` | tlačítko s tužkou, nové akce v `ChatActions` |
| `apps/web/src/pages/ChatsPage.tsx` | implementace akcí (RPC + `reload` + přesměrování po smazání) |
| `apps/web/src/lib/chat-queries.ts` | `avatarPath`, `role` u členů, `renameGroup`, `setGroupPhoto`, `removeGroupMember`, `deleteGroup`, `fetchProfile`, `groupAvatarUrl` |
| `apps/web/src/lib/avatarUpload.ts` | vytažená funkce `uploadToAvatars` (kontrola, zmenšení, upload), sdílí ji profil i skupina |
| `apps/web/src/components/chat/ChatAvatar.tsx` | `ConversationAvatar` ukáže fotku skupiny |
| `apps/web/src/components/chat/ChatThread.tsx` | text systémové zprávy `photo_changed` |

## 3. Jak to funguje

### Kam se ukládá fotka skupiny

Do **existujícího veřejného bucketu `avatars`**, do složky toho, kdo ji nahrál: `{moje_id}/{uuid}.webp`. Storage policy „avatars owner insert“ už dovoluje nahrávat jen do vlastní složky, takže **nebylo potřeba psát novou policy**.

V tabulce je uložená **cesta** (`avatar_path`), ne celé URL. URL si frontend skládá přes `getPublicUrl`. Díky tomu RPC `set_group_avatar` může zkontrolovat, že cesta začíná ID volajícího. Nikdo tak nemůže skupině nastavit cizí soubor nebo libovolnou adresu z internetu.

Starou fotku smaže jen ten, kdo ji nahrál (storage nedovolí mazat v cizí složce). Když fotku mění někdo jiný, starý soubor zůstane v bucketu.

### Proč se změna ukáže ostatním hned

Obě RPC (`rename_conversation`, `set_group_avatar`) vloží systémovou zprávu. `useConversations` poslouchá přes Realtime nové zprávy a při každé znovu načte seznam chatů, a tím i nový název a fotku. Tabulka `conversations` sama v Realtime publikovaná není, systémová zpráva slouží jako signál.

### Smazání skupiny

`delete_group` smaže řádek v `conversations` a databáze přes `ON DELETE CASCADE` smaže účastníky, zprávy, reakce i skryté chaty. Trigger `participants_after_delete` při kaskádě nic nedělá (kontroluje, jestli konverzace ještě existuje). Ostatním skupina zmizí díky Realtime události na `conversation_participants`.

### „Admin“ = owner

V DB jsou role `owner` / `admin` / `member`. UI zatím nikoho na `admin` nepovyšuje, takže „správce“ = `owner` = zakladatel. Když zakladatel odejde, trigger povýší dalšího člena na ownera a tlačítka Remove / Delete group uvidí on.

## 4. Jak otestovat

1. **Spustit migraci** `20261026001_chat_group_settings.sql` v SQL editoru. Bez ní se seznam chatů nenačte, protože frontend chce sloupec `avatar_path`.
2. Jako zakladatel otevřít skupinu → ✏️ → změnit fotku a název → v chatu se objeví systémové zprávy, fotka je v seznamu.
3. Jako běžný člen: vidí popup, může měnit fotku a název, ale nevidí Remove ani Delete group.
4. Zakladatel: Remove u člena → člen zmizí ze seznamu a jemu zmizí skupina.
5. Zakladatel: Delete group → skupina zmizí všem.
