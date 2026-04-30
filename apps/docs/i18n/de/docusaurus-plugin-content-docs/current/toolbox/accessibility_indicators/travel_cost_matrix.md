---
sidebar_position: 10
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Reisekostenmatrix

Die Reisekostenmatrix **berechnet Reisezeit oder Entfernung zwischen einer Menge von Ursprüngen und einer Menge von Zielen** und erzeugt eine Tabelle, die für Erreichbarkeitsanalysen, Standortplanung und räumliche Modellierung verwendet werden kann.

## 1. Erklärung

Die Reisekostenmatrix berechnet die **Reisekosten (Zeit oder Entfernung) zwischen jedem Ursprungs-Ziel-Paar** in zwei Eingabe-Layern für einen gewählten Routing-Modus. Das Ergebnis ist eine Tabelle, in der jede Zeile eine OD-Verbindung mit Ursprungskennung, Zielkennung und den berechneten Reisekosten darstellt.

Die Reisekostenmatrix ist für die **Massenberechnung über viele Ursprünge und Ziele gleichzeitig** ausgelegt. Dies macht sie zum richtigen Tool, wenn Sie die Rohdaten für weiterführende Analysen benötigen, z. B. für Standortbewertungen, Angebot-Nachfrage-Abgleiche oder individuelle Erreichbarkeitsindizes.

## 2. Anwendungsbeispiele

- Berechnung von Gehzeiten von allen Wohngebäuden zu den nächstgelegenen Schulen, um unterversorgte Gebiete zu identifizieren.
- Berechnung von Fahrzeiten zwischen einer Menge von Lagerhäusern (Ursprünge) und Einzelhandelsgeschäften (Ziele) zur Logistikoptimierung.
- Erstellung einer Eingangsmatrix für einen individuellen Erreichbarkeitsindex, der die Reisezeit nach Attraktivität des Ziels gewichtet.
- Bewertung, wie viele Ziele von jedem Ursprung aus innerhalb einer bestimmten Reisezeitgrenze erreichbar sind.
- Vergleich von Reisekostunterschieden zwischen zwei Verkehrsmitteln (z. B. Fahrrad vs. öffentlicher Verkehr) für eine Menge von OD-Paaren.

## 3. Verwendung des Tools

<div class="step">
  <div class="step-number">1</div>
  <div class="content">Klicken Sie auf <code>Werkzeugkasten</code> <img src={require('/img/icons/toolbox.png').default} alt="Werkzeugkasten" style={{ maxHeight: "20px", maxWidth: "20px", objectFit: "cover"}}/> und klicken Sie unter <code>Erreichbarkeitsindikatoren</code> auf <code>Reisekostenmatrix</code>.</div>
</div>

### Routing

<div class="step">
  <div class="step-number">2</div>
  <div class="content">Wählen Sie den <code>Routentyp</code> für die Reisekostenberechnung.</div>
</div>

<Tabs>
<TabItem value="walk" label="Zu Fuß" default className="tabItemBox">

**Berücksichtigt alle zu Fuß zugänglichen Wege.**

<div class="step">
  <div class="step-number">3</div>
  <div class="content">Wählen Sie, ob die Reisekosten auf Basis von <code>Zeit</code> oder <code>Entfernung</code> berechnet werden sollen, und setzen Sie das entsprechende Limit.</div>
</div>

<div class="step">
  <div class="step-number">4</div>
  <div class="content">Bei Wahl von <code>Zeit</code> können Sie auch die <code>Geschwindigkeit</code> festlegen.</div>
</div>

:::tip Hinweis

Geeignete Reisezeitlimits nach Einrichtungstyp finden Sie im [Standortwerkzeug](https://www.chemnitz.de/chemnitz/media/unsere-stadt/verkehr/verkehrsplanung/vep2040_standortwerkzeug.pdf) der Stadt Chemnitz.

:::

</TabItem>

<TabItem value="cycling" label="Fahrrad/Pedelec" className="tabItemBox">

**Berücksichtigt alle fahrradgängigen Wege.** Berücksichtigt Oberflächenqualität, Ebenheit und Steigung. Für Pedelec haben Steigungen einen geringeren Widerstand als bei Standardfahrrädern.

<div class="step">
  <div class="step-number">3</div>
  <div class="content">Wählen Sie, ob die Reisekosten auf Basis von <code>Zeit</code> oder <code>Entfernung</code> berechnet werden sollen, und setzen Sie das entsprechende Limit.</div>
</div>

<div class="step">
  <div class="step-number">4</div>
  <div class="content">Bei Wahl von <code>Zeit</code> können Sie auch die <code>Geschwindigkeit</code> festlegen.</div>
</div>

:::tip Hinweis

Geeignete Reisezeitlimits nach Einrichtungstyp finden Sie im [Standortwerkzeug](https://www.chemnitz.de/chemnitz/media/unsere-stadt/verkehr/verkehrsplanung/vep2040_standortwerkzeug.pdf) der Stadt Chemnitz.

:::

</TabItem>

<TabItem value="car" label="Auto" className="tabItemBox">

**Berücksichtigt alle mit dem Auto befahrbaren Wege.** Berücksichtigt Geschwindigkeitsbegrenzungen und Einbahnstraßen.

<div class="step">
  <div class="step-number">3</div>
  <div class="content">Wählen Sie, ob die Reisekosten auf Basis von <code>Zeit</code> oder <code>Entfernung</code> berechnet werden sollen, und setzen Sie das entsprechende Limit.</div>
</div>

</TabItem>

<TabItem value="public transport" label="Öffentlicher Verkehr (ÖV)" className="tabItemBox">

**Berücksichtigt alle per öffentlichem Verkehr erreichbaren Orte**, einschließlich intermodaler Umstiege und Haltestellen-Zugang/-Abgang.

<div class="step">
  <div class="step-number">3</div>
  <div class="content">Wählen Sie die <code>Öffentlichen Verkehrsmittel</code> für die Analyse: Bus, Straßenbahn, Bahn, U-Bahn, Fähre, Seilbahn, Gondel und/oder Standseilbahn. Wählen Sie dann <code>Tag</code>, <code>Startzeit</code> und <code>Endzeit</code> für das Analysezeitfenster.</div>
</div>

<div class="step">
  <div class="step-number">4</div>
  <div class="content">Optional können Sie auf <code>Erweiterte Konfiguration</code> klicken, um die <code>Maximalen Umstiege</code>, den <code>Zugangsmodus</code> und den <code>Abgangsmodus</code> zu konfigurieren.</div>
</div>

</TabItem>
</Tabs>

### Ursprünge

<div class="step">
  <div class="step-number">5</div>
  <div class="content">Wählen Sie Ihren <code>Ursprungs-Layer</code>. Dies sollte ein <strong>Punktlayer</strong> sein, bei dem jedes Feature einen Startort darstellt.</div>
</div>

<div class="step">
  <div class="step-number">6</div>
  <div class="content">Wählen Sie das <code>Ursprungs-ID-Feld</code>. Dieses Feld identifiziert jeden Ursprung eindeutig in der Ausgabetabelle.</div>
</div>

### Ziele

<div class="step">
  <div class="step-number">7</div>
  <div class="content">Wählen Sie Ihren <code>Ziel-Layer</code>. Dies sollte ein <strong>Punktlayer</strong> sein, bei dem jedes Feature einen Zielort darstellt.</div>
</div>

<div class="step">
  <div class="step-number">8</div>
  <div class="content">Wählen Sie das <code>Ziel-ID-Feld</code>. Dieses Feld identifiziert jedes Ziel eindeutig in der Ausgabetabelle.</div>
</div>

<div class="step">
  <div class="step-number">9</div>
  <div class="content">Klicken Sie auf <code>Ausführen</code>.</div>
</div>

:::tip Hinweis

Die Berechnungszeit skaliert mit der Anzahl der OD-Paare. Den Fortschritt können Sie in der [Statusleiste](../../workspace/home#status-bar) verfolgen.

:::

### Ergebnisse

Nach Abschluss der Berechnung wird ein **Tabellen-Layer** zum Kartenpanel hinzugefügt. Jede Zeile stellt ein Ursprungs-Ziel-Paar dar, das innerhalb des festgelegten Reisekostenschwellenwerts liegt.

| Spalte | Beschreibung |
|--------|-------------|
| `origin_id` | Kennung des Ursprungs-Features (aus dem gewählten Ursprungs-ID-Feld) |
| `destination_id` | Kennung des Ziel-Features (aus dem gewählten Ziel-ID-Feld) |
| `travel_cost` | Reisezeit (Minuten) oder Entfernung (Meter), je nach gewähltem Maßtyp |

OD-Paare, die den maximalen Reisekostenwert überschreiten, werden aus der Ausgabe ausgeschlossen.

Ein **Ziel**-Punktlayer wird ebenfalls hinzugefügt, der alle ursprünglichen Zielattribute um den berechneten **travel_cost**-Wert für jeden Punkt ergänzt.

:::tip Tipp
Möchten Sie diese Matrix für weitere Analysen verwenden? Verwenden Sie die Ergebnistabelle als Eingabe für andere Tools in einem [Workflow](../../map/layers.md) oder exportieren Sie sie als CSV für externe Tools.
:::

## 4. Technische Details

Reisekosten werden mit der **gleichen Routing-Engine wie das Einzugsgebiet-Tool** berechnet, was konsistente Ergebnisse über alle Erreichbarkeitsanalysen in GOAT hinweg gewährleistet. Für jeden Ursprung erkundet der Routing-Algorithmus das Netzwerk bis zu den festgelegten maximalen Kosten und erfasst die Kosten zu jedem erreichbaren Ziel.

### Rechnerische Überlegungen

- Die Anzahl der Berechnungen skaliert als **U × Z** (Anzahl der Ursprünge × Anzahl der Ziele). Große Datensätze mit vielen Ursprüngen und Zielen benötigen mehr Verarbeitungszeit.
- Ein realistisches **maximales Reisekostenlimit** reduziert die Berechnungszeit und die Ausgabegröße erheblich.
- Für den **Öffentlichen Verkehr** stellt der Reisekostenwert die durchschnittliche Reisezeit für alle möglichen Fahrten dar, die innerhalb des festgelegten Zeitfensters abfahren.

### Ausgabegeometrie

Die Reisekostenmatrix erzeugt einen **tabellarischen (nicht-räumlichen) Layer**. Um die Verbindungen auf der Karte zu visualisieren, verwenden Sie das Tool [Ursprung-Ziel](../geoanalysis/origin_destination.md), das eine OD-Tabelle und einen Geometrie-Layer verwenden kann, um Verbindungslinien darzustellen.

:::tip Hinweis

Weitere Einblicke in den Routing-Algorithmus finden Sie unter [Routing](../../category/routing).

:::
