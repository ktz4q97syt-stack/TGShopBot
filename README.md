# 🤖 t.me/autoacts – Shop Bot Core | v0.5.0

[span_0](start_span)Ein professionelles Telegram-E-Commerce-System mit hierarchischer Rechteverwaltung, flexiblem Liefersystem, manuellem Zahlungsflow und dezentraler Datenstruktur.[span_0](end_span) [span_1](start_span)Entwickelt von t.me/autoacts.[span_1](end_span)

---

## 🆕 Changelog v0.5.0 – Feedback-System & Command-Refactoring
- **⭐ Neues Feedback-System:** Kunden können qualifizierte Bestellungen mit Sternen (1-5) und einem Kommentar bewerten.
- **🕵️ Anonymitäts-Option:** Kunden können wählen, ob ihr Username oder "CustomerXXXX" angezeigt wird.
- **✅ Freigabe-Workflow:** Admins/Master prüfen neue Feedbacks, bevor diese öffentlich in der Kundenansicht erscheinen.
- **🧹 Command-Refactoring:** Der fehleranfällige `/orders` Befehl wurde durch `/allorders` und `/allopenorders` ersetzt, um Konflikte bei der Order-ID-Suche zu verhindern.
- **ℹ️ Rollenspezifische Menüs:** Der "Befehle & Info"-Button zeigt nun strikt getrennte Funktionen und Erklärungen für Admins und Master an.

## ✨ Hauptfunktionen (Zusammenfassung v0.3.0 - v0.5.0)

### 🛍 Bestell- & Bezahlsystem
- **[span_2](start_span)Vollständiger Bestellfluss:** Der Shop bietet einen nahtlosen Ablauf von Warenkorb über Checkout zur Rechnung und Statusverfolgung.[span_2](end_span)
- **[span_3](start_span)TX-ID Zahlungsflow:** Kunden bestätigen ihre Zahlungen per TX-ID, woraufhin Admins sofort zur manuellen Prüfung benachrichtigt werden.[span_3](end_span)
- **[span_4](start_span)Persistente Kunden-Receipts:** Nach dem Kauf erhalten Kunden eine dauerhafte Rechnung inklusive kopierbarer Zahlungsadresse.[span_4](end_span)

### 🚚 Intelligentes Liefersystem
- **[span_5](start_span)[span_6](start_span)Flexible Lieferoptionen:** Für jedes Produkt kann individuell konfiguriert werden, ob es digital (kein Versand), per Versand, zur Abholung oder mit einer Wahlmöglichkeit (Versand & Abholung) angeboten wird.[span_5](end_span)[span_6](end_span)
- **Sichere Versandadressen:** Aus Sicherheitsgründen werden Adressen nur als Privnote-Link akzeptiert; [span_7](start_span)Klartext wird automatisch gelöscht.[span_7](end_span)

### 🛠 Hierarchische Verwaltung (Master & Admin)
- **[span_8](start_span)Drill-Down Admin-Menü:** Admins navigieren übersichtlich durch `Kategorie » Unterkategorie » Produkte`.[span_8](end_span)
- **[span_9](start_span)Spam-freies Sortieren:** Die Position von Produkten und Kategorien (🔼/🔽) lässt sich geräuschlos via Text/Bild-Edit ändern.[span_9](end_span)
- **[span_10](start_span)Smart Cleaning:** Der Bot räumt den Chat automatisch auf und löscht obsolete Benachrichtigungen (wie "Neue Bestellung"), sobald eine Bestellung bearbeitet wird.[span_10](end_span)
- **[span_11](start_span)Erweiterte Kundenübersicht:** Das Master-Panel bietet eine Übersicht über Umsatz, Bestellhistorien sowie Ban- und Lösch-Funktionen pro Kunde.[span_11](end_span)
## 🏗 Architektur @autoacts

### 🛒 Bestell- & Feedbackfluss

Kunde: Shop → Warenkorb → Checkout
↓
[Lieferoption wählen: Versand / Abholung / keine]
↓
[Versandadresse als Privnote-Link (nur bei Versand)]
↓
Zahlungsart wählen → Rechnung mit Kategorie-Pfad & Wallet-Adresse
↓
"Bestellung abschicken" → Order erstellt
↓
Receipt an Kunden (persistent):
• Order-ID, Betrag, Zahlungsadresse
• Button "💸 Zahlung bestätigen"
↓
Admin/Master erhält: "NEUE BESTELLUNG" (Bot merkt sich Message-ID)
↓
Kunde: "Zahlung bestätigen" → TX-ID eingeben
↓
Status: "Bezahlt? (Prüfung)" → Admin prüft
↓
Admin: Klickt auf "Bestellung öffnen" (Smart Cleaning löscht die Benachrichtigung)
→ Status manuell ändern → Kunde erhält Status-Update
↓
Admin: Qualifiziert die Bestellung für ein ⭐ Feedback
↓
Kunde erhält Einladung → Gibt Sterne (1-5) & Kommentar ab → Wählt Anonymität
↓
Admin/Master prüft das Feedback → Klickt auf ✅ Freigeben
↓
Feedback ist nun im Hauptmenü für alle Kunden öffentlich sichtbar


### 👥 Rollensystem

| Rolle | Rechte |
|---|---|
| **👑 Master** | Alles. [span_12](start_span)Admins verwalten, Zahlungsarten, Kundenübersicht, Freigaben, Bans bestätigen[span_12](end_span) |
| **🛠 Admin** | [span_13](start_span)Produkte/Kategorien verwalten, Bestellungen bearbeiten, Broadcasts, Statusänderungen[span_13](end_span) |
| **👤 Kunde** | [span_14](start_span)Shop durchsuchen, bestellen, Zahlung bestätigen, Ping/Kontakt[span_14](end_span), ⭐ Feedback abgeben |

### 📦 Lieferoptionen (pro Produkt)

| Option | Checkout-Verhalten |
|---|---|
| 📱 Digital | [span_15](start_span)Direkt zur Zahlung, keine Adressabfrage[span_15](end_span) |
| 🚚 Versand | [span_16](start_span)Privnote-Adresse erforderlich[span_16](end_span) |
| 🏪 Abholung | [span_17](start_span)Direkt zur Zahlung[span_17](end_span) |
| 🚚🏪 Beide | [span_18](start_span)Kunde wählt Versand oder Abholung[span_18](end_span) |

## 🚀 Installation & Setup

### 1. Abhängigkeiten
[span_19](start_span)Es wird Node.js (v18+) benötigt.[span_19](end_span)
```bash
npm install

2. Datenbank (Supabase)
Die gesamte Datenbankstruktur muss im Supabase SQL Editor ausgeführt werden.
Wichtig für V0.5: Stelle sicher, dass die neue Tabelle feedbacks und die Spalte feedback_invited in der Tabelle orders angelegt sind.  

3. Environment Variables
Lege folgende Variablen in deiner .env Datei oder in den Settings deines Hosters (z.B. Render.com) an:  
TELEGRAM_BOT_TOKEN=your_bot_token
SUPABASE_URL=[https://your-project.supabase.co](https://your-project.supabase.co)
SUPABASE_KEY=your_service_role_key
MASTER_ADMIN_ID=your_telegram_id
VERSION=0.5.0
PORT=10000

4. Starten
node src/index.js

🔧 Bot-Befehle V0.5

Befehl Rolle Beschreibung
/start Alle Hauptmenü (rollenbasiert)
/allorders Admin/Master Alle Bestellungen anzeigen (Ersatz für /orders)
/allopenorders Admin/Master Alle offenen Bestellungen anzeigen
/orderid ORD-XXXX Admin/Master Einzelne Bestellung öffnen
/id ORD-XXXX Admin/Master Alias für /orderid
/deleteid ORD-XXXX Admin/Master Bestellung löschen
/ban 123456789 Admin/Master User sperren
/addadmin 123456789 Master Admin hinzufügen

🛡 Sicherheit & Tech Stack
Privnote-Adressen: Versandadressen werden nur als selbstzerstörende Privnote-Links akzeptiert. Klartext wird automatisch gelöscht.  
Ban-System: 48h Pending mit Master-Override. Gebannte User können den Bot nicht mehr nutzen.  
Approval-Workflow: Admin-Aktionen (Preisänderungen, Löschungen) erfordern Master-Freigabe.  
Datenbanksicherheit: Row Level Security (RLS) aktiv. Der Bot arbeitet sicher über den Service Role Key.  
Tech Stack: Node.js, Telegraf v4, Supabase (PostgreSQL), Render.com.  
<!-- end list -->

---

## 📄 Lizenz & Nutzungsbedingungen

© 2026 t.me/autoacts. Alle Rechte vorbehalten.

Mit dem Erhalt oder Erwerb dieser Software wird dir eine **einfache, nicht-exklusive und nicht-übertragbare Nutzungslizenz** für den eigenen Gebrauch eingeräumt.

❌ **Folgendes ist strengstens untersagt:**
- Der Weiterverkauf (Reselling) der Software, des Codes oder Teilen davon.
- Die Weitergabe, Veröffentlichung oder Unterlizenzierung an Dritte.
- Das Kopieren des Codes, um ihn als eigenes Produkt (White-Labeling) auf den Markt zu bringen.

Dieses Projekt ist **keine** Open-Source-Software. Jegliche Zuwiderhandlung führt zum sofortigen Entzug der Nutzungslizenz und kann rechtliche Konsequenzen nach sich ziehen.
