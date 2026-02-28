---
sidebar_position: 6
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';
import MathJax from 'react-mathjax';

# Huff-Modell

Das Huff-Modell **prognostiziert die Wahrscheinlichkeit, mit der Konsumenten in einem Referenzgebiet bestimmte Standorte aufsuchen**, basierend auf der Attraktivität der Standorte und der Entfernung zu diesen, unter Berücksichtigung der Konkurrenz zwischen den Zielen. Das Huff-Modell konzentriert sich auf **wettbewerbsfähige Marktanteile**.

<!-- TODO: Add YouTube video embed when available
<div style={{ display: 'flex', justifyContent: 'center' }}>
<iframe width="674" height="378" src="VIDEO_URL" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>
</div>
-->

## 1. Erklärung

Das Huff-Modell ist ein **räumliches Interaktionsmodell, das schätzt, wie sich die Nachfrage (z. B. Kunden, Bewohner) auf konkurrierende Angebotsstandorte (z. B. Geschäfte, Einrichtungen) verteilt**.
Das Modell funktioniert nach einem einfachen Prinzip: **Die Wahrscheinlichkeit, dass ein Standort gewählt wird, hängt von seiner Attraktivität im Verhältnis zu allen konkurrierenden Standorten ab, gewichtet nach der Reisezeit**. Ein großes, nahe gelegenes Einkaufszentrum wird mehr Nachfrage auf sich ziehen als ein kleines, weit entferntes – aber die genaue Aufteilung hängt vom Gleichgewicht zwischen Attraktivität und Entfernung aller verfügbaren Optionen ab.

Das Ergebnis ist ein **Wahrscheinlichkeitswert für jeden Angebotsstandort**, der den Anteil der Gesamtnachfrage darstellt, den er aus dem Referenzgebiet auf sich zieht. Dies ermöglicht einen direkten Vergleich, wie gut verschiedene Einrichtungen um denselben Kundenstamm konkurrieren.

Sie können den Routing-Modus, die Ziele-Layer (mit Kapazitätsfeldern), den Bedarfs-Layer (mit Bevölkerungsfeld), das Referenzgebiet und Reisezeitlimits konfigurieren und Ihr Modell kalibrieren.

- **Referenzgebiet** — Ein Polygon, das das Untersuchungsgebiet definiert. Nur Nachfrage und Ziele innerhalb dieses Gebiets werden berücksichtigt.

- Die **Ziele-Layer enthalten Einrichtungsdaten** mit einem Attraktivitätsattribut (z. B. Anzahl der Krankenhausbetten, Quadratmeter Verkaufsfläche, Schulplätze).

- Der **Bedarfs-Layer enthält Bevölkerungs- oder Nutzerdaten** (z. B. Einwohnerzahl, potenzielle Kunden), die die Nachfrage nach den Einrichtungen darstellen.


**Wesentlicher Unterschied:** Im Gegensatz zu Heatmaps, die die Erreichbarkeit pro Rasterzelle visualisieren, erzeugt das *Huff-Modell* eine **Wahrscheinlichkeit pro Angebotsstandort** – und zeigt, welchen Anteil der Gesamtnachfrage jede Einrichtung erfasst.

import MapViewer from '@site/src/components/MapViewer';

:::info 

Das Huff-Modell ist in bestimmten Regionen verfügbar. Bei Auswahl eines `Routing-Modus` wird ein **Geofence** auf der Karte angezeigt, um die unterstützten Regionen hervorzuheben.

<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
  <MapViewer
      geojsonUrls={[
        "https://assets.plan4better.de/other/geofence/geofence_heatmap.geojson"
      ]}
      styleOptions={{
        fillColor: "#808080",
        outlineColor: "#808080",
        fillOpacity: 0.8
      }}
      legendItems={[
        { label: "Abdeckung für Huff-Modell", color: "#ffffff" }
      ]}
  />
</div> 

Wenn Sie Analysen über diesen Geofence hinaus durchführen möchten, können Sie uns gerne [kontaktieren](https://plan4better.de/kontakt/ "Kontaktieren Sie uns"). Wir besprechen gerne weitere Optionen.

:::

## 2. Anwendungsfälle

- Welchen Marktanteil erfasst jeder Supermarkt aus den umliegenden Wohngebieten?

- Wo sollte ein neues Einzelhandelsgeschäft eröffnet werden, um die Kundenreichweite unter Berücksichtigung bestehender Wettbewerber zu maximieren?

- Wie würde sich das Hinzufügen einer neuen Schule auf die Verteilung der Anmeldungen auf bestehende Schulen auswirken?

- Welchen Anteil der Nachfrage deckt jede öffentliche Bibliothek aus den umliegenden Stadtvierteln ab?

## 3. Vorgehensweise

<div class="step">
  <div class="step-number">1</div>
  <div class="content">Klicken Sie auf <code>Werkzeuge</code> <img src={require('/img/icons/toolbox.png').default} alt="Optionen" style={{ maxHeight: "20px", maxWidth: "20px", objectFit: "cover"}}/>. </div>
</div>

<div class="step">
  <div class="step-number">2</div>
  <div class="content">Klicken Sie im Menü <code>Erreichbarkeitsindikatoren</code> auf <code>Huff-Modell</code>.</div>
</div>

### Routing

<div class="step">
  <div class="step-number">3</div>
  <div class="content">Wählen Sie den <code>Routing-Modus</code>, den Sie für die Analyse verwenden möchten.</div>
</div>

<Tabs>

<TabItem value="walk" label="Zu Fuß" default className="tabItemBox">

**Berücksichtigt alle zu Fuß erreichbaren Wege**. Es wird eine Gehgeschwindigkeit von 5 km/h angenommen.

</TabItem>
  
<TabItem value="cycling" label="Fahrrad" className="tabItemBox">

**Berücksichtigt alle mit dem Fahrrad befahrbaren Wege**. Dieser Routing-Modus berücksichtigt bei der Berechnung der Erreichbarkeit die Oberfläche, Ebenheit und Steigung von Straßen. Es wird eine Fahrradgeschwindigkeit von 15 km/h angenommen.

</TabItem>

<TabItem value="pedelec" label="Pedelec" className="tabItemBox">

**Berücksichtigt alle mit dem Pedelec befahrbaren Wege**. Dieser Routing-Modus berücksichtigt bei der Berechnung der Erreichbarkeit die Oberfläche und Ebenheit von Straßen. Es wird eine Pedelec-Geschwindigkeit von 23 km/h angenommen.

</TabItem>

<TabItem value="car" label="Auto" className="tabItemBox">

**Berücksichtigt alle mit dem Auto befahrbaren Wege**. Dieser Routing-Modus berücksichtigt bei der Berechnung der Erreichbarkeit Geschwindigkeitsbegrenzungen und Einbahnstraßenbeschränkungen.

</TabItem>

</Tabs>

### Konfiguration

<div class="step">
  <div class="step-number">4</div>
  <div class="content">Wählen Sie Ihr <code>Referenzgebiet</code> – einen Polygon-Layer, der die Grenze des Untersuchungsgebiets definiert. Nur Nachfrage und Ziele innerhalb dieses Gebiets werden in die Analyse einbezogen.</div>
</div>

<div class="step">
  <div class="step-number">5</div>
  <div class="content">Legen Sie das <code>Reisezeitlimit</code> fest, das die maximale Reisezeit in Minuten definiert. Einrichtungen außerhalb dieses Limits werden nicht berücksichtigt.</div>
</div>

:::tip Hinweis

Benötigen Sie Hilfe bei der Auswahl einer geeigneten Reisezeitgrenze für verschiedene allgemeine Einrichtungen? Das ["Standort-Werkzeug"](https://www.chemnitz.de/chemnitz/media/unsere-stadt/verkehr/verkehrsplanung/vep2040_standortwerkzeug.pdf) der Stadt Chemnitz kann hilfreiche Orientierung bieten.

:::

### Bedarf

<div class="step">
  <div class="step-number">6</div>
  <div class="content">Wählen Sie Ihren <code>Bedarfs-Layer</code> aus dem Dropdown-Menü. Dieser Layer sollte Bevölkerungs- oder Verbraucherdaten enthalten (z. B. Zensusdaten mit Einwohnerzahlen, Kundenstandorte).</div>
</div>

<div class="step">
  <div class="step-number">7</div>
  <div class="content">Wählen Sie das <code>Nachfragefeld</code> – ein numerisches Feld aus Ihrem Bedarfs-Layer, das die Anzahl potenzieller Verbraucher darstellt (z. B. Bevölkerung, Anzahl der Haushalte).</div>
</div>

### Ziele

<div class="step">
  <div class="step-number">8</div>
  <div class="content">Wählen Sie Ihren <code>Ziele-Layer</code> aus dem Dropdown-Menü. Dieser Layer sollte Standorte von Einrichtungen oder Geschäften enthalten, die um die Nachfrage konkurrieren.</div>
</div>

<div class="step">
  <div class="step-number">9</div>
  <div class="content">Wählen Sie das <code>Attraktivitätsfeld</code> – ein numerisches Feld, das die Attraktivität jeder Einrichtung darstellt (z. B. Verkaufsfläche in m², Anzahl der Produkte, Qualitätsbewertung).</div>
</div>

### Erweiterte Konfiguration

<div class="step">
  <div class="step-number">10</div>
  <div class="content">Passen Sie optional den <code>Attraktivitätsparameter</code> (Standard: 1,0) an, um zu steuern, wie stark die Attraktivität die Wahrscheinlichkeit beeinflusst. Höhere Werte verstärken die Unterschiede zwischen den Einrichtungen.</div>
</div>

<div class="step">
  <div class="step-number">11</div>
  <div class="content">Passen Sie optional den Parameter <code>Distanzabfall</code> (Standard: 2,0) an, um zu steuern, wie stark die Reisezeit die Attraktivität einer Einrichtung verringert. Höhere Werte bedeuten, dass Menschen weniger bereit sind, weit zu reisen.</div>
</div>

:::info Modellkalibrierung

Für realistische Ergebnisse sollten die Parameter des Huff-Modells **unter Verwendung beobachteter Marktanteils- oder Nutzerwahldaten kalibriert werden**. Die Standardparameter spiegeln möglicherweise nicht das tatsächliche Kundenverhalten in Ihrem Untersuchungsgebiet wider.
Idealerweise sammeln Sie Daten zu tatsächlichen Kundenbesuchen oder Marktanteilen, um optimale Parameter zu schätzen.

**Hinweis:** Eine automatische Parameterkalibrierung ist derzeit in GOAT nicht verfügbar. Sie können die Parameter manuell anpassen.

:::

<div class="step">
  <div class="step-number">12</div>
  <div class="content">Klicken Sie auf <code>Ausführen</code>, um die Berechnung zu starten.</div>
</div>

### Ergebnisse

Sobald die Berechnung abgeschlossen ist, wird ein Ergebnis-Layer zur Karte hinzugefügt. Jedes Feature im Ergebnis-Layer stellt einen **Angebotsstandort** mit seiner berechneten Huff-Wahrscheinlichkeit dar.

- **Höhere Wahrscheinlichkeitswerte** zeigen an, dass eine Einrichtung einen größeren Anteil der Gesamtnachfrage erfasst – sie ist im Vergleich zu Alternativen wettbewerbsfähiger.
- **Niedrigere Wahrscheinlichkeitswerte** zeigen an, dass eine Einrichtung weniger Nachfrage erfasst, entweder weil sie weniger attraktiv ist, weiter entfernt liegt oder starker Konkurrenz durch nahegelegene Alternativen ausgesetzt ist.

<div style={{ display: 'flex', justifyContent: 'center' }}>
<img src={require('/img/toolbox/accessibility_indicators/heatmaps/huff_model/huff_model.png').default} alt="Huff-model Heatmap Ergebnis in GOAT" style={{ maxHeight: "auto", maxWidth: "80%"}}/>
</div>
<p></p>

:::tip Tipp

Möchten Sie visuell ansprechende Karten erstellen, die eine klare Geschichte erzählen? Erfahren Sie, wie Sie Farben, Legenden und Stile in unserem Abschnitt [Styling](../../map/layer_style/style/styling) anpassen können.

:::

## 4. Technische Details

### Berechnung

Das Huff-Modell berechnet die Wahrscheinlichkeit, dass die Nachfrage von Standort *i* zum Angebotsstandort *j* fließt:

<MathJax.Provider>
  <div style={{ marginTop: '20px', fontSize: '24px' }}>
    <MathJax.Node formula={"P_{ij} = \\frac{A_j^{\\alpha} \\cdot d_{ij}^{-\\beta}}{\\sum_{k=1}^{n} A_k^{\\alpha} \\cdot d_{ik}^{-\\beta}}"} />
  </div>
</MathJax.Provider>

Wobei:
- *P<sub>ij</sub>* = Wahrscheinlichkeit, dass die Nachfrage am Standort *i* den Angebotsstandort *j* aufsucht
- *A<sub>j</sub>* = Attraktivität des Angebotsstandorts *j*
- *d<sub>ij</sub>* = Reisezeit vom Bedarfsstandort *i* zum Angebotsstandort *j*
- *α* = Attraktivitätsparameter (Standard: 1,0)
- *β* = Distanzabfallparameter (Standard: 2,0)
- *n* = Anzahl der von *i* aus erreichbaren Angebotsstandorte

Die **erfasste Nachfrage** für jeden Angebotsstandort wird dann berechnet, indem die Wahrscheinlichkeit mit dem Nachfragewert an jedem Ursprung multipliziert und über alle Ursprünge summiert wird:

<MathJax.Provider>
  <div style={{ marginTop: '20px', fontSize: '24px' }}>
    <MathJax.Node formula={"C_j = \\sum_{i=1}^{m} P_{ij} \\cdot D_i"} />
  </div>
</MathJax.Provider>

Wobei:
- *C<sub>j</sub>* = gesamte erfasste Nachfrage am Angebotsstandort *j*
- *D<sub>i</sub>* = Nachfrage (Bevölkerung) am Standort *i*
- *m* = Anzahl der Bedarfsstandorte

Die finale **Huff-Wahrscheinlichkeit**, die pro Angebotsstandort angegeben wird, ist der Anteil der Gesamtnachfrage, den er erfasst:

<MathJax.Provider>
  <div style={{ marginTop: '20px', fontSize: '24px' }}>
    <MathJax.Node formula={"H_j = \\frac{C_j}{\\sum_{i=1}^{m} D_i}"} />
  </div>
</MathJax.Provider>


## 5. Referenzen

Huff, D. L. (1963). A Probabilistic Analysis of Shopping Center Trade Areas. *Land Economics*, 39(1), 81–90.
