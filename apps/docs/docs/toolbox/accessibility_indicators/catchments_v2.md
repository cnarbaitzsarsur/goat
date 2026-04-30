---
sidebar_position: 9
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Catchment Area V2 (Beta)

Catchment Area V2 shows **how far people can travel within a certain travel time or distance, using one or more transport modes** — with extended output shapes, custom step sizes, and additional public transport settings.

:::info Beta Feature
Catchment Area V2 is currently in **Beta**. It runs alongside the standard [Catchment Area](./catchments.md) tool and will eventually replace it. Functionality and parameters may change as we incorporate user feedback.
:::

## 1. Explanation

Catchment Area V2 builds on the standard Catchment Area tool and extends it with the following additions:

**For all routing modes:**

- **Custom step sizes** — define each isochrone step independently (e.g., 5, 10, 20, 30 minutes) instead of using equally-spaced intervals.
- **Point Grid output shape** — a new result geometry option that represents the catchment as a grid of individual points, each showing its exact travel cost value.

**For Public Transport only:**

- **Maximum number of transfers** — limit how many PT connections a trip can include.
- **Access and egress mode** — configure how users travel to and from PT stations (walking, cycling, or car).

Based on specified starting point(s), maximum travel time or distance, and transport mode(s), the tool **visualizes accessibility using real-world routing networks**. The resulting isochrones can be intersected with spatial datasets — such as population or amenity data — to assess coverage and identify accessibility gaps.

:::info
Catchment Area V2 computation is available in specific regions.

When selecting a `Routing type`, GOAT displays a map overlay showing coverage.
For `Walk`, `Bicycle`, `Pedelec`, and `Car`: over 30 European countries are supported.
For `Public Transport`: Germany is supported.

If you need analyses beyond these regions, feel free to [contact us](https://plan4better.de/en/contact/) and we'll discuss further options.
:::

## 2. Example use cases

- Which amenities are reachable within a 5, 10, and 20-minute walk? (Using custom step sizes to reflect planning standards.)
- How does limiting PT connections to one transfer change the catchment area compared to unlimited transfers?
- Which areas are reachable by bicycle within 5 minutes, 15 minutes, and 30 minutes from a new cycling hub?
- How do workplace catchment areas compare between car and public transport when cyclists can access PT stations?
- What share of the population has a general practitioner within 500m on foot?

## 3. How to use the tool?

<div class="step">
  <div class="step-number">1</div>
  <div class="content">Click on <code>Toolbox</code> <img src={require('/img/icons/toolbox.png').default} alt="Toolbox" style={{ maxHeight: "20px", maxWidth: "20px", objectFit: "cover"}}/> . Under <code>Accessibility Indicators</code>, click on <code>Catchment Area V2</code>.</div>
</div>

### Routing & Configuration

<div class="step">
  <div class="step-number">2</div>
  <div class="content">Select the <code>Routing Type</code> and configure the parameters for your chosen mode following the steps below.</div>
</div>

<Tabs>
<TabItem value="walk" label="Walk" default className="tabItemBox">

**Considers all paths accessible by foot.**

<div class="step">
  <div class="step-number">3</div>
  <div class="content">Choose whether to calculate the catchment area based on <code>Time</code> or <code>Distance</code>, and set the corresponding limit. If choosing <code>Time</code>, you can also configure the <code>Speed</code>.</div>
</div>

:::tip Hint

For suitable travel time limits by amenity type, see the [Location Tool](https://www.chemnitz.de/chemnitz/media/unsere-stadt/verkehr/verkehrsplanung/vep2040_standortwerkzeug.pdf) from the City of Chemnitz.

:::

<div class="step">
  <div class="step-number">4</div>
  <div class="content">Choose the <code>Catchment area shape</code>. If choosing: <ul><li><code>Polygon</code> or <code>Network</code>: you can select the <code>Steps</code> and <code>Step sizes</code>.</li><li><code>Hexagonal grid</code>: no further configuration is necessary.</li><li><code>Point grid</code>: you need to select the <code>Point grid layer</code> where the values will be applied.</li></ul></div>
</div>

<div class="step">
  <div class="step-number">5</div>
  <div class="content">Select the <code>Number of Steps</code> and the <code>Step sizes</code>.</div>
</div>
</TabItem>

<TabItem value="cycling" label="Bicycle/Pedelec" className="tabItemBox">

**Considers all bicycle-accessible paths.** This routing mode accounts for surface, smoothness, and slope while computing accessibility. For Pedelec, slopes have lower impedance than standard bicycles.

<div class="step">
  <div class="step-number">3</div>
  <div class="content">Choose whether to calculate the catchment area based on <code>Time</code> or <code>Distance</code>, and set the corresponding limit. If choosing <code>Time</code>, you can also configure the <code>Speed</code>.</div>
</div>

:::tip Hint

For suitable travel time limits by amenity type, see the [Location Tool](https://www.chemnitz.de/chemnitz/media/unsere-stadt/verkehr/verkehrsplanung/vep2040_standortwerkzeug.pdf) from the City of Chemnitz.

:::

<div class="step">
  <div class="step-number">4</div>
  <div class="content">Choose the <code>Catchment area shape</code>. If choosing: <ul><li><code>Polygon</code> or <code>Network</code>: you can select the <code>Steps</code> and <code>Step sizes</code>.</li><li><code>Hexagonal grid</code>: no further configuration is necessary.</li><li><code>Point grid</code>: you need to select the <code>Point grid layer</code> where the values will be applied.</li></ul></div>
</div>

<div class="step">
  <div class="step-number">5</div>
  <div class="content">Select the <code>Number of Steps</code> and the <code>Step sizes</code>.</div>
</div>

</TabItem>

<TabItem value="car" label="Car" className="tabItemBox">

**Considers all car-accessible paths.** This routing mode accounts for speed limits and one-way restrictions while computing accessibility.

<div class="step">
  <div class="step-number">3</div>
  <div class="content">Choose whether to calculate the catchment area based on <code>Time</code> or <code>Distance</code>, and set the corresponding limit. If choosing <code>Time</code>, you can also configure the <code>Speed</code>.</div>
</div>

:::tip Hint

For suitable travel time limits by amenity type, see the [Location Tool](https://www.chemnitz.de/chemnitz/media/unsere-stadt/verkehr/verkehrsplanung/vep2040_standortwerkzeug.pdf) from the City of Chemnitz.

:::

<div class="step">
  <div class="step-number">4</div>
  <div class="content">Choose the <code>Catchment area shape</code>. If choosing: <ul><li><code>Polygon</code> or <code>Network</code>: you can select the <code>Steps</code> and <code>Step sizes</code>.</li><li><code>Hexagonal grid</code>: no further configuration is necessary.</li><li><code>Point grid</code>: you need to select the <code>Point grid layer</code> where the values will be applied.</li></ul></div>
</div>

<div class="step">
  <div class="step-number">5</div>
  <div class="content">Select the <code>Number of Steps</code> and the <code>Step sizes</code>.</div>
</div>

</TabItem>

<TabItem value="public transport" label="Public Transport (PT)" className="tabItemBox">

**Considers all locations accessible by public transport, including inter-modal transfers and station access.**

<div class="step">
  <div class="step-number">3</div>
  <div class="content">Select the <code>Public transport modes</code> to analyze: Bus, Tram, Rail, Subway, Ferry, Cable Car, Gondola, and/or Funicular, and configure the <code>Travel time limit</code> in minutes.</div>
</div>

:::tip Hint

For suitable travel time limits by amenity type, see the [Location Tool](https://www.chemnitz.de/chemnitz/media/unsere-stadt/verkehr/verkehrsplanung/vep2040_standortwerkzeug.pdf) from the City of Chemnitz.

:::

<div class="step">
  <div class="step-number">4</div>
  <div class="content">Choose the <code>Catchment area shape</code>. If choosing: <ul><li><code>Polygon</code> or <code>Network</code>: you can select the <code>Steps</code> and <code>Step sizes</code>.</li><li><code>Hexagonal grid</code>: no further configuration is necessary.</li><li><code>Point grid</code>: you need to select the <code>Point grid layer</code> where the values will be applied.</li></ul></div>
</div>

<div class="step">
  <div class="step-number">5</div>
  <div class="content">Select the <code>Day</code>, <code>Start Time</code>, and <code>End Time</code> for the analysis time window.</div>
</div>

</TabItem>
</Tabs>

### Advanced Configuration

<Tabs>
<TabItem value="non-pt" label="Walk / Bicycle / Pedelec / Car" default className="tabItemBox">

<div class="step">
  <div class="step-number">6</div>
  <div class="content">Optionally, click on <code>Advanced Configurations</code> to set the <code>Step style</code>.</div>
</div>

#### Step Style

Choose how the isochrone steps are displayed:

- **Separate** — each step shows only the area reachable *between* that step and the previous one.
- **Cumulative** — each step shows the *full area reachable up to* that travel cost.

<p></p>

</TabItem>

<TabItem value="pt-advanced" label="Public Transport (PT)" className="tabItemBox">

<div class="step">
  <div class="step-number">6</div>
  <div class="content">Optionally, click on <code>Advanced Configurations</code> to configure the <code>Step style</code>, <code>Maximum Transfers</code>, <code>Access mode</code>, and <code>Egress mode</code>.</div>
</div>

#### Step Style

Choose how the isochrone steps are displayed:

- **Separate** — each step shows only the area reachable *between* that step and the previous one.
- **Cumulative** — each step shows the *full area reachable up to* that travel cost.

#### Maximum Transfers

Set the `Maximum transfers` to limit how many PT connections are allowed per trip. For example, setting it to `1` means only trips with at most one transfer are included — direct connections and one-change journeys.

#### Access & Egress Mode

Configure how users travel **to** and **from** PT stations:

- **Access mode** — Transport mode to reach the PT station (Walk, Bicycle, Car).
- **Egress mode** — Transport mode from the PT station to the destination (Walk, Bicycle, Car).

For each mode, configure the **maximum travel time or distance** and the **travel speed**. For example, you can model a cyclist who rides at 15 km/h for up to 10 minutes to reach a train station.

<p></p>

</TabItem>
</Tabs>

### Starting Points

<div class="step">
  <div class="step-number">7</div>
  <div class="content">Select the <code>Starting point method</code>: <code>Select on map</code> and <b>click on the map to place starting point(s)</b>. Or <code>Select from layer</code> and <b>choose a Point layer</b> containing your desired starting point(s). All features in the layer will be used as starting points.</div>
</div>


### Scenario (Optional)

<div class="step">
  <div class="step-number">8</div>
  <div class="content">Optionally, expand the <code>Scenario</code> section and select a scenario to apply network modifications (e.g., new roads or paths) to the routing calculation.</div>
</div>

:::tip Hint

Scenarios let you model infrastructure changes and immediately see how they affect accessibility. See [Scenarios](../../Scenarios/Scenarios.md) to learn how to create and edit scenarios.

:::

<div class="step">
  <div class="step-number">9</div>
  <div class="content">Click on <code>Run</code> to start the calculation.</div>
</div>

:::tip Hint

Calculation time varies by settings. Check the [status bar](../../workspace/home#status-bar) for progress.

:::

### Results

Once the calculation finishes, the resulting layer(s) are added to the map:

- **Catchment Area** — the calculated isochrones in the selected shape (polygon, network, rectangular grid, or point grid). Click any feature to inspect the **travel_cost** attribute, which shows travel time (minutes) or distance (meters) depending on your configuration.
- **Starting Points** — a point layer with the selected starting locations (only created when starting points were placed on the map, not when using a pre-existing layer).

The result layer is automatically styled with a color scale ranging from the shortest to the longest travel cost step.

## 4. Technical details

**Catchment areas are isolines connecting points reachable from starting point(s) within a time interval (*isochrones*) or distance (*isodistance*)**. The calculation uses the appropriate transport network for the selected routing mode.

### Starting point limits

| Routing mode | Maximum starting points |
| --- | --- |
| Walk / Bicycle / Pedelec | 1,000 |
| Car | 50 |
| Public Transport | 5 |

### Visualization

The catchment shape is derived from the routing grid using the [Marching Squares contour line algorithm](https://en.wikipedia.org/wiki/Marching_squares). This transforms the routing grid from a 2D array into smooth polygon contours for visualization and spatial analysis.

### Scientific background

Catchments are *contour-based measures* (also *cumulative opportunities*), valued for their interpretable results ([Geurs and van Eck 2001](#5-references); [Albacete 2016](#5-references)). They do not distinguish between different travel times within the cut-off range ([Bertolini, le Clercq, and Kapoen 2005](#5-references)), unlike [heatmap-based accessibility indicators](./closest_average.md).

:::tip Hint

For further insights into the routing algorithm, visit [Routing](../../category/routing).

:::

## 5. References

Albacete, Xavier. 2016. "Evaluation and Improvements of Contour-Based Accessibility Measures." url: https://dspace.uef.fi/bitstream/handle/123456789/16857/urn_isbn_978-952-61-2103-1.pdf

Bertolini, Luca, F. le Clercq, and L. Kapoen. 2005. "Sustainable Accessibility: A Conceptual Framework to Integrate Transport and Land Use Plan-Making." Transport Policy 12 (3): 207–20. https://doi.org/10.1016/j.tranpol.2005.01.006

Geurs, Karst T., and Ritsema van Eck. 2001. "Accessibility Measures: Review and Applications." RIVM Report 408505 006. url: https://rivm.openrepository.com/handle/10029/259808

Matthew Wigginton Conway, Andrew Byrd, Marco Van Der Linden. "Evidence-Based Transit and Land Use Sketch Planning Using Interactive Accessibility Methods on Combined Schedule and Headway-Based Networks", 2017. url: https://journals.sagepub.com/doi/10.3141/2653-06
