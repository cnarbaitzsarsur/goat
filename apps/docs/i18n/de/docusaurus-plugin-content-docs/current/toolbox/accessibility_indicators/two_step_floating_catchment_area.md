---
sidebar_position: 5
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';
import MathJax from 'react-mathjax';

# Heatmap - 2SFCA

Die Heatmap 2SFCA (Two-Step Floating Catchment Area)-Methode **visualisiert räumliche Erreichbarkeit durch eine farbcodierte Karte, die Angebotskapazität und Nachfrage in einem Maß vereint**.

<!-- TODO: Add YouTube video embed when available
<div style={{ display: 'flex', justifyContent: 'center' }}>
<iframe width="674" height="378" src="VIDEO_URL" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>
</div>
-->

## 1. Erklärung

Die 2SFCA-Methode misst die **räumliche Erreichbarkeit unter Berücksichtigung von Angebot (Kapazität der Einrichtungen) und Nachfrage (Bevölkerung)**. Im Gegensatz zu einfachen Angebot-Nachfrage-Verhältnissen pro Verwaltungseinheit berücksichtigt 2SFCA grenzüberschreitende Zugänge – Menschen können Einrichtungen in benachbarten Gebieten erreichen, und Einrichtungen versorgen Bevölkerungsgruppen über ihren eigenen Bezirk hinaus.
Das Ergebnis ist ein **Verhältnis von Angebot zu Nachfrage auf der Ebene hexagonaler Rasterzellen**. Das Werkzeug arbeitet in zwei Schritten:

1. **Schritt 1 — Kapazitäts-Nachfrage-Verhältnisse:** Für jeden Standort einer Einrichtung wird berechnet, wie viel Kapazität im Verhältnis zur Gesamtnachfrage (Bevölkerung) in ihrem Einzugsgebiet verfügbar ist. Dies ergibt ein Angebot-Nachfrage-Verhältnis pro Einrichtung.

2. **Schritt 2 — Kumulative Erreichbarkeit:** Für jede Rasterzelle werden die Kapazitätsverhältnisse aller erreichbaren Einrichtungen summiert. Das Ergebnis zeigt, wie gut jeder Standort versorgt ist.

Sie können den **Routing-Modus**, **Ziele-Layer** (mit Kapazitätsfeld), **Bedarfs-Layer** (mit Bevölkerungsfeld), **Reisezeitlimits** konfigurieren und zwischen drei **2SFCA-Varianten** wählen.
- Die **Ziele-Layer enthalten Einrichtungsdaten** mit einem Kapazitätsattribut (z. B. Anzahl der Krankenhausbetten, Quadratmeter Verkaufsfläche, Schulplätze).

- Der **Bedarfs-Layer enthält Bevölkerungs- oder Nutzerdaten** (z. B. Einwohnerzahl, potenzielle Kunden), die die Nachfrage nach den Einrichtungen darstellen.

- Der **2SFCA-Typ** steuert, wie die Distanzgewichtung angewendet wird:
  - **Standard 2SFCA** verwendet binäre Einzugsgebiete (drinnen oder draußen) – alle Standorte innerhalb des Reisezeitlimits werden gleich gewichtet, unabhängig von ihrer tatsächlichen Entfernung zu den Einrichtungen. Dies liefert klare, einfache Angebot-Nachfrage-Verhältnisse.
  - **Enhanced 2SFCA (E2SFCA)** gewichtet mittels einer Impedanzfunktion in beiden Berechnungsschritten, wodurch ein realistischer Distanzabfall entsteht, bei dem näher gelegene Einrichtungen stärker zur Erreichbarkeit beitragen als entfernte.
  - **Modified 2SFCA (M2SFCA)** verwendet quadrierte Impedanzgewichte im zweiten Schritt, was eine noch stärkere Bevorzugung von Nähe erzeugt. Diese Variante betont stark nahegelegene Einrichtungen, berücksichtigt aber immer noch entfernte Optionen, was ideal ist, wenn Reisekomfort entscheidend ist.

**Wesentlicher Unterschied:** Im Gegensatz zur *Gravitationsbasierten Heatmap*, die die allgemeine Erreichbarkeit von Zielen misst, modelliert die *2SFCA Heatmap* explizit das **Gleichgewicht von Angebot und Nachfrage** – und zeigt, wo die Kapazität im Verhältnis zur bedürftigen Bevölkerung ausreichend oder unzureichend ist.

import MapViewer from '@site/src/components/MapViewer';

:::info 

Heatmaps sind in bestimmten Regionen verfügbar. Bei Auswahl eines `Routing-Modus` wird ein **Geofence** auf der Karte angezeigt, um die unterstützten Regionen hervorzuheben.

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
        { label: "Abdeckung für 2SFCA Heatmaps", color: "#ffffff" }
      ]}
  />
</div> 

Wenn Sie Analysen über diesen Geofence hinaus durchführen möchten, können Sie uns gerne [kontaktieren](https://plan4better.de/kontakt/ "Kontaktieren Sie uns"). Wir besprechen gerne weitere Optionen.

:::

## 2. Anwendungsfälle

- Welche Stadtteile sind in Bezug auf Kinderbetreuungseinrichtungen im Verhältnis zur bedürftigen Bevölkerung unterversorgt?

- Wo sollten neue Kitas gebaut werden, um Lücken im Gleichgewicht von Angebot und Nachfrage am besten zu schließen?

- Gibt es Gebiete, in denen die Schulkapazität angesichts der Anzahl schulpflichtiger Kinder im Einzugsgebiet unzureichend ist?

## 3. Vorgehensweise

<div class="step">
  <div class="step-number">1</div>
  <div class="content">Klicken Sie auf <code>Werkzeuge</code> <img src={require('/img/icons/toolbox.png').default} alt="Optionen" style={{ maxHeight: "20px", maxWidth: "20px", objectFit: "cover"}}/>. </div>
</div>

<div class="step">
  <div class="step-number">2</div>
  <div class="content">Klicken Sie im Menü <code>Erreichbarkeitsindikatoren</code> auf <code>Heatmap 2SFCA</code>.</div>
</div>

### Routing

<div class="step">
  <div class="step-number">3</div>
  <div class="content">Wählen Sie den <code>Routing-Modus</code>, den Sie für die Heatmap verwenden möchten.</div>
</div>

<Tabs>

<TabItem value="walk" label="Zu Fuß" default className="tabItemBox">

**Berücksichtigt alle zu Fuß erreichbaren Wege**. Für Heatmaps wird eine Gehgeschwindigkeit von 5 km/h angenommen.

</TabItem>
  
<TabItem value="cycling" label="Fahrrad" className="tabItemBox">

**Berücksichtigt alle mit dem Fahrrad befahrbaren Wege**. Dieser Routing-Modus berücksichtigt bei der Berechnung der Erreichbarkeit die Oberfläche, Ebenheit und Steigung von Straßen. Für Heatmaps wird eine Fahrradgeschwindigkeit von 15 km/h angenommen.

</TabItem>

<TabItem value="pedelec" label="Pedelec" className="tabItemBox">

**Berücksichtigt alle mit dem Pedelec befahrbaren Wege**. Dieser Routing-Modus berücksichtigt bei der Berechnung der Erreichbarkeit die Oberfläche und Ebenheit von Straßen. Für Heatmaps wird eine Pedelec-Geschwindigkeit von 23 km/h angenommen.

</TabItem>

<TabItem value="car" label="Auto" className="tabItemBox">

**Berücksichtigt alle mit dem Auto befahrbaren Wege**. Dieser Routing-Modus berücksichtigt bei der Berechnung der Erreichbarkeit Geschwindigkeitsbegrenzungen und Einbahnstraßenbeschränkungen.

</TabItem>

</Tabs>

### Konfiguration

<div class="step">
  <div class="step-number">4</div>
  <div class="content">Wählen Sie den <code>2SFCA-Typ</code>, den Sie verwenden möchten.</div>
</div>

<Tabs>

<TabItem value="twosfca" label="Standard 2SFCA" default className="tabItemBox">

Die Standard 2SFCA-Methode verwendet **binäre Einzugsgebiete**: Eine Einrichtung versorgt einen Bevölkerungsstandort entweder (wenn innerhalb des Reisezeitlimits) oder nicht. Es gibt keine Distanzgewichtung – alle Standorte innerhalb des Einzugsgebiets werden gleich behandelt.

Dies ist die einfachste Variante und eignet sich gut, wenn Sie ein direktes Angebot-Nachfrage-Verhältnis wünschen.

</TabItem>

<TabItem value="e2sfca" label="Enhanced 2SFCA (E2SFCA)" className="tabItemBox">

Die Enhanced 2SFCA-Methode fügt eine **Reisewiderstandsgewichtung** unter Verwendung einer Impedanzfunktion hinzu. In beiden Schritten werden Interaktionen danach gewichtet, wie weit Einrichtung und Bevölkerung voneinander entfernt sind – nähere Standorte erhalten ein höheres Gewicht. Dies führt zu realistischeren Ergebnissen und spiegelt wider, dass Menschen eher nahegelegene Einrichtungen nutzen.

Erfordert die Auswahl einer **Impedanzfunktion** und eines **Sensitivitätswertes**.

</TabItem>

<TabItem value="m2sfca" label="Modified 2SFCA (M2SFCA)" className="tabItemBox">

Die Modified 2SFCA-Methode wendet **quadrierte Impedanzgewichte** an, was einen noch stärkeren Distanzabfalleffekt erzeugt. Während Enhanced 2SFCA die Nähe mit einem relativen Gewichtungsansatz berücksichtigt, bezieht Modified 2SFCA durch Quadrieren der Impedanzgewichte auch die absolute Distanzwirkung mit ein.

Erfordert die Auswahl einer **Impedanzfunktion** und eines **Sensitivitätswertes**.

</TabItem>

</Tabs>

<div class="step">
  <div class="step-number">5</div>
  <div class="content">Wenn Sie <b>E2SFCA</b> oder <b>M2SFCA</b> verwenden, wählen Sie die <code>Impedanzfunktion</code> für die Distanzgewichtung.</div>
</div>

<Tabs>

<TabItem value="gaussian" label="Gauß" default className="tabItemBox">

Berechnet Distanzgewichte unter Verwendung einer Gaußschen (glockenförmigen) Kurve. Die Erreichbarkeit nimmt für kurze Reisezeiten langsam ab und fällt jenseits eines bestimmten Schwellenwerts schnell ab. Dies ist die am häufigsten verwendete Impedanzfunktion. Details siehe [Technische Details](#calculation).

</TabItem>

<TabItem value="linear" label="Linear" className="tabItemBox">

Behält eine direkte lineare Beziehung zwischen Reisezeit und Gewicht bei. Das Gewicht nimmt gleichmäßig von 1 (am Ursprung) bis 0 (bei maximaler Reisezeit) ab. Details siehe [Technische Details](#calculation).

</TabItem>

<TabItem value="exponential" label="Exponentiell" className="tabItemBox">

Berechnet Gewichte unter Verwendung einer exponentiellen Abklingkurve, gesteuert durch den Sensitivitätsparameter. Höhere Sensitivitätswerte erzeugen ein langsameres Abklingen. Details siehe [Technische Details](#calculation).

</TabItem>

<TabItem value="power" label="Potenz" className="tabItemBox">

Berechnet Gewichte unter Verwendung einer Potenzfunktion. Der Sensitivitätsparameter steuert den Exponenten und bestimmt, wie schnell die Gewichte mit der Reisezeit abnehmen. Details siehe [Technische Details](#calculation).

</TabItem>

</Tabs>

### Bedarf

<div class="step">
  <div class="step-number">6</div>
  <div class="content">Wählen Sie Ihren <code>Bedarfs-Layer</code> aus dem Dropdown-Menü. Dieser Layer sollte Bevölkerungs- oder Nutzerdaten enthalten (z. B. Zensusdaten mit Einwohnerzahlen).</div>
</div>

<div class="step">
  <div class="step-number">7</div>
  <div class="content">Wählen Sie das <code>Nachfragefeld</code> – ein numerisches Feld aus Ihrem Bedarfs-Layer, das die Anzahl potenzieller Nutzer darstellt (z. B. Bevölkerung, Anzahl der Haushalte).</div>
</div>

### Ziele

<div class="step">
  <div class="step-number">8</div>
  <div class="content">Wählen Sie Ihren <code>Ziele-Layer</code> aus dem Dropdown-Menü. Dieser Layer sollte Standorte von Einrichtungen enthalten (z. B. Krankenhäuser, Schulen, Geschäfte).</div>
</div>

<div class="step">
  <div class="step-number">9</div>
  <div class="content">Wählen Sie das <code>Kapazitätsfeld</code> – ein numerisches Feld, das die Angebotskapazität jeder Einrichtung darstellt (z. B. Anzahl der Betten, Sitze oder Quadratmeter).</div>
</div>

<div class="step">
  <div class="step-number">10</div>
  <div class="content">Legen Sie das <code>Reisezeitlimit</code> fest, das das maximale Einzugsgebiet in Minuten definiert.</div>
</div>

:::tip Hinweis

Benötigen Sie Hilfe bei der Auswahl einer geeigneten Reisezeitgrenze für verschiedene allgemeine Einrichtungen? Das ["Standort-Werkzeug"](https://www.chemnitz.de/chemnitz/media/unsere-stadt/verkehr/verkehrsplanung/vep2040_standortwerkzeug.pdf) der Stadt Chemnitz kann hilfreiche Orientierung bieten.

:::

<div class="step">
  <div class="step-number">11</div>
  <div class="content">Wenn Sie <b>E2SFCA</b> oder <b>M2SFCA</b> verwenden, geben Sie einen <code>Sensitivitätswert</code> an, um zu steuern, wie schnell die Impedanzfunktion mit der Entfernung abfällt.</div>
</div>

<div class="step">
  <div class="step-number">12</div>
  <div class="content">Optional können Sie weitere Ziele-Layer hinzufügen, indem Sie auf <code>+ Ziele hinzufügen</code> klicken. Mehrere Einrichtungstypen können in einer einzigen Analyse kombiniert werden.</div>
</div>

<div class="step">
  <div class="step-number">13</div>
  <div class="content">Klicken Sie auf <code>Ausführen</code>, um die Berechnung zu starten.</div>
</div>

### Ergebnisse

Sobald die Berechnung abgeschlossen ist, wird ein Ergebnis-Layer zur Karte hinzugefügt. Dieser *Heatmap 2SFCA*-Layer enthält ein farbcodiertes hexagonales Raster, wobei jede Zelle den berechneten Erreichbarkeitswert anzeigt – das Verhältnis von Angebot zu Nachfrage an diesem Standort.

- **Höhere Werte** weisen auf eine bessere Erreichbarkeit hin: Im Verhältnis zur lokalen Nachfrage ist mehr Angebotskapazität verfügbar.
- **Niedrigere Werte** weisen auf unterversorgte Gebiete hin: Die Bevölkerung übersteigt die verfügbare Kapazität der erreichbaren Einrichtungen.

Durch Klicken auf eine hexagonale Zelle wird deren berechneter Erreichbarkeitswert angezeigt.

<!--
<div style={{ display: 'flex', justifyContent: 'center' }}>
<img src={require('/img/toolbox/accessibility_indicators/heatmaps/two_step_floating_catchment_area/2sfca.gif').default} alt="Heatmap 2SFCA Ergebnis in GOAT" style={{ maxHeight: "auto", maxWidth: "80%"}}/>
</div>
<p></p>
-->

:::tip Tipp

Möchten Sie visuell ansprechende Karten erstellen, die eine klare Geschichte erzählen? Erfahren Sie, wie Sie Farben, Legenden und Stile in unserem Abschnitt [Styling](../../map/layer_style/style/styling) anpassen können.

:::


### Berechnungsbeispiel

Das folgende Beispiel veranschaulicht, wie die 2SFCA-Methode für jeden Schritt funktioniert.

- **Schritt 1** berechnet ein Kapazitätsverhältnis für jedes Ziel: `R_j = S_j / Σ D_k` – die Kapazität des Ziels geteilt durch die Gesamtbevölkerung in seinem Einzugsgebiet. Ein Ziel mit 100 Betten, das 100 Personen versorgt, hat ein Verhältnis von 1.

<div style={{ display: 'flex', justifyContent: 'center' }}>
<img src={require('/img/toolbox/accessibility_indicators/heatmaps/two_step_floating_catchment_area/step1_2sfca.png').default} alt="Heatmap 2SFCA Result in GOAT" style={{ maxHeight: "auto", maxWidth: "80%"}}/>
</div>
<p></p>

- **Schritt 2** summiert die Verhältnisse aller Ziele, die von jeder Zelle aus erreichbar sind. Eine Zelle, die zwei Ziele erreichen kann (Verhältnisse 1 und 0,4), erhält eine Erreichbarkeit von 1,4.

<div style={{ display: 'flex', justifyContent: 'center' }}>
<img src={require('/img/toolbox/accessibility_indicators/heatmaps/two_step_floating_catchment_area/step2_2sfca.png').default} alt="Heatmap 2SFCA Result in GOAT" style={{ maxHeight: "auto", maxWidth: "80%"}}/>
</div>
<p></p>


## 4. Technische Details

### Berechnung

Die 2SFCA-Methode berechnet die Erreichbarkeit in zwei Schritten:

#### Schritt 1 — Kapazitäts-Nachfrage-Verhältnis

Für jeden Einrichtungsstandort *j* wird das Verhältnis seiner Kapazität zur Gesamtnachfrage in seinem Einzugsgebiet berechnet:

<MathJax.Provider>
  <div style={{ marginTop: '20px', fontSize: '24px' }}>
    <MathJax.Node formula={"R_j = \\frac{S_j}{\\sum_{k \\in \\{d_{kj} \\leq d_0\\}} D_k \\cdot f(d_{kj})}"} />
  </div>
</MathJax.Provider>

Wobei:
- *R<sub>j</sub>* = Kapazitäts-Nachfrage-Verhältnis der Einrichtung *j*
- *S<sub>j</sub>* = Kapazität (Angebot) der Einrichtung *j*
- *D<sub>k</sub>* = Nachfrage (Bevölkerung) am Standort *k*
- *d<sub>kj</sub>* = Reisezeit vom Standort *k* zur Einrichtung *j*
- *d<sub>0</sub>* = Reisezeitlimit (maximales Einzugsgebiet)
- *f(d<sub>kj</sub>)* = Impedanzfunktion (Distanzgewicht)

#### Schritt 2 — Kumulative Erreichbarkeit

Für jede Rasterzelle *i* werden die Kapazitäts-Nachfrage-Verhältnisse aller erreichbaren Einrichtungen summiert:

<MathJax.Provider>
  <div style={{ marginTop: '20px', fontSize: '24px' }}>
    <MathJax.Node formula={"A_i = \\sum_{j \\in \\{d_{ij} \\leq d_0\\}} R_j \\cdot f(d_{ij})"} />
  </div>
</MathJax.Provider>

Wobei:
- *A<sub>i</sub>* = Erreichbarkeit am Standort *i*
- *R<sub>j</sub>* = Kapazitäts-Nachfrage-Verhältnis der Einrichtung *j* (aus Schritt 1)
- *f(d<sub>ij</sub>)* = Gewicht der Impedanzfunktion

### Vergleich der Varianten

Die verschiedenen Berechnungsmethoden verändern, wie Distanz wahrgenommen und gemessen wird, wie in den Beispielen unten dargestellt. Jedes Szenario zeigt eine Einrichtung mit **100 Kapazitätseinheiten** (angezeigt durch die zentrale Standortmarkierung), die Rasterzellen mit jeweils **50 Nachfrageeinheiten** versorgt. Wir nehmen eine **maximale Reisezeit von 5 Minuten** an, wobei kleine Pfeile **1 Minute Reisezeit** und große Pfeile **2 Minuten Reisezeit** darstellen. Für die Enhanced- und Modified-Varianten wird eine **lineare Impedanzfunktion** ($f(d) = 1 - d/5$) verwendet.

<div style={{ display: 'flex', justifyContent: 'center' }}>
<img src={require('/img/toolbox/accessibility_indicators/heatmaps/two_step_floating_catchment_area/2sfca_variants_comparaison.png').default} alt="Vergleich von 2SFCA-Varianten, der Effekte der Distanzgewichtung zeigt" style={{ maxHeight: "auto", maxWidth: "80%"}}/>
</div>

- Die **Standard 2SFCA** behandelt alle Standorte innerhalb des Einzugsgebiets **gleich**, unabhängig von der Distanz. Ob eine Bevölkerungszelle 1 Minute oder 2 Minuten von der Einrichtung entfernt ist, sie erhält in allen Konfigurationen denselben Wert von 1.

- Die **Enhanced 2SFCA** führt eine **Reisewiderstandsgewichtung** ein, die eine Differenzierung der Erreichbarkeit basierend auf der Distanz erzeugt, mit einer **höheren Erreichbarkeit** (Wert von 1,1) für nähere Zellen. Zellen, die gleich weit von Einrichtungen entfernt sind, erhalten jedoch unabhängig von der absoluten Distanz dieselbe Erreichbarkeit (z. B. erhalten zwei Zellen, die beide 1 Minute entfernt sind, oder beide 2 Minuten entfernt sind, alle **1**).

- Die **Modified 2SFCA** wendet in Schritt 2 **quadrierte Impedanzgewichte** an, was stärkere Distanzstrafen mit Werten wie **0,9** und **0,5** erzeugt (verglichen mit 1,1 und 0,9 bei E2SFCA für ähnliche Positionen). Sie berücksichtigt im Gegensatz zu E2SFCA die absolute Distanz – zum Beispiel erhalten zwei Zellen, die beide 2 Minuten entfernt sind, eine geringere Erreichbarkeit (**0,6**) als zwei Zellen, die beide 1 Minute entfernt sind (**0,8**).

**Die Wahl der geeigneten Variante** hängt von Ihren spezifischen Analysezielen ab und davon, wie empfindlich Ihre Zielbevölkerung auf Reisedistanzen reagiert.


**GOAT verwendet die folgenden Impedanzfunktionen für die Enhanced und Modified 2SFCA-Varianten:**


*Modified Gaussian, (Kwan,1998):*

<MathJax.Provider>
  <div style={{ marginTop: '20px', fontSize: '24px'  }}>
    <MathJax.Node formula={"f(t_{ij})=\\exp{(-t_{ij}^2/\\beta)}"} />
  </div>
</MathJax.Provider>

:::tip Pro-Tipp

Wie Studien gezeigt haben, ist der Zusammenhang zwischen Reisezeit und Erreichbarkeit oft nicht-linear. Das bedeutet, dass Menschen bereit sein können, eine kurze Strecke zurückzulegen, um eine Einrichtung zu erreichen, aber wenn die Entfernung zunimmt, ihre Bereitschaft zur Reise schnell abnimmt (oft überproportional).

Durch Nutzung der *Sensitivität*, die Sie definieren, ermöglicht Ihnen die Gauß-Funktion, diesen Aspekt des realen Verhaltens genauer zu modellieren.

:::


*Cumulative Opportunities Linear, (Kwan,1998):*
<div>
<MathJax.Provider>
  <div style={{ marginTop: '20px', fontSize: '24px' }}>
    <MathJax.Node formula={`
      f(t_{ij}) =
      \\begin{cases}
        1 - \\frac{t_{ij}}{\\bar{t}} & \\text{for } t_{ij} \\leq \\bar{t} \\\\
        0 & \\text{otherwise}
      \\end{cases}
    `} />
  </div>
</MathJax.Provider>
  </div>    

*Negative Exponential, (Kwan,1998):*

<div><MathJax.Provider>
  <div style={{ marginTop: '20px', fontSize: '24px'  }}>
    <MathJax.Node formula={"f(t_{ij})=\\exp^{(-\\beta t_{ij})}"} />
  </div>
</MathJax.Provider>
    </div>  

*Inverse Power, (Kwan,1998) (`power` in GOAT):*

<div>
<MathJax.Provider>
  <div style={{ marginTop: '20px', fontSize: '24px' }}>
    <MathJax.Node formula={`f(t_{ij}) = \\begin{cases}
      \\ 1 & \\text{for } t_{ij} \\leq 1 \\\\
      t_{ij}^{-\\beta} & \\text{otherwise}
    \\end{cases}`} />
  </div>
</MathJax.Provider>
</div>  


### Klassifizierung

Um die berechneten Erreichbarkeitsniveaus für jede Rasterzelle zu klassifizieren, wird standardmäßig eine Klassifizierung basierend auf Quantilen verwendet. 
Es können jedoch auch verschiedene andere Klassifizierungsmethoden verwendet werden. Lesen Sie mehr im Abschnitt **[Datenklassifizierungsmethoden](../../map/layer_style/style/attribute_based_styling#data-classification-methods)** auf der Seite *Attributbasiertes Styling*.

### Visualisierung 

Heatmaps in GOAT nutzen **[Ubers H3-Raster](../../further_reading/glossary#h3-grid)**-Lösung für effiziente Berechnung und leicht verständliche Visualisierung. Im Hintergrund nutzt eine vorberechnete Reisezeitmatrix für jeden *Routing-Modus* diese Lösung und wird in Echtzeit abgefragt und weiterverarbeitet, um die Erreichbarkeit zu berechnen und eine finale Heatmap zu erstellen.

Die Auflösung und Dimensionen des verwendeten hexagonalen Rasters hängen vom gewählten *Routing-Modus* ab:

<div style={{ marginLeft: '20px' }}>

<Tabs>

<TabItem value="walk" label="Zu Fuß" default className="tabItemBox">

<li parentName="ul">{`Auflösung: 10`}</li>
<li parentName="ul">{`Durchschnittliche Hexagon-Fläche: 11285.6 m²`}</li>
<li parentName="ul">{`Durchschnittliche Kantenlänge Hexagon: 65.9 m`}</li>
</TabItem>
  
<TabItem value="cycling" label="Fahrrad" className="tabItemBox">

<li parentName="ul">{`Auflösung: 9`}</li>
<li parentName="ul">{`Durchschnittliche Hexagon-Fläche: 78999.4 m²`}</li>
<li parentName="ul">{`Durchschnittliche Kantenlänge Hexagon: 174.4 m`}</li>
</TabItem>

<TabItem value="pedelec" label="Pedelec" className="tabItemBox">

<li parentName="ul">{`Auflösung: 9`}</li>
<li parentName="ul">{`Durchschnittliche Hexagon-Fläche: 78999.4 m²`}</li>
<li parentName="ul">{`Durchschnittliche Kantenlänge Hexagon: 174.4 m`}</li> 
</TabItem>

<TabItem value="car" label="Auto" className="tabItemBox">

<li parentName="ul">{`Auflösung: 8`}</li>
<li parentName="ul">{`Durchschnittliche Hexagon-Fläche: 552995.7 m²`}</li>
<li parentName="ul">{`Durchschnittliche Kantenlänge Hexagon: 461.4 m`}</li>

</TabItem>

</Tabs>
</div>
