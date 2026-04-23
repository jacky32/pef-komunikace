Tento dokument slouží jako kompletní zadání (prompt) pro AI agenta nebo vývojáře pro implementaci hry **"Komunikační Spojovatel PEF"**.

--

# Obecné zadání:

Spojovatel (Node Connector)

- Popis: Logická rychlíkovka. Na mřížce 5x5 jsou zobrazeny různé segmenty kabelů nebo komunikačních vln (rovné, zahnuté). Na jedné straně je Odesílatel, na druhé Příjemce.

- Cíl hry: Hráč klikáním otáčí jednotlivé segmenty tak, aby vytvořil nepřerušenou cestu od odesílatele k příjemci. Jakmile je cesta spojena, zpráva proběhne a vygeneruje se nová mřížka.

- Téma: Základem každé komunikace je navázání stabilního spojení (fyzického i logického).

- Hodnocení: Čas (jak rychle hráč dokáže propojit např. 5 po sobě jdoucích úrovní, řazení ASC).

---

# Technická specifikace: Komunikační Spojovatel PEF

## 1. Základní informace

- **Název hry:** Komunikační Spojovatel PEF
- **Identifikátor:** `pef_komunikace_spojovatel`
- **Autor:** Patrik Broniek
- **Téma:** Navazování stabilního spojení pro digitální **komunikaci**.
- **Cíl hry:** Propojit uzel "Odesílatel" s uzlem "Příjemce" pomocí rotace segmentů sítě v co nejkratším čase.
- **Vyhodnocení:** Čas (sekundy/milisekundy) za **1 puzzle = 1 herní session**, řazení **ASC** (vzestupně – čím kratší čas, tím lépe).
- **Start/Cíl:** Pevně dáno – Start = buňka `[0,0]` (levý horní roh), Cíl = buňka `[9,9]` (pravý dolní roh).

## 2. Architektura systému

### A. Klient (Frontend - HTML5, CSS3, JavaScript)

- **Offline-first:** Hra je spustitelná otevřením `index.html`.
- **LocalStorage:** Pokud není server dostupný, ukládá se nejlepší čas lokálně pod klíčem `pef_game_local_pb`.
- **Herní mechanika:** \* Mřížka 10x10.
  - Dva pevné body: Start (Vstupní brána komunikace) a Cíl (Koncový uzel).
  - Dílky: Přímý spoj, Koleno (90°), Křížení.
  - Ovládání: Klik na dílek otočí segment o 90° doprava.
- **Vizuál:** Branding PEF (modrá/zelená/šedá), čistý UI design.

### B. Server (Backend - PHP 8.x, Mysql/MariaDB)

- **Databázová entita `GameInstance`:**
  - `id` (PK), `instance_id` (UUID/Hash), `layout_json` (text), `created_at`, `player_name`, `final_time`, `is_verified` (bool).
- **Bezpečnost:** Hashování dat (SHA-256) při odesílání skóre s využitím `instance_id` jako "saltu", aby se zabránilo podvrhnutí času v konzoli. Zároveň ukládá konkrétní level, který vytvoří danému uživateli.

---

## 3. Logika generování levelu (PHP Backend)

Při spuštění hry (nebo kliknutí na "Nová hra") klient zavolá API.

**Endpoint:** `POST /api/init_game.php`

1.  **Generování cesty:** Server vygeneruje náhodnou, ale zaručeně řešitelnou cestu v mřížce 5x5.
2.  **Layout:** Zbytek mřížky vyplní náhodnými segmenty.
3.  **Rotace:** Všechny segmenty (včetně těch na správné cestě) náhodně otočí (0°, 90°, 180°, 270°).
4.  **Uložení:** Server uloží tento layout a `start_timestamp` do DB k novému `instance_id`.
5.  **Odpověď:** Vrátí klientovi JSON s `instance_id` a polem `layout` (typy dílků a jejich počáteční rotace).

---

## 4. API Funkce (Specifikace pro AI)

### 1. `GET/POST /api/init_game.php`

- **Vstup:** Jméno hráče (nepovinné).
- **Logika:** Vytvoří záznam v DB, vygeneruje řešitelný level.
- **Výstup:** `{ "instance_id": "unique_hash", "layout": [[...], [...]], "message": "Komunikace navázána" }`

### 2. `POST /api/save_score.php`

- **Vstup:** `instance_id`, `final_time`, `verification_hash`.
- **Logika:** 1. Najde v DB instanci podle ID. 2. Ověří, zda `final_time` odpovídá rozdílu mezi `created_at` a aktuálním časem s tolerancí **±5 sekund**. 3. Ověří `verification_hash` (klient posílá `hash(instance_id + final_time + "secret_salt")`). 4. Update záznamu v DB (přidání času a jména). 5. Před uložením jméno projde **automatickým filtrem sprostých slov** (seznam zakázaných výrazů na serveru).
- **Výstup:** `{ "status": "success", "position": 4 }`

### 3. `GET /api/leaderboard.php`

- **Výstup:** Top 10 hráčů (Jméno, Čas, Datum) seřazených podle času ASC.

---

## 5. Algoritmus kontroly vítězství (JS na klientovi)

Při každém kliknutí (otočení dílku) spustí klient funkci `checkConnection()`:

1.  Začne v bodě Start.
2.  Rekurzivně (nebo pomocí fronty - BFS) prochází sousední dílky.
3.  Kontroluje, zda typ dílku a jeho aktuální rotace logicky navazuje na předchozí (např. zda "pravý vývod" dílku A sousedí s "levým vývodem" dílku B).
4.  Pokud dosáhne bodu Cíl, hra končí -> zastaví stopky -> nabídne odeslání na server.

---

## 6. Prvky "Komunikace" (Texty pro UI)

- **Úvodní obrazovka:** "Vítejte v simulátoru digitální **komunikace** PEF. Vaším úkolem je propojit uzly sítě dříve, než vyprší timeout."
- **Chybová hláška:** "Spojení ztraceno – komunikační šum je příliš vysoký."
- **Gratulace:** "Úspěch! **Komunikace** byla navázána v rekordním čase."

---

## Pokyny pro AI implementátora (Prompt):

> "Napiš PHP skript pro `init_game.php`, který vygeneruje 5x5 mřížku pro hru 'Spojovatel'. Mřížka musí obsahovat pole objektů, kde každý má `type` (straight, elbow, cross) a `rotation` (0-3). Zajisti, aby existovala aspoň jedna cesta ze souřadnice [0,0] na [4,4]. Výsledek ulož do tabulky `game_instances` a vrať jako JSON. Následně napiš JavaScriptovou funkci pro rotaci dílku v HTML tabulce a kontrolu, zda jsou dva sousední dílky propojeny."

---

Ověř, že je splněno následující zadání:
Požadavky na absolvování

Klient - aplikace / hra

- název

- identifikátor

- autor

- popis

- podle čeho se vyhodnocuje pořadí? skóre (body) nebo čas a řazení (ASC / DESC)

Data ukládá lokálně (LocalStorage apod.), v případě, že existuje spojení se serverem, tak je uloží na server (synchronizuje).

Server

- zobrazuje tuto jedinou hru a její leaderboard

- obsluhuje ukládání dat

- řeší moderování vložených dat (zobrazených uživatelských jmen apod.)

/api funkce

- uložit skóre uživatele (s identifikátorem odehrané hry - například timestamp)

- načítat leaderboard

Příklad:

Leaderboard hry "Přenes kód"

Hráč

Skóre

Čas

Honza

50

2:30

Tonda

44

2:33

Konkrétní podmínky:

1 hráč

max 1-3min

klikačka/šipky/..

jednoduché

na téma komunikace - zařadit tam slovo komunikace

spustitelná lokálně

pokud je dostupný server, pošlou se data na server nejlépe nějak šifrovaně - na začátku uložit informace o instanci
