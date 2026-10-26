# 06 – Registrace: potvrzení hesla, souhlas s podmínkami, stránka Terms

## 1. Co bylo uděláno

- Ve formuláři **Create an Account** je nové pole **Confirm Password** (jen při registraci, ne při loginu).
- Když se hesla neshodují, pod polem se hned ukáže červené „Passwords do not match“. Při odeslání se to zkontroluje znovu a registrace se nespustí.
- Checkbox **I agree to the Terms and Conditions** je teď **nad** tlačítkem Submit (dřív byl pod ním).
- Odkaz v checkboxu vede na novou veřejnou stránku **`/terms`** a otevře se v nové záložce.

## 2. Nové a změněné soubory

| Soubor | K čemu slouží |
|---|---|
| `apps/web/src/pages/SignInPage.tsx` | pole `confirmPassword`, kontrola shody, přesun checkboxu, `Link` na `/terms` |
| `apps/web/src/pages/TermsPage.tsx` | **nový** – stránka s podmínkami (sekce jsou pole `SECTIONS`) |
| `apps/web/src/App.tsx` | veřejná route `/terms` (bez `ProtectedRoute`) |

## 3. Jak to funguje

### Pořadí kontrol při registraci

1. všechna pole vyplněná
2. heslo má aspoň 6 znaků
3. heslo == potvrzení
4. zaškrtnutý souhlas

Pořadí odpovídá tomu, jak uživatel formulář vyplňuje shora dolů – dostane chybu u toho, co je nejvýš.

### Živá vs. odesílací kontrola

Hláška pod polem se počítá přímo v renderu (`formData.confirmPassword && password !== confirmPassword`) – žádný extra `useState`. Ukáže se, až uživatel do potvrzení něco napíše, takže prázdné pole nesvítí červeně. Kontrola v `handleSubmit` je pojistka – živá hláška odeslání nezablokuje.

### Proč odkaz v nové záložce

Kdyby `/terms` nahradilo přihlašovací stránku, po návratu by byl formulář prázdný (stav je v `useState` komponenty, která se odmontovala). `target="_blank"` to řeší. Tlačítko zpět na `/terms` proto kontroluje `window.history.state?.idx` (react-router si tam ukládá pozici v historii): když je 0, není kam se vrátit, a jde se na `/signin`.

## 4. Poznámka

Text podmínek je obecný návrh – před ostrým spuštěním ho má zkontrolovat někdo právně (GDPR, kontakt na provozovatele, rozhodné právo).
