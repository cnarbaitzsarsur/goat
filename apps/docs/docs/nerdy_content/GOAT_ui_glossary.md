# GOAT Glossary

This comprehensive glossary provides English to German translations for all the tools, features, and vocabulary used in the GOAT application. This resource helps users navigate between the English documentation and the German interface.

## Core Interface Elements

| English | German | Description |
|---------|--------|-------------|
| **Interface** | **Kartenoberfläche** | Main map interface |
| Upper Bar | Obere Leiste | Top navigation bar |
| Navigation Bar | Navigationsleiste | Left sidebar with main tools |
| Spatial Operations Bar | Räumliche Operationsleiste | Right sidebar with analysis tools |
| Map Navigation | Kartennavigation | Map control tools |
| Project Menu | Projektmenü | Project selection and management |
| Last Saved | Zuletzt gespeichert | Timestamp of last changes |
| Share | Teilen | Share project functionality |
| Documentation | Dokumentation | Link to help documentation |
| Job Status | Job Status | Status of running calculations |
| User Profile | Benutzerprofil | User account settings |

## Main Navigation Tools

| English | German | Description |
|---------|--------|-------------|
| **Layers** | **Layer** | Layer management panel |
| Add Layer | Layer hinzufügen | Add new layer to project |
| Active Layer | Aktive Layer | Currently selected layer |
| Layer Design | Layer Design | Layer styling and symbology |
| **Legend** | **Legende** | Map legend display |
| **Properties** | **Eigenschaften** | Layer information and settings |
| **Filter** | **Filter** | Data filtering tools |
| **Toolbox** | **Werkzeuge** | Spatial analysis tools |
| **Workflows** | **Workflows** | Visual analysis workflow editor |
| **Scenarios** | **Szenarien** | Scenario planning tools |

## Spatial Analysis Tools

### Geoprocessing Tools
| English | German | Description |
|---------|--------|-------------|
| Geoprocessing | Geoverarbeitung | Spatial data processing operations |
| Geoanalysis | Geoanalyse | Spatial data analysis |
| Buffer | Puffer | Create buffer zones around features |
| Buffer Distance | Pufferabstand | Distance for buffer creation |
| Buffer Settings | Puffereinstellungen | Buffer configuration options |
| Buffer Steps | Pufferstufen | Number of buffer steps |
| Polygon Union | Polygon-Vereinigung | Combine buffer polygons |
| Polygon Difference | Polygon-Differenz | Subtract overlapping polygons |
| **Clip** | **Auschneiden** | Extract features within clip geometry |
| Clip Layer | Ausschnitt-Layer | Layer used for clipping |
| **Intersection** | **Überschneiden** | Geometric intersection of two layers |
| **Union** | **Vereinigen** | Combine features from multiple layers |
| **Erase/Difference** | **Radieren** | Remove portions that overlap with erase geometry |
| Erase Layer | Differenz-Layer | Layer used for erasing |
| **Centroid** | **Mittelpunkt** | Create point features at geometric center |
| Centroid Points | Schwerpunkt-Punkte | Point features at center |
| Self-Union | Selbst-Vereinigung | Union operation on single layer |
| Overlay Layer | Overlay-Layer | Secondary layer for overlay operations |
| Geometric Operations | Geometrische Operationen | Spatial geometric calculations |

### Geocoding & Geoanalysis
| English | German | Description |
|---------|--------|-------------|
| **Geocoding** | **Geokodierung** | Convert addresses to coordinates |
| Address Layer | Adressen-Layer | Layer containing address data |
| Full Address | Vollständige Adresse | Complete address in single field |
| Structured Address | Strukturierte Adresse | Address components in separate fields |
| Street | Straße | Street name field |
| House Number | Hausnummer | Building number field |
| Postal Code | Postleitzahl | ZIP/postal code field |
| City | Stadt | City/town name field |
| Country | Land | Country name field |
| **Aggregate Points** | **Punkte aggregieren** | Point aggregation analysis |
| **Aggregate Polygons** | **Polygone aggregieren** | Polygon aggregation analysis |
| Summary Areas | Aggregierungspolygone | Aggregation target areas |
| Statistical Method | Statistische Methode | Aggregation calculation method |
| Weighted by Intersection Area | Gewichtet nach Verschneidungsfläche | Aggregation weight based on overlap area |
| Group By Field | Gruppierungsfeld | Field used to group aggregated results |
| **Origin-Destination** | **Quell-Ziel-Beziehungen** | Origin-destination analysis |
| OD Matrix | Matrix-Tabelle | Origin-destination matrix |
| Origin | Startpunkt | Starting point |
| Destination | Ziel | Destination point |
| Origin Field | Feld Quelle | Origin identifier field |
| Destination Field | Felder Ziel | Destination identifier field |
| Weight Field | Feld Gewichtung | Field used to weight OD connections |

### Data Management & Joining
| English | German | Description |
|---------|--------|-------------|
| **Join** | **Verknüpfung** | Spatial and attribute-based joins |
| Join Layer | Join-Layer | Source layer for joining |
| Target Layer | Ziel-Layer | Destination layer for join |
| Join Field | Join-Feld | Field used for joining |
| Target Field | Ziel-Feld | Target field for join |
| Spatial Join | Räumliche Verknüpfung | Join based on spatial relationship |
| Attribute Join | Attribut-Verknüpfung | Join based on attribute values |
| Field Selection | Feldauswahl | Choose which fields to include |
| Selected Fields | Ausgewählte Felder | Fields chosen for output |

### Catchment Area Analysis
| English | German | Description |
|---------|--------|-------------|
| Catchment Area | Einzugsgebiet | Service area analysis |
| Catchment Area Active Mobility | Einzugsgebiet Aktive Mobilität | Walking/cycling accessibility |
| Catchment Area Car | Einzugsgebiet Auto | Car accessibility |
| Catchment Area PT | Einzugsgebiet ÖV | Public transport accessibility |
| Catchment Area Shape | Form des Einzugsgebiets | Shape type used for catchment area output |
| Travel Time Limit | Reisezeitlimit | Maximum travel time |
| Travel Time Speed | Reisegeschwindigkeit | Travel speed setting |
| Isochrone | Isochrone | Area reachable within time limit |

### Heatmap Analysis
| English | German | Description |
|---------|--------|-------------|
| Heatmap Connectivity | Heatmap Konnektivität | Network connectivity analysis |
| Heatmap Gravity | Heatmap Gravity | Gravity model accessibility |
| Heatmap Closest Average | Heatmap Durchschnitt Reisezeit | Average travel time to closest destinations |
| Heatmap Closest Average Active Mobility | Heatmap Durchschnitt Aktive Mobilität | Closest average heatmap for walking/cycling |
| Heatmap Connectivity Active Mobility | Heatmap Konnektivität Aktive Mobilität | Network connectivity for active mobility |
| Heatmap Gravity Active Mobility | Heatmap Gravity Aktive Mobilität | Gravity model heatmap for active mobility |
| Heatmap Closest Average Car | Heatmap Durchschnitt Auto | Closest average heatmap for car |
| Heatmap Connectivity Car | Heatmap Konnektivität Auto | Network connectivity heatmap for car |
| Heatmap Gravity Car | Heatmap Gravity Auto | Gravity model heatmap for car |
| Heatmap Closest Average PT | Heatmap Durchschnitt ÖV | Closest average heatmap for public transport |
| Heatmap Connectivity PT | Heatmap Konnektivität ÖV | Network connectivity heatmap for PT |
| Heatmap Gravity PT | Heatmap Gravity ÖV | Gravity model heatmap for public transport |
| Opportunities | Gelegenheiten | Destination points for analysis |
| Sensitivity | Sensitivität | Distance decay parameter |
| Impedance Function | Widerstandsfunktion | Function controlling distance decay in gravity models |
| Destination Potential | Destinationspotenzial | Attractiveness weighting factor |
| Grid Resolution | Gitterauflösung | Hexagonal grid detail level |
| H3 Grid | H3-Gitter | Hexagonal spatial indexing system |

### Accessibility Indicators
| English | German | Description |
|---------|--------|-------------|
| Accessibility Indicators | Erreichbarkeitsindikatoren | Accessibility measurements |
| ÖV-Güteklassen | ÖV-Güteklassen | Public transport quality classes |
| Nearby Stations | Nahgelegene ÖV-Haltestellen | Nearby public transport stops |
| Trip Count | Abfahrten ÖPNV | Public transport departures |
| GTFS Data | GTFS-Daten | General Transit Feed Specification |
| Quality Classes | Güteklassen | Service quality assessment levels |
| Station Coverage | Stationsabdeckung | Public transport station reach |

## Workflows Interface

| English | German | Description |
|---------|--------|-------------|
| **Workflows** | **Workflows** | Visual analysis workflow system |
| Workflow | Workflow | Collection of connected analysis steps |
| Workflow Canvas | Workflow-Leinwand | Visual editing area for workflows |
| Workflow Editor | Workflow-Editor | Visual workflow design interface |
| Node | Knoten | Individual workflow element (dataset, tool, export) |
| Edge | Verbindung | Connection between workflow nodes |
| **Dataset Node** | **Datensatz-Knoten** | Input data source in workflow |
| **Tool Node** | **Werkzeug-Knoten** | Analysis process in workflow |
| **Export Node** | **Export-Knoten** | Output/save step in workflow |
| **Text Annotation Node** | **Text-Anmerkungs-Knoten** | Documentation note on canvas |
| Canvas | Leinwand | Visual workspace for building workflows |
| Viewport | Ansichtsbereich | Canvas view position and zoom |
| Handle | Anschluss | Connection point on nodes |
| Source Handle | Quell-Anschluss | Output connection point |
| Target Handle | Ziel-Anschluss | Input connection point |
| **Execution** | **Ausführung** | Running workflow processes |
| Run Node | Knoten ausführen | Execute single workflow step |
| Run to Here | Bis hier ausführen | Execute workflow up to selected node |
| Run Workflow | Workflow ausführen | Execute entire workflow |
| Node Status | Knoten-Status | Current state of workflow node |
| Idle | Inaktiv | Node ready to run |
| Pending | Ausstehend | Node queued for execution |
| Running | Läuft | Node currently executing |
| Completed | Abgeschlossen | Node finished successfully |
| Cancelled | Abgebrochen | Node execution was cancelled |
| Error | Fehler | Node execution failed |
| **Variables** | **Variablen** | Workflow-level parameters |
| Variable Name | Variablenname | Parameter identifier |
| Default Value | Standardwert | Initial parameter value |
| Variable Type | Variablentyp | Data type (string, number) |
| **Canvas Controls** | **Leinwand-Steuerung** | Workflow editor tools |
| Auto-layout | Automatisches Layout | Arrange nodes automatically |
| Zoom Controls | Zoom-Steuerung | Canvas zoom in/out |
| Minimap | Minimap | Canvas overview navigator |
| Background Grid | Hintergrund-Raster | Canvas alignment grid |
| **Workflow Management** | **Workflow-Verwaltung** | Workflow organization |
| Add Workflow | Workflow hinzufügen | Create new workflow |
| Duplicate Workflow | Workflow duplizieren | Copy existing workflow |
| Rename Workflow | Workflow umbenennen | Change workflow name |
| Delete Workflow | Workflow löschen | Remove workflow |
| Default Workflow | Standard-Workflow | Primary workflow for project |
| Workflow Description | Workflow-Beschreibung | Workflow documentation |
| Workflow Thumbnail | Workflow-Vorschau | Preview image |
| **Data Processing** | **Datenverarbeitung** | Workflow data handling |
| Temporary Layer | Temporäre Ebene | Intermediate workflow result |
| Output Layer | Ausgabe-Ebene | Final workflow result |
| Layer Reference | Ebenen-Referenz | Link to project layer |
| Filter | Filter | Data filtering within workflow |
| Filter Expression | Filter-Ausdruck | Data filtering condition |
| Geometry Type | Geometrietyp | Spatial data type (point, line, polygon) |
| **Custom SQL** | **Benutzerdefiniertes SQL** | Custom SQL query node in workflow |
| SQL Editor | SQL-Editor | Code editor for writing SQL queries |
| Data Input | Dateneingabe | Input data connection for workflow nodes |
| Finalize Layer / Save Dataset | Dataset speichern | Save workflow result as a permanent dataset |
| Export Dataset | Als Dataset speichern | Export workflow output as a new dataset |
| **Connection Validation** | **Verbindungsvalidierung** | Workflow connection rules |
| Compatible Types | Kompatible Typen | Matching geometry types for connections |
| Invalid Connection | Ungültige Verbindung | Incompatible node connection |
| Connection Error | Verbindungsfehler | Failed node linkage |

## Layouts & Print

| English | German | Description |
|---------|--------|-------------|
| **Layouts** | **Layouts** | Report layout and printing system |
| Layout | Layout | Map layout for reports |
| Add Layout | Layout hinzufügen | Create a new print layout |
| Rename Layout | Layout umbenennen | Change layout name |
| Delete Layout | Layout löschen | Remove a layout |
| Export Layout | Layout exportieren | Export layout as file |
| Print Report | Bericht drucken | Generate PDF/PNG reports |
| Layout Preview | Layout-Vorschau | Preview of print layout |
| Settings Panel | Einstellungsbereich | Layout configuration panel |
| Elements Panel | Elementbereich | Layout components panel |
| Map Element | Kartenelement | Map component in layout |
| Text Element | Textelement | Text component in layout |
| Image Element | Bildelement | Image component in layout |
| Legend Element | Legendenelement | Map legend in layout |
| Scale Bar | Maßstabsleiste | Map scale indicator |
| North Arrow | Nordpfeil | North direction indicator |
| Title | Titel | Layout title text |
| Page Setup | Seiteneinrichtung | Page size and orientation |
| Page Orientation | Seitenausrichtung | Portrait or landscape |
| Landscape | Querformat | Horizontal page orientation |
| Portrait | Hochformat | Vertical page orientation |
| DPI | DPI | Print resolution (dots per inch) |
| Margin | Rand | Page margin spacing |
| Export Format | Exportformat | PDF or PNG output |
| Atlas | Atlas | Multi-page report generation |
| Template | Vorlage | Pre-designed layout template |
| Browse Templates | Vorlagen durchsuchen | Explore available layout templates |
| Single Map | Einzelkarte | Layout with a single map view |
| Poster | Poster | Poster-style layout format |
| Connected Map | Verbundene Karte | Layout map linked to main map view |
| Map View | Kartenansicht | Map display area within a layout |
| Map Extent | Kartenausdehnung | Geographic area shown in layout map |

## Routing & Transportation

| English | German | Description |
|---------|--------|-------------|
| **Routing** | **Routing** | Route calculation |
| Routing Type | Verkehrsmittel | Transportation mode |
| Walk | Zu Fuß | Walking |
| Bicycle | Fahrrad | Cycling |
| Pedelec | Pedelec | Electric bicycle |
| Car | Auto | Car |
| Public Transport (PT) | ÖV | Public transport |
| Bus | Bus | Bus |
| Tram | Tram | Tram |
| Subway | U-Bahn | Subway/Metro |
| Rail | Bahn | Train |
| Ferry | Fähre | Ferry |
| Cable Car | Seilbahn | Cable car |
| Funicular | Standseilbahn | Funicular railway |
| Gondola | Gondelbahn | Gondola lift |

## Data Management

| English | German | Description |
|---------|--------|-------------|
| **Data** | **Daten** | Data management |
| Datasets | Datensätze | Data collections |
| Dataset Upload | Datensatz-Upload | Upload data files |
| Dataset Explorer | Datensatz-Explorer | Browse available datasets |
| External Dataset | Externer Datensatz | External data source |
| **Catalog** | **Katalog** | Data catalog |
| Metadata | Metadaten | Data information |
| Data Source | Datensatzquelle | Data source information |
| Data Reference Year | Daten Bezugsjahr | Reference year for the dataset |
| Attribution | Namensnennung | Data source credit/attribution |
| Data Category | Kategorie | Thematic category of the dataset |
| License | Lizenz | Data usage license |
| Completeness | Vollständigkeit | Data completeness quality indicator |
| Positional Accuracy | Positionsgenauigkeit | Spatial accuracy quality indicator |
| Attribute Accuracy | Attributgenauigkeit | Attribute data accuracy indicator |

## Layer Management

| English | German | Description |
|---------|--------|-------------|
| Layer Types | Layertypen | Different layer categories |
| Point Layer | Punkt-Layer | Point geometry layer |
| Polygon Layer | Polygon-Layer | Polygon geometry layer |
| Raster Layer | Raster-Layer | Raster data layer |
| Table Layer | Tabellen-Layer | Attribute table |
| Feature | Feature | Individual map feature |
| Geometry Layer | Geometrien-Layer | Spatial geometry data |
| Hide Layer | Layer ausblenden | Toggle layer visibility off |
| Show Layer | Layer anzeigen | Toggle layer visibility on |
| Delete Layer | Layer löschen | Remove layer from project |
| Rename Layer | Layer umbenennen | Change layer name |
| Duplicate Layer | Layer duplizieren | Create a copy of a layer |
| Layer Info | Layer-Info | View layer metadata and details |
| Zoom Visibility | Sichtbarkeit Zoomen | Control at which zoom levels a layer is visible |

## Project Management

| English | German | Description |
|---------|--------|-------------|
| **Project** | **Projekt** | GOAT project |
| New Project | Neues Projekt | Create new project |
| Project Name | Projektname | Name of project |
| Duplicate Project | Doppeltes Projekt | Copy an existing project |
| Delete Project | Projekt löschen | Remove a project |
| **Workspace** | **Workspace** | User workspace |
| **Folder** | **Ordner** | Organization folder |
| Create Folder | Ordner erstellen | Create new folder |
| Move to Folder | In den Ordner verschieben | Organize content |

## Teams & Organizations

| English | German | Description |
|---------|--------|-------------|
| **Team** | **Team** | Group of users collaborating on projects |
| New Team | Neues Team | Create a new team |
| Team Name | Teamname | Name of the team |
| Team Member | Mitglied | User who belongs to a team |
| Team Owner | Eigentümer | User with ownership rights over a team |
| Leave Team | Team verlassen | Remove yourself from a team |
| Delete Team | Team löschen | Permanently remove a team |
| Manage Members | Mitglieder verwalten | Add or remove team members |
| **Organization** | **Organisation** | Company or institutional account |
| Organization Name | Organisationsname | Name of the organization |
| Organization Type | Organisationstyp | Category of the organization |
| **Publish** | **Veröffentlichen** | Make a project publicly accessible |
| Unpublish | Veröffentlichung aufheben | Revert a project to private access |
| Public URL | Öffentliche URL | Shareable link for a published project |
| Manage Share Access | Zugriff verwalten | Control who can view or edit shared content |

## Styling & Visualization

| English | German | Description |
|---------|--------|-------------|
| **Symbology** | **Symbologie** | Visual representation |
| **Styling** | **Stil** | Visual styling options |
| Color | Farbe | Color settings |
| Fill Color | Füllfarbe | Fill color for polygons |
| Stroke Color | Strichfarbe | Outline color |
| Stroke Width | Strichbreite | Line thickness |
| Opacity | Deckkraft | Transparency level |
| Marker | Marker | Point symbol |
| Custom Marker | Benutzerdefinierter Icon | Custom icon |
| Marker Size | Icongröße | Size of point marker icon |
| Color Based On | Farbe basierend auf | Field used to drive color classification |
| Icon Based On | Symbole basierend auf | Field used to assign different icons |
| Label By | Beschriftung nach | Field used for map label text |
| **Labels** | **Beschriftungen** | Text labels |
| Label Settings | Beschriftungseinstellungen | Label configuration |
| Color Scale | Farbskala | Color ramp for classified visualization |
| Equal Interval | Gleiches Intervall | Classification with equal-width breaks |
| Quantile | Quantil | Classification with equal-count breaks |
| Custom Breaks | Benutzerdefinierte Schritte | User-defined classification thresholds |
| Sequential | Sequenziell | Single-hue color progression |
| Diverging | Divergierend | Two-hue color progression from center |
| Base Color | Grundfarbe | Primary color for styling |
| Highlight Color | Hover-Farbe | Color shown on mouse hover |
| Selected Color | Auswahlfarbe | Color shown when a feature is selected |

## Dashboards & Widgets

| English | German | Description |
|---------|--------|-------------|
| **Dashboard** | **Dashboard** | Interactive data visualization panel |
| Add Widget | Widget hinzufügen | Insert a new chart or table widget |
| Panel | Panel | Individual dashboard container |
| Delete Panel | Panel löschen | Remove a dashboard panel |
| **Chart** | **Diagramm** | Data visualization chart |
| Line Chart | Liniendiagramm | Chart showing trends over a continuous axis |
| Bar Chart | Balkendiagramm | Chart comparing values across categories |
| Vertical Bar Chart | Vertikales Balkendiagramm | Bars displayed vertically |
| Horizontal Bar Chart | Horizontales Balkendiagramm | Bars displayed horizontally |
| Pie Chart | Kreisdiagramm | Circular chart showing proportions |
| Histogram | Histogramm | Chart showing frequency distribution |
| Number of Bins | Anzahl Klassen | Number of intervals in a histogram |
| Value Labels | Wertbeschriftungen | Show data values on chart elements |
| Selection Response | Auswahlverhalten | How a widget reacts to map selection |
| Cross-filter Options | Optionen querfiltern | Settings for cross-widget filtering interaction |

## Expression & Formula Builder

| English | German | Description |
|---------|--------|-------------|
| **Expression Builder** | **Formel-Editor** | Interface for building custom expressions |
| Expression | Ausdruck | Custom formula or calculation |
| Add Expression | Ausdruck hinzufügen | Add a new expression |
| Create Expression | Ausdruck erstellen | Build a new expression |
| Functions | Funktionen | Available built-in functions |
| Math | Mathematik | Mathematical function category |
| Aggregate | Aggregieren | Aggregation function category |
| Conditional | Bedingt | Conditional/logical function category |
| Date/Time | Datum/Zeit | Date and time function category |
| Spatial | Räumlich | Spatial function category |
| Text | Text | String/text function category |
| Window | Fenster | Window function category |
| Addition | Addition | Addition operator |
| Subtraction | Subtraktion | Subtraction operator |
| Multiplication | Multiplikation | Multiplication operator |
| Division | Division | Division operator |
| Modulo | Modulo | Modulo (remainder) operator |

## Basemaps & Background

| English | German | Description |
|---------|--------|-------------|
| **Basemaps** | **Grundkarten** | Background maps |
| Satellite | Satellit | Satellite imagery |
| High Fidelity | Hohe Wiedergabetreue | Detailed street basemap |
| Dark | Dunkel | Dark theme map |
| Light | Hell | Light theme map |
| Traffic | Verkehr | Traffic data map |
| BKG (Germany) | BKG (DE) | Basemap from German Federal Agency for Cartography |
| Grayscale | Grau | Grayscale basemap |
| Relief | Relief | Terrain relief basemap |
| Color | Farbe | Color basemap variant |

## Map Controls

| English | German | Description |
|---------|--------|-------------|
| **Search** | **Standortsuche** | Location search |
| Find Location | Standort finden | Location finder |
| Address Search | Adressen und Koordinaten suchen | Address and coordinate search |
| **Zoom Controls** | **Zoom-Steuerung** | Map zoom tools |
| Zoom In | Hineinzoomen | Zoom closer |
| Zoom Out | Rauszoomen | Zoom further |
| Zoom to Feature | Zoomen Sie auf die Funktion | Focus on feature |
| **Fullscreen** | **Vollbildmodus** | Full screen mode |
| Recenter Map | Karte zentrieren | Pan map back to default center |
| Fit to Screen | An Bildschirm anpassen | Fit all features within current view |
| Compass | Kompass | Map orientation indicator |
| Map Rotation | Kartenrotation | Rotate the map view |
| Lock Map View | Kartenausdehnung sperren | Prevent map pan/zoom in layout |
| Unlock Map View | Kartenansicht entsperren | Allow map pan/zoom in layout |
| **Measure** | **Messen** | Measurement tools |
| Measure Distance | Distanz messen | Measure straight-line distance |
| Measure Area | Fläche messen | Measure area of a drawn polygon |
| Measure Line | Linie messen | Measure length along a drawn line |
| Measure Flight Distance | Luftlinie | Straight-line (as-the-crow-flies) distance |

## Scenarios

| English | German | Description |
|---------|--------|-------------|
| **Scenarios** | **Szenarien** | Scenario planning tools |
| Create Scenario | Szenario erstellen | Create a new planning scenario |
| Edit Scenario | Szenario bearbeiten | Modify an existing scenario |
| Delete Scenario | Szenario löschen | Remove a scenario |
| Select Scenario | Szenario auswählen | Switch to a different scenario |
| Scenario Features | Szenariofunktionen | Features modified within a scenario |
| Show Scenario Features | Szenariofunktionen anzeigen | Display scenario-modified features |
| Hide Scenario Features | Szenariofunktionen ausblenden | Hide scenario-modified features |
| **Draw** | **Zeichnen** | Draw new features on the map |
| Draw Feature | Neue Funktion hinzufügen | Add a new spatial feature to the scenario |
| Modify Attributes | Attribute ändern | Edit feature attribute values |
| Modify Geometry | Geometrie ändern | Edit the spatial shape of a feature |
| Delete Feature | Funktion löschen | Remove a feature from the scenario |
| Feature Editor Tools | Editierfunktionen Objekte | Toolbar for editing scenario features |

## Data Analysis & Statistics

| English | German | Description |
|---------|--------|-------------|
| **Statistics** | **Statistiken** | Statistical calculations |
| Count | Anzahl | Count of features |
| Sum | Summe | Sum calculation |
| Mean | Durchschnitt | Average value |
| Median | Median | Median value |
| Min | Min | Minimum value |
| Max | Max | Maximum value |
| Standard Deviation | Standardabweichung | Statistical deviation |

## Filtering & Selection

| English | German | Description |
|---------|--------|-------------|
| **Filter** | **Filter** | Data filtering |
| Filter Results | Filter Ergebnisse | Filtered data |
| Clear Filter | Filter löschen | Remove filters |
| Cross Filter | Kreuzfilter | Interactive filtering between widgets |
| Filter Viewport | Filteransichtsfenster | Filter data within current map view |
| Zoom to Selection | Zoomen zur Auswahl | Automatically pan map view to filtered data |
| **Expression** | **Ausdruck** | Filter expression |
| Logical Expression | Logischer Ausdruck | Boolean logic |
| Spatial Expression | Räumlicher Ausdruck | Spatial filter |
| Contains the Text | Enthält den Text | String filter: value contains substring |
| Does Not Contain | Enthält nicht den Text | String filter: value does not contain substring |
| Starts With | Beginnt mit | String filter: value starts with string |
| Ends With | Endet mit | String filter: value ends with string |
| Is Between | Liegt zwischen | Numeric filter: value within range |
| Is Not Between | Liegt nicht dazwischen | Numeric filter: value outside range |
| Is Blank | Is blank | Filter: field has no value |
| Is Not Blank | Is not blank | Filter: field has a value |

## User Interface Actions

| English | German | Description |
|---------|--------|-------------|
| **Add** | **Hinzufügen** | Add new item |
| **Edit** | **Bearbeiten** | Edit existing item |
| **Delete** | **Löschen** | Remove item |
| **Save** | **Speichern** | Save changes |
| **Cancel** | **Abbrechen** | Cancel operation |
| **Apply** | **Anwenden** | Apply settings |
| **Run** | **Ausführen** | Execute analysis |
| **Upload** | **Hochladen** | Upload file |
| **Download** | **Herunterladen** | Download data |
| **Share** | **Teilen** | Share content |
| **Duplicate** | **Duplizieren** | Copy item |
| **Rename** | **Umbenennen** | Change name |
| **Import** | **Importieren** | Import data |
| **Export** | **Exportieren** | Export data |
| **Dissolve** | **Zusammenführen** | Merge adjacent features |
| Select All | Alle auswählen | Select all items in a list |

## User Preferences

| English | German | Description |
|---------|--------|-------------|
| **Preferences** | **Einstellungen** | User account preferences |
| Theme | Theme | UI color theme |
| Appearance | Aussehen | Visual appearance settings |
| Light | Hell | Light color theme |
| Dark | Dunkel | Dark color theme |
| Language | Sprache | Interface language |
| Timezone | Zeitzone | User timezone setting |

## Analysis Configuration

| English | German | Description |
|---------|--------|-------------|
| **Settings** | **Einstellungen** | Configuration options |
| Advanced Settings | Erweiterte Einstellungen | Advanced options |
| **Configuration** | **Konfiguration** | Setup parameters |
| **Parameters** | **Parameter** | Analysis parameters |
| Starting Points | Startpunkte | Analysis origin points |
| Reference Layer | Referenz-Layer | Reference data layer |
| Study Area | Untersuchungsgebiet | Analysis boundary |
| Input Layer | Eingabe-Layer | Source data layer |
| Output Layer | Ausgabe-Layer | Result data layer |
| Geometry Column | Geometrie-Spalte | Spatial data column |
| Coordinate System | Koordinatensystem | Spatial reference system |
| CRS | KBS | Coordinate Reference System |
| EPSG Code | EPSG-Code | Standard spatial reference identifier |

## Time & Scheduling

| English | German | Description |
|---------|--------|-------------|
| **Time** | **Zeit** | Time settings |
| Start Time | Startzeit | Beginning time |
| End Time | Endzeit | Ending time |
| Day | Tag | Day selection |
| Weekday | Werktag | Weekday |
| Saturday | Samstag | Saturday |
| Sunday | Sonntag | Sunday |
| Week Time | Wochentag | Day of week |

## Status & Feedback

| English | German | Description |
|---------|--------|-------------|
| **Status** | **Status** | Current state |
| Idle | Inaktiv | Process or node ready to run |
| Pending | Ausstehend | Process queued, not yet started |
| Running | Läuft | Process running |
| Finished | Fertig | Process completed |
| Completed | Abgeschlossen | Process finished successfully |
| Success | Erfolgreich | Successful operation |
| Cancelled | Abgebrochen | Process was cancelled |
| Error | Fehler | Error occurred |
| Failed | Fehlgeschlagen | Process failed |
| **Job Status** | **Job Status** | Analysis job status |

## Units & Measurements

| English | German | Description |
|---------|--------|-------------|
| **Distance** | **Entfernung** | Distance measurement |
| **Speed** | **Geschwindigkeit** | Speed setting |
| **Unit** | **Einheit** | Measurement unit |
| Metric | Metrisch | Metric system |
| Imperial | Imperial | Imperial system |
| **Radius** | **Radius** | Circular distance |
| Meters | Meter | Distance in meters |
| Kilometers | Kilometer | Distance in kilometers |
| Miles | Meilen | Distance in miles |
| Feet | Fuß | Distance in feet |
| Buffer Type | Puffertyp | Type of buffer operation |
| Fixed Distance | Feste Entfernung | Same distance for all features |
| Variable Distance | Variable Entfernung | Different distance per feature |
| Distance Field | Entfernungsfeld | Field containing distance values |
| Cap Style | Endkappen-Stil | Buffer end cap style |
| Join Style | Verbindungs-Stil | Buffer corner style |
| Round | Rund | Rounded buffer style |
| Square | Eckig | Square buffer style |
| Flat | Flach | Flat buffer end style |
| Mitre Limit | Gehrungsgrenze | Mitre join limit parameter |
| Quad Segments | Bogensegmente | Number of segments for curves |

## Data Formats

| English | German | Description |
|---------|--------|-------------|
| **Format** | **Format** | Data format |
| GeoJSON | GeoJSON | Geographic JSON |
| Shapefile | Shapefile | ESRI Shapefile |
| GeoPackage | GeoPackage | OGC GeoPackage |
| CSV | CSV | Comma-separated values |
| KML | KML | Keyhole Markup Language |
| XLSX | XLSX | Excel spreadsheet |
| Parquet | Parquet | Apache Parquet columnar data format |

---

This glossary serves as a comprehensive reference for understanding the German terminology used throughout the GOAT application interface. It helps bridge the gap between English documentation and the German user interface, ensuring consistent understanding across different language contexts.
