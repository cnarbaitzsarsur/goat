---
sidebar_position: 9
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Einzugsgebiet V2 (Beta)

Einzugsgebiet V2 zeigt **wie weit Menschen innerhalb einer bestimmten Reisezeit oder Entfernung, mit einem oder mehreren Verkehrsmitteln reisen können** — mit erweiterten Ausgabeformen, anpassbaren Schrittgrößen und zusätzlichen Einstellungen für den öffentlichen Verkehr.

:::info Beta-Funktion
Einzugsgebiet V2 befindet sich derzeit in der **Beta-Phase**. Es läuft parallel zum Standard-Tool [Einzugsgebiet](./catchments.md) und wird dieses schrittweise ersetzen. Funktionen und Parameter können sich im Zuge von Nutzerfeedback ändern.
:::

## 1. Erklärung

Einzugsgebiet V2 baut auf dem Standard-Einzugsgebiet-Tool auf und erweitert es um folgende Funktionen:

**Für alle Routing-Modi:**

- **Anpassbare Schrittgrößen** — jeden Isochronenschritt individuell definieren (z. B. 5, 10, 20, 30 Minuten) anstatt gleichmäßiger Abstände.
- **Punktraster-Ausgabeform** — eine neue Ausgabeoption, bei der das Einzugsgebiet als Raster einzelner Punkte dargestellt wird, die jeweils den genauen Reisekostenwert anzeigen.

**Nur für den öffentlichen Verkehr:**

- **Maximale Anzahl an Umstiegen** — begrenzt die Anzahl der ÖV-Verbindungen pro Fahrt.
- **Zugangs- und Abgangsmodus** — konfiguriert, wie Nutzer zu ÖV-Haltestellen und von diesen weg gelangen (zu Fuß, mit dem Fahrrad oder mit dem Auto).

Basierend auf festgelegten Startpunkten, maximaler Reisezeit oder Entfernung und Verkehrsmitteln **visualisiert das Tool die Erreichbarkeit anhand realer Routing-Netzwerke**. Die resultierenden Isochronen können mit räumlichen Datensätzen — wie Bevölkerungs- oder Infrastrukturdaten — verschnitten werden, um die Abdeckung zu bewerten und Erreichbarkeitslücken zu identifizieren.

:::info
Die Berechnung von Einzugsgebiet V2 ist in bestimmten Regionen verfügbar.

Nach Auswahl eines `Routentyps` zeigt GOAT eine Kartenüberlagerung mit der Abdeckung an.
Für `Zu Fuß`, `Fahrrad`, `Pedelec` und `Auto`: über 30 europäische Länder werden unterstützt.
Für `Öffentlicher Verkehr`: Deutschland wird unterstützt.

Wenn Sie Analysen außerhalb dieser Regionen benötigen, [kontaktieren Sie uns gerne](https://plan4better.de/en/contact/) — wir besprechen weitere Möglichkeiten.
:::

## 2. Anwendungsbeispiele

- Welche Einrichtungen sind innerhalb von 5, 10 und 20 Minuten zu Fuß erreichbar? (Mit anpassbaren Schrittgrößen entsprechend planerischer Standards.)
- Wie verändert sich das Einzugsgebiet, wenn ÖV-Verbindungen auf einen Umstieg begrenzt werden?
- Welche Gebiete sind innerhalb von 5, 15 und 30 Minuten mit dem Fahrrad von einem neuen Radknoten erreichbar?
- Wie unterscheiden sich die Einzugsgebiete von Arbeitsstätten zwischen Auto und öffentlichem Verkehr, wenn Radfahrer ÖV-Haltestellen nutzen können?
- Welcher Anteil der Bevölkerung hat einen Hausarzt innerhalb von 500 m zu Fuß?

## 3. Verwendung des Tools

<div class="step">
  <div class="step-number">1</div>
  <div class="content">Klicken Sie auf <code>Werkzeugkasten</code> <img src={require('/img/icons/toolbox.png').default} alt="Werkzeugkasten" style={{ maxHeight: "20px", maxWidth: "20px", objectFit: "cover"}}/> . Klicken Sie unter <code>Erreichbarkeitsindikatoren</code> auf <code>Einzugsgebiet V2</code>.</div>
</div>

### Routing & Konfiguration

<div class="step">
  <div class="step-number">2</div>
  <div class="content">Wählen Sie den <code>Routentyp</code> aus und konfigurieren Sie die Parameter für den gewählten Modus gemäß den folgenden Schritten.</div>
</div>

<Tabs>
<TabItem value="walk" label="Zu Fuß" default className="tabItemBox">

**Berücksichtigt alle zu Fuß zugänglichen Wege.**

<div class="step">
  <div class="step-number">3</div>
  <div class="content">Wählen Sie, ob das Einzugsgebiet auf Basis von <code>Zeit</code> oder <code>Entfernung</code> berechnet werden soll, und setzen Sie das entsprechende Limit. Bei Wahl von <code>Zeit</code> können Sie auch die <code>Geschwindigkeit</code> konfigurieren.</div>
</div>

:::tip Hinweis

Geeignete Reisezeitlimits nach Einrichtungstyp finden Sie im [Standortwerkzeug](https://www.chemnitz.de/chemnitz/media/unsere-stadt/verkehr/verkehrsplanung/vep2040_standortwerkzeug.pdf) der Stadt Chemnitz.

:::

<div class="step">
  <div class="step-number">4</div>
  <div class="content">Wählen Sie die <code>Form des Einzugsgebiets</code>. Bei Wahl von: <ul><li><code>Polygon</code> oder <code>Netzwerk</code>: können Sie <code>Schritte</code> und <code>Schrittgrößen</code> festlegen.</li><li><code>Hexagonales Raster</code>: keine weitere Konfiguration erforderlich.</li><li><code>Punktraster</code>: Sie müssen den <code>Punktraster-Layer</code> auswählen, auf den die Werte angewendet werden.</li></ul></div>
</div>

<div class="step">
  <div class="step-number">5</div>
  <div class="content">Wählen Sie die <code>Anzahl der Schritte</code> und die <code>Schrittgrößen</code>.</div>
</div>
</TabItem>

<TabItem value="cycling" label="Fahrrad/Pedelec" className="tabItemBox">

**Berücksichtigt alle fahrradgängigen Wege.** Dieser Routing-Modus berücksichtigt Oberfläche, Ebenheit und Steigung bei der Erreichbarkeitsberechnung. Für Pedelec haben Steigungen einen geringeren Widerstand als bei Standardfahrrädern.

<div class="step">
  <div class="step-number">3</div>
  <div class="content">Wählen Sie, ob das Einzugsgebiet auf Basis von <code>Zeit</code> oder <code>Entfernung</code> berechnet werden soll, und setzen Sie das entsprechende Limit. Bei Wahl von <code>Zeit</code> können Sie auch die <code>Geschwindigkeit</code> konfigurieren.</div>
</div>

:::tip Hinweis

Geeignete Reisezeitlimits nach Einrichtungstyp finden Sie im [Standortwerkzeug](https://www.chemnitz.de/chemnitz/media/unsere-stadt/verkehr/verkehrsplanung/vep2040_standortwerkzeug.pdf) der Stadt Chemnitz.

:::

<div class="step">
  <div class="step-number">4</div>
  <div class="content">Wählen Sie die <code>Form des Einzugsgebiets</code>. Bei Wahl von: <ul><li><code>Polygon</code> oder <code>Netzwerk</code>: können Sie <code>Schritte</code> und <code>Schrittgrößen</code> festlegen.</li><li><code>Hexagonales Raster</code>: keine weitere Konfiguration erforderlich.</li><li><code>Punktraster</code>: Sie müssen den <code>Punktraster-Layer</code> auswählen, auf den die Werte angewendet werden.</li></ul></div>
</div>

<div class="step">
  <div class="step-number">5</div>
  <div class="content">Wählen Sie die <code>Anzahl der Schritte</code> und die <code>Schrittgrößen</code>.</div>
</div>

</TabItem>

<TabItem value="car" label="Auto" className="tabItemBox">

**Berücksichtigt alle mit dem Auto befahrbaren Wege.** Dieser Routing-Modus berücksichtigt Geschwindigkeitsbegrenzungen und Einbahnstraßen bei der Erreichbarkeitsberechnung.

<div class="step">
  <div class="step-number">3</div>
  <div class="content">Wählen Sie, ob das Einzugsgebiet auf Basis von <code>Zeit</code> oder <code>Entfernung</code> berechnet werden soll, und setzen Sie das entsprechende Limit. Bei Wahl von <code>Zeit</code> können Sie auch die <code>Geschwindigkeit</code> konfigurieren.</div>
</div>

:::tip Hinweis

Geeignete Reisezeitlimits nach Einrichtungstyp finden Sie im [Standortwerkzeug](https://www.chemnitz.de/chemnitz/media/unsere-stadt/verkehr/verkehrsplanung/vep2040_standortwerkzeug.pdf) der Stadt Chemnitz.

:::

<div class="step">
  <div class="step-number">4</div>
  <div class="content">Wählen Sie die <code>Form des Einzugsgebiets</code>. Bei Wahl von: <ul><li><code>Polygon</code> oder <code>Netzwerk</code>: können Sie <code>Schritte</code> und <code>Schrittgrößen</code> festlegen.</li><li><code>Hexagonales Raster</code>: keine weitere Konfiguration erforderlich.</li><li><code>Punktraster</code>: Sie müssen den <code>Punktraster-Layer</code> auswählen, auf den die Werte angewendet werden.</li></ul></div>
</div>

<div class="step">
  <div class="step-number">5</div>
  <div class="content">Wählen Sie die <code>Anzahl der Schritte</code> und die <code>Schrittgrößen</code>.</div>
</div>

</TabItem>

<TabItem value="public transport" label="Öffentlicher Verkehr (ÖV)" className="tabItemBox">

**Berücksichtigt alle per öffentlichem Verkehr erreichbaren Orte, einschließlich intermodaler Umstiege und Haltestellen-Zugang.**

<div class="step">
  <div class="step-number">3</div>
  <div class="content">Wählen Sie die <code>Öffentlichen Verkehrsmittel</code> für die Analyse: Bus, Straßenbahn, Bahn, U-Bahn, Fähre, Seilbahn, Gondel und/oder Standseilbahn, und konfigurieren Sie das <code>Reisezeitlimit</code> in Minuten.</div>
</div>

:::tip Hinweis

Geeignete Reisezeitlimits nach Einrichtungstyp finden Sie im [Standortwerkzeug](https://www.chemnitz.de/chemnitz/media/unsere-stadt/verkehr/verkehrsplanung/vep2040_standortwerkzeug.pdf) der Stadt Chemnitz.

:::

<div class="step">
  <div class="step-number">4</div>
  <div class="content">Wählen Sie die <code>Form des Einzugsgebiets</code>. Bei Wahl von: <ul><li><code>Polygon</code> oder <code>Netzwerk</code>: können Sie <code>Schritte</code> und <code>Schrittgrößen</code> festlegen.</li><li><code>Hexagonales Raster</code>: keine weitere Konfiguration erforderlich.</li><li><code>Punktraster</code>: Sie müssen den <code>Punktraster-Layer</code> auswählen, auf den die Werte angewendet werden.</li></ul></div>
</div>

<div class="step">
  <div class="step-number">5</div>
  <div class="content">Wählen Sie <code>Tag</code>, <code>Startzeit</code> und <code>Endzeit</code> für das Analysezeitfenster.</div>
</div>

</TabItem>
</Tabs>

### Erweiterte Konfiguration

<Tabs>
<TabItem value="non-pt" label="Zu Fuß / Fahrrad / Pedelec / Auto" default className="tabItemBox">

<div class="step">
  <div class="step-number">6</div>
  <div class="content">Optional können Sie auf <code>Erweiterte Konfiguration</code> klicken, um den <code>Schrittstil</code> festzulegen.</div>
</div>

#### Schrittstil

Wählen Sie, wie die Isochronen-Schritte dargestellt werden:

- **Separat** — jeder Schritt zeigt nur das Gebiet, das *zwischen* diesem und dem vorherigen Schritt erreichbar ist. Zum Beispiel zeigt bei Schritten bei 5, 10 und 15 Minuten die 10-Minuten-Zone nur das Gebiet, das zwischen 5 und 10 Minuten erreichbar ist.
- **Kumulativ** — jeder Schritt zeigt das *gesamte bis zu diesem Reisekostenwert erreichbare Gebiet*. Zum Beispiel umfasst die 10-Minuten-Zone alles, was innerhalb von 10 Minuten erreichbar ist, einschließlich der 5-Minuten-Zone.

<p></p>

</TabItem>

<TabItem value="pt-advanced" label="Öffentlicher Verkehr (ÖV)" className="tabItemBox">

<div class="step">
  <div class="step-number">6</div>
  <div class="content">Optional können Sie auf <code>Erweiterte Konfiguration</code> klicken, um den <code>Schrittstil</code>, die <code>Maximalen Umstiege</code>, den <code>Zugangsmodus</code> und den <code>Abgangsmodus</code> zu konfigurieren.</div>
</div>

#### Schrittstil

Wählen Sie, wie die Isochronen-Schritte dargestellt werden:

- **Separat** — jeder Schritt zeigt nur das Gebiet, das *zwischen* diesem und dem vorherigen Schritt erreichbar ist.
- **Kumulativ** — jeder Schritt zeigt das *gesamte bis zu diesem Reisekostenwert erreichbare Gebiet*.

#### Maximale Umstiege

Legen Sie die `Maximalen Umstiege` fest, um die Anzahl der zulässigen ÖV-Verbindungen pro Fahrt zu begrenzen. Beispiel: Bei Wert `1` werden nur Fahrten mit maximal einem Umstieg berücksichtigt — Direktverbindungen und Fahrten mit einem Wechsel.

#### Zugangs- & Abgangsmodus

Konfigurieren Sie, wie Nutzer **zu** und **von** ÖV-Haltestellen gelangen:

- **Zugangsmodus** — Verkehrsmittel zur Haltestelle (Zu Fuß, Fahrrad, Auto).
- **Abgangsmodus** — Verkehrsmittel von der Haltestelle zum Ziel (Zu Fuß, Fahrrad, Auto).

Für jeden Modus können Sie die **maximale Reisezeit oder Entfernung** sowie die **Reisegeschwindigkeit** konfigurieren. Beispielsweise können Sie einen Radfahrer modellieren, der mit 15 km/h bis zu 10 Minuten zur Bahnstation fährt.

<p></p>

</TabItem>
</Tabs>

### Startpunkte

<div class="step">
  <div class="step-number">7</div>
  <div class="content">Wählen Sie die <code>Methode zur Startpunktauswahl</code>: Wählen Sie <code>Auf der Karte auswählen</code> und klicken Sie auf die Karte, um Startpunkte zu setzen, oder wählen Sie <code>Aus Layer auswählen</code> und wählen Sie einen Punktlayer mit den gewünschten Startpunkten. Alle Features des Layers werden als Startpunkte verwendet.</div>
</div>

### Szenario (Optional)

<div class="step">
  <div class="step-number">8</div>
  <div class="content">Optional können Sie den Bereich <code>Szenario</code> aufklappen und ein Szenario auswählen, um Netzwerkänderungen (z. B. neue Straßen oder Wege) in die Routingberechnung einzubeziehen.</div>
</div>

:::tip Hinweis

Szenarien ermöglichen es, Infrastrukturänderungen zu modellieren und deren Auswirkungen auf die Erreichbarkeit direkt zu sehen. Unter [Szenarien](../../Scenarios/Scenarios.md) erfahren Sie, wie Sie Szenarien erstellen und bearbeiten.

:::

<div class="step">
  <div class="step-number">9</div>
  <div class="content">Klicken Sie auf <code>Ausführen</code>, um die Berechnung zu starten.</div>
</div>

:::tip Hinweis

Die Berechnungszeit variiert je nach Einstellungen. Den Fortschritt können Sie in der [Statusleiste](../../workspace/home#status-bar) verfolgen.

:::

### Ergebnisse

Nach Abschluss der Berechnung werden die resultierenden Layer zur Karte hinzugefügt:

- **Einzugsgebiet** — die berechneten Isochronen in der gewählten Form (Polygon, Netzwerk, Hexagonales Raster oder Punktraster). Durch Klick auf ein Feature kann das Attribut **travel_cost** eingesehen werden, das die Reisezeit (Minuten) oder Entfernung (Meter) anzeigt.
- **Startpunkte** — ein Punktlayer mit den ausgewählten Startpositionen (wird nur erstellt, wenn Startpunkte auf der Karte gesetzt wurden, nicht bei Verwendung eines vorhandenen Layers).

Der Ergebnislayer wird automatisch mit einer Farbskala von der kürzesten bis zur längsten Reisekostenstufe eingefärbt.

## 4. Technische Details

**Einzugsgebiete sind Isolinien, die Punkte verbinden, die von einem Startpunkt aus innerhalb eines Zeitintervalls (*Isochronen*) oder einer Entfernung (*Isodistanzen*) erreichbar sind.** Die Berechnung nutzt das entsprechende Verkehrsnetz für den gewählten Routing-Modus.

### Grenzen für Startpunkte

| Routing-Modus | Maximale Startpunkte |
| --- | --- |
| Zu Fuß / Fahrrad / Pedelec | 1.000 |
| Auto | 50 |
| Öffentlicher Verkehr | 5 |

### Visualisierung

Die Einzugsgebietsform wird aus dem Routing-Raster mithilfe des [Marching-Squares-Konturlinienalgorithmus](https://en.wikipedia.org/wiki/Marching_squares) abgeleitet. Dieser wandelt das Routing-Raster von einem 2D-Array in glatte Polygonkonturen für die Visualisierung und räumliche Analyse um.

### Wissenschaftlicher Hintergrund

Einzugsgebiete sind *konturbasierte Maße* (auch *kumulierte Gelegenheiten*), die für ihre interpretierbaren Ergebnisse geschätzt werden ([Geurs und van Eck 2001](#5-quellen); [Albacete 2016](#5-quellen)). Sie unterscheiden nicht zwischen verschiedenen Reisezeiten innerhalb des Grenzwerts ([Bertolini, le Clercq und Kapoen 2005](#5-quellen)), anders als [heatmap-basierte Erreichbarkeitsindikatoren](./closest_average.md).

:::tip Hinweis

Weitere Einblicke in den Routing-Algorithmus finden Sie unter [Routing](../../category/routing).

:::

## 5. Quellen

Albacete, Xavier. 2016. "Evaluation and Improvements of Contour-Based Accessibility Measures." url: https://dspace.uef.fi/bitstream/handle/123456789/16857/urn_isbn_978-952-61-2103-1.pdf

Bertolini, Luca, F. le Clercq, and L. Kapoen. 2005. "Sustainable Accessibility: A Conceptual Framework to Integrate Transport and Land Use Plan-Making." Transport Policy 12 (3): 207–20. https://doi.org/10.1016/j.tranpol.2005.01.006

Geurs, Karst T., and Ritsema van Eck. 2001. "Accessibility Measures: Review and Applications." RIVM Report 408505 006. url: https://rivm.openrepository.com/handle/10029/259808

Matthew Wigginton Conway, Andrew Byrd, Marco Van Der Linden. "Evidence-Based Transit and Land Use Sketch Planning Using Interactive Accessibility Methods on Combined Schedule and Headway-Based Networks", 2017. url: https://journals.sagepub.com/doi/10.3141/2653-06
