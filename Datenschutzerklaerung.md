<!-- pandoc -s Datenschutzerklaerung.md -o docs/Datenschutzerklaerung.docx -->
*[DRAFT 2025-11-13]*

# Datenschutzerklärung RESQUE‑Collector-App

*Stand: 2025-11-13* <br>
*Kontakt: Prof. Dr. Felix Schönbrodt (felix.schoenbrodt@psy.lmu.de).*

## 1) Wer wir sind

Diese App („RESQUE Collector App“) ist eine rein client‑seitige Web‑Anwendung, die im Rahmen einer Arbeitsgruppe der Deutschen Gesellschaft für Psychologie erstellt wurde. Sie wurde programmiert am Lehrstuhl Methodenlehre und Diagnostik der Ludwig‑Maximilians‑Universität München (LMU). 

## 2) "Privacy by design": Ihre Formulareingaben bleiben lokal und werden nie an Dritte weitergeleitet

* **Formulareingaben und Arbeitsstand** werden **ausschließlich im Browser** auf Ihrem Gerät gespeichert. Es findet hierfür **keine Übertragung an einen Server** statt - weder an uns noch an Github oder sonstige Dritte.
* **Export/Import**: Sie können Ihre Daten als **lokale JSON‑Datei** speichern und wieder laden; auch dabei werden die Daten **nicht an Server gesendet**, sondern als Datei auf Ihrem Gerät erstellt/eingelesen.


## 3) Wann verlassen welche Daten Ihr Gerät?

Die App kommt ohne Server‑Backends für Ihre Inhalte aus, und Sie können die App (nachdem die Webseite geladen ist) auch komplett offline benutzen. Es gibt aber Situationen, in denen **technisch notwendige oder von Ihnen ausgelöste** Anfragen an externe Dienste erfolgen. Hierbei werden abgesehen von dois und (wenn Sie das wünschen) Ihrer ORCID **keine Ihrer Formulareingaben** übertragen.

### A) Nutzungsanalyse

* **Matomo**: Beim Seitenaufruf wird ein Matomo‑Skript eingebunden, das anonym Seitenaufrufe erfasst und auf einem Server der Ludwig-Maximilians-Universität München speichert. Es werden **keine Cookies oder Tracker von Drittanbietern** verwendet, es wird keine identifizierbare IP gespeichert. Wir nutzen diese Funktion um festzustellen, wie oft die App aufgerufen wird.

### B) Von Ihnen ausgelöste Abrufe externer Metadaten (optional)

* **DOI‑Abfrage (doi.org)**: Wenn Sie bei einer Publikation eine DOI eintragen, ruft die App **Titel, Jahr und ggf. Abstract** zu dieser DOI von **doi.org** ab. Dazu wird an doi.org die von Ihnen angegebene DOI übermittelt. Es werden nur Metadaten zu der jeweiligen Publikation abgefragt, die ohnehin öffentlich vorliegen.
* **ORCID‑Import (pub.orcid.org)**: Wenn Sie den ORCID‑Import nutzen, werden über Ihre **ORCID‑Kennung** Ihre Publikationsdaten (Titel, Jahr, DOI) abgefragt und zur Auswahl angezeigt. Diese Abrufe erfolgen **nur**, wenn Sie den Import auslösen und frägt ebenfalls nur Informationen ab, die ohnehin öffentlich vorliegen.

## 4) Zusammenfassung: Welche Daten verarbeitet die App wofür?

| Verarbeitung                   | Datenkategorien                                                                                        | Zweck                                         | Rechtsgrundlage                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------------------------ | --------------------------------------------- | -------------------------------------------------------------------------------------- |
| **Lokaler Speicher (Browser)** | Ihre Formulareingaben, Arbeitsstand, aktueller Tab/Status                                              | Bedienkomfort, Wiederaufnahme der Arbeit      | - keine Datenverarbeitung durch Dritte -                                               |
| **Matomo**                     | Nutzungsdaten (z. B. Seitenaufrufe, Klicks) – **keine Eingabedaten; IP wird anonymisiert gespeichert** | Reichweitenmessung                            | **Art. 6 Abs. 1 lit. f DSGVO** (berechtigtes Interesse). Hinweis in‑App: ohne Cookies. |
| **DOI‑Abruf**                  | Ihre eingegebene DOI → **Titel, Jahr, ggf. Abstract** werden geladen                                   | Komfortfunktion: Felder automatisch ausfüllen | **Art. 6 Abs. 1 lit. b DSGVO** (auf Ihre Anfrage)                                      |
| **ORCID‑Import**               | Ihre ORCID‑Kennung → **Publikationsliste (Titel, Jahr, DOI)**                                          | Komfortfunktion: Mehrere Einträge übernehmen  | **Art. 6 Abs. 1 lit. b DSGVO** (auf Ihre Anfrage)                                      |

## 5) Empfänger / Drittanbieter‑Hosts

Diese Hosts können – je nach Nutzung – Anfragen erhalten:

* **tellmi.psy.lmu.de** (Matomo: Webseitenaufrufe zählen). 
* **doi.org** (Abruf von öffentlichen Publikationsmetadaten zu einer DOI). 
* **pub.orcid.org** (Abruf von öffentlichen Publikationslisten zu einer ORCID). 
* **Externe Links** im Interface (z. B. resque.info, GitHub) werden **nur** bei Klick geöffnet. 

## 6) Speicherdauer und Löschung

* **Lokal im Browser**: Ihre Inhalte bleiben gespeichert, bis Sie sie löschen (z. B. über „Clear“ in der Web-App) oder den Browser‑Speicher zurücksetzen. 
* **Exportdateien** (JSON) speichern Sie selbst; deren Verwaltung liegt in Ihrer Hand. 
* **Nutzungsanalyse** (Matomo): Die anonyme Zählung der Webseitenaufrufe hat keine festgelegte Löschungfrist.

## 7) Keine Pflicht zur Bereitstellung / Do‑Not‑Track

Die Nutzung der App ist ohne DOI/ORCID möglich. Wenn Sie DOI/ORCID nicht nutzen, finden keine API‑Abrufe statt und Sie können die App auch komplett offline nutzen.

## 8) Ihre Rechte (DSGVO)

Soweit wir personenbezogene Daten verarbeiten, haben Sie – im Rahmen der gesetzlichen Voraussetzungen – die Rechte auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung (Art. 18), Datenübertragbarkeit (Art. 20) sowie Widerspruch gegen Verarbeitungen auf Grundlage berechtigter Interessen (Art. 21).
Bitte wenden Sie sich hierzu an Prof. Dr. Felix Schönbrodt (felix.schoenbrodt@psy.lmu.de).

*Hinweis*: Die Formulareingaben bleiben ausschließlich lokal in Ihrem Browser gespeichert. Unabhängig davon fallen bei der technischen Bereitstellung der Website und ggf. der Reichweitenmessung (Matomo) Verarbeitungen von Zugriffsdaten (z. B. IP‑Adresse, Zeitpunkt, aufgerufene URL) an; Details siehe Abschnitte „Wann verlassen Daten Ihr Gerät?“ und „Rechtsgrundlagen“.

## 9) Sicherheit

Wir empfehlen, diese App **auf einem vertrauenswürdigen Gerät** zu verwenden und bei gemeinsam genutzten Rechnern nach der Nutzung die Daten lokal zu **löschen** ("Clear" links oben) oder als Datei zu **sichern** ("Save to file ..." links oben). Personen die Zugriff auf Ihr Gerät und ihren Nutzeraccount haben, können Ihre lokal gespeicherten Daten einsehen.

## 10) Änderungen

Wir können diese Datenschutzerklärung anpassen, wenn sich die App oder die Rechtslage ändert.

---

### Transparenz-Anhang (technische Details)

* **Lokaler Speicher**: Die App liest/schreibt Ihre Eingaben im `localStorage`/`sessionStorage` (u. a. aktueller Tab, vollständige Datensätze).
* **DOI/ORCID**: Abrufe werden nur ausgelöst, wenn Sie die Felder nutzen/den Import starten (`fetchInformationUsingDOI`, `fetchPapersByORCID`/`fetchAuthorByORCID`).
* **Matomo**: Einbindung über den LMU-Server **tellmi.psy.lmu.de** mit `trackPageView`/`enableLinkTracking`. 
