---
sidebar_position: 10
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Travel Cost Matrix

The Travel Cost Matrix tool **computes travel time or distance between a set of origins and a set of destinations**, producing a table that can be used for accessibility analysis, location planning, and spatial modeling.

## 1. Explanation

The Travel Cost Matrix calculates the **travel cost (time or distance) between every origin–destination pair** in two input layers, for a selected routing mode. The output is a table where each row represents one O-D connection and includes the origin identifier, destination identifier, and the computed travel cost.

The Travel Cost Matrix is designed for **batch computation across many origins and destinations at once**. This makes it the right tool when you need the raw cost data to feed into further analyses, such as location scoring, supply-demand matching, or custom accessibility indices.

## 2. Example use cases

- Computing walking times from all residential buildings to the nearest schools to identify underserved areas.
- Calculating car travel times between a set of warehouses (origins) and retail stores (destinations) for logistics optimization.
- Building an input matrix for a custom accessibility score that weights travel time by destination attractiveness.
- Assessing how many destinations are reachable within a given travel time threshold from each origin.
- Comparing travel cost differences between two transport modes (e.g., cycling vs. public transport) for a set of O-D pairs.

## 3. How to use the tool?

<div class="step">
  <div class="step-number">1</div>
  <div class="content">Click on <code>Toolbox</code> <img src={require('/img/icons/toolbox.png').default} alt="Toolbox" style={{ maxHeight: "20px", maxWidth: "20px", objectFit: "cover"}}/> and under <code>Accessibility Indicators</code>, click on <code>Travel Cost Matrix</code>.</div>
</div>

### Routing

<div class="step">
  <div class="step-number">2</div>
  <div class="content">Select the <code>Routing Type</code> to use for travel cost computation.</div>
</div>

<Tabs>
<TabItem value="walk" label="Walk" default className="tabItemBox">

**Considers all paths accessible by foot.**

<div class="step">
  <div class="step-number">3</div>
  <div class="content">Choose whether to calculate the travel cost based on <code>Time</code> or <code>Distance</code>, and set the corresponding limit.</div>
</div>

<div class="step">
  <div class="step-number">4</div>
  <div class="content">If choosing <code>Time</code>, you can also set the <code>Speed</code>.</div>
</div>

:::tip Hint

For suitable travel time limits by amenity type, see the [Location Tool](https://www.chemnitz.de/chemnitz/media/unsere-stadt/verkehr/verkehrsplanung/vep2040_standortwerkzeug.pdf) from the City of Chemnitz.

:::

</TabItem>

<TabItem value="cycling" label="Bicycle/Pedelec" className="tabItemBox">

**Considers all bicycle-accessible paths.** Accounts for surface quality, smoothness, and slope. For Pedelec, slopes have lower impedance than standard bicycles.

<div class="step">
  <div class="step-number">3</div>
  <div class="content">Choose whether to calculate the travel cost based on <code>Time</code> or <code>Distance</code>, and set the corresponding limit.</div>
</div>

<div class="step">
  <div class="step-number">4</div>
  <div class="content">If choosing <code>Time</code>, you can also set the <code>Speed</code>.</div>
</div>

:::tip Hint

For suitable travel time limits by amenity type, see the [Location Tool](https://www.chemnitz.de/chemnitz/media/unsere-stadt/verkehr/verkehrsplanung/vep2040_standortwerkzeug.pdf) from the City of Chemnitz.

:::

</TabItem>

<TabItem value="car" label="Car" className="tabItemBox">

**Considers all car-accessible paths.** Accounts for speed limits and one-way restrictions.

<div class="step">
  <div class="step-number">3</div>
  <div class="content">Choose whether to calculate the travel cost based on <code>Time</code> or <code>Distance</code>, and set the corresponding limit.</div>
</div>

</TabItem>

<TabItem value="public transport" label="Public Transport (PT)" className="tabItemBox">

**Considers all locations accessible by public transport**, including inter-modal transfers and station access/egress.

<div class="step">
  <div class="step-number">3</div>
  <div class="content">Select the <code>Public transport modes</code> to analyze: Bus, Tram, Rail, Subway, Ferry, Cable Car, Gondola, and/or Funicular. Then you can select the <code>Day</code>, <code>Start Time</code>, and <code>End Time</code> for the analysis time window. </div>
</div>

<div class="step">
  <div class="step-number">4</div>
  <div class="content">Optionally, click on <code>Advanced Configurations</code> to set the <code>Maximum Transfers</code> and configure the <code>Access mode</code> and <code>Egress mode</code>.</div>
</div>

</TabItem>
</Tabs>

### Origins

<div class="step">
  <div class="step-number">5</div>
  <div class="content">Select your <code>Origins Layer</code>. This should be a <strong>point layer</strong> where each feature represents a starting location.</div>
</div>

<div class="step">
  <div class="step-number">6</div>
  <div class="content">Select the <code>Origin ID Field</code>. This field uniquely identifies each origin in the output table.</div>
</div>

### Destinations

<div class="step">
  <div class="step-number">7</div>
  <div class="content">Select your <code>Destinations Layer</code>. This should be a <strong>point layer</strong> where each feature represents a target location.</div>
</div>

<div class="step">
  <div class="step-number">8</div>
  <div class="content">Select the <code>Destination ID Field</code>. This field uniquely identifies each destination in the output table.</div>
</div>

<div class="step">
  <div class="step-number">9</div>
  <div class="content">Click on <code>Run</code>.</div>
</div>

:::tip Hint

Calculation time scales with the number of O-D pairs. Check the [status bar](../../workspace/home#status-bar) for progress.

:::

### Results

Once the calculation finishes, a **table layer** is added to the map panel. Each row represents one origin–destination pair that falls within the specified travel cost threshold.

| Column | Description |
|--------|-------------|
| `origin_id` | Identifier of the origin feature (from your selected Origin ID Field) |
| `destination_id` | Identifier of the destination feature (from your selected Destination ID Field) |
| `travel_cost` | Travel time (minutes) or distance (meters), depending on the selected measure type |

O-D pairs that exceed the maximum travel cost are excluded from the output.

A **Destinations** point layer is also added, containing all original destination attributes enriched with the computed **travel_cost** value for each point.

:::tip Tip
Want to use this matrix for further analysis? Connect the result table as input to other tools in a [Workflow](../../map/layers.md) or export it as CSV for use in external tools.
:::

## 4. Technical details

Travel costs are computed using the **same routing engine as the Catchment Area tool**, ensuring consistent results across all accessibility analyses in GOAT. For each origin, the routing algorithm explores the network up to the specified maximum cost and records the cost to each reachable destination.

### Computational considerations

- The number of calculations scales as **O × D** (number of origins × number of destinations). Large datasets with many origins and destinations will take longer to process.
- Using a realistic **maximum travel cost** limit significantly reduces computation time and output size.
- For **Public Transport**, the travel cost represents the average travel time for all feasible trips departing within the specified time window.

### Output geometry

The Travel Cost Matrix produces a **table (non-spatial) layer**. To visualize the connections on the map, use the [Origin-Destination](../geoanalysis/origin_destination.md) tool, which can take an O-D table and a geometry layer to draw flow lines.

:::tip Hint

For further insights into the routing algorithm, visit [Routing](../../category/routing).

:::
