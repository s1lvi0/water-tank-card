# Water Tank Card

A custom [Home Assistant](https://www.home-assistant.io/) Lovelace card that displays the water level of a tank as a styled vessel: an animated wavy water surface, a measurement scale down the side, a litres readout, a status pill, an optional temperature chip, and an optional **pump control** with a flow animation and a power-correlated fault warning.

Works with any tank — set your own `capacity`, colours and thresholds. It was originally built around the Rototec **NPI4000** tank (Ø171 · H215 · 4050 L usable), which is why several defaults are tuned for a 4050 L vessel.

No build step, no dependencies — a single plain Web Component. Fully configurable from the visual editor **or** YAML.

## Features

- Tank-shaped graphic with a gradient fill and an animated, genuinely wavy surface
- Side scale with configurable step (e.g. every 10 % or 25 %)
- Two dedicated inputs: a **percentage** entity and a **litres** entity
- Status pill (`OK` / `Basso` / `Critico`) with configurable labels and colour thresholds
- Optional temperature chip and arbitrary extra chips
- Optional **pump toggle** (a `switch` entity) with the pump's own icon
- Optional **pump power** reading; when the pump is on but power is below a threshold the pump is shown stopped, the flow line turns red and a warning appears
- Click targets: percentage area, litres, chips, pump name and pump power each open their own entity's more-info dialog
- Respects light/dark themes and the "reduce motion" system setting
- Visual (UI) editor and YAML, kept in sync

## Installation

### HACS (recommended)

1. In Home Assistant go to **HACS**.
2. Top-right menu (⋮) → **Custom repositories**.
3. Paste your repository URL (e.g. `https://github.com/<you>/water-tank-card`), choose category **Dashboard**, and add it.
4. Find **Water Tank Card** in HACS and click **Download**.
5. HACS adds the dashboard resource automatically. If it doesn't, add it manually under **Settings → Dashboards → ⋮ → Resources**:
   - URL: `/hacsfiles/water-tank-card/water-tank-card.js`
   - Type: **JavaScript module**
6. Reload your browser (Ctrl/Cmd + F5) and add the card to a dashboard.

> **Tip:** create at least one GitHub **Release** (e.g. `v1.0.0`) so HACS shows a version to install.

### Manual

1. Copy `water-tank-card.js` to `<config>/www/water-tank-card.js`.
2. **Settings → Dashboards → ⋮ → Resources → Add resource**
   - URL: `/local/water-tank-card.js`
   - Type: **JavaScript module**
3. Hard-refresh the browser and add the card.

## Usage

Minimum configuration:

```yaml
type: custom:water-tank-card
percentage_entity: sensor.serbatoio_percentuale
liters_entity: sensor.serbatoio_litri
```

A fuller example:

```yaml
type: custom:water-tank-card
percentage_entity: sensor.serbatoio_percentuale
liters_entity: sensor.serbatoio_litri
name: Serbatoio Garage
capacity: 4050
scale_step: 25
size: 150
warn: 25
low: 15
water_color: "#2f87c9"
temperature_entity: sensor.serbatoio_temperatura
pump_entity: switch.pompa_giardino
pump_power_entity: sensor.pompa_potenza
power_threshold: 10
tap_action: more-info
```

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `percentage_entity` | string | **required** | Sensor reporting the level in % (0–100). Drives the fill, the big %, and the status. |
| `liters_entity` | string | **required** | Sensor reporting the current volume in litres. Drives the readout. |
| `capacity` | number | `4050` | Full volume used in the "… di N L" readout. |
| `name` | string | `Serbatoio` | Card title. |
| `show_name` | boolean | `true` | Show the title. |
| `show_percentage` | boolean | `true` | Show the big percentage. |
| `show_liters` | boolean | `true` | Show the litres readout. |
| `show_status` | boolean | `true` | Show the status pill. |
| `show_scale` | boolean | `true` | Show the side scale. |
| `show_waves` | boolean | `true` | Animated wavy surface (off = flat fill). |
| `show_bubbles` | boolean | `true` | Rising bubbles. |
| `animate` | boolean | `true` | Master switch for all motion. |
| `size` | number | `140` | Tank graphic width in px. |
| `scale_step` | number | `25` | A scale tick every N percent. |
| `decimals` | number | `0` | Decimals on the litres readout. |
| `chip_decimals` | number | `1` | Rounding for numeric chips (e.g. temperature). |
| `warn` | number | `25` | % at/below which the fill turns amber (`Basso`). |
| `low` | number | `15` | % at/below which the fill turns red (`Critico`). |
| `water_color` | string | `#2f87c9` | Healthy fill colour (hex). |
| `warn_color` | string | `#e0a32e` | Amber fill colour (hex). |
| `low_color` | string | `#d8513a` | Red fill colour (hex). |
| `status_labels` | object | `{ok, warn, low}` | Custom pill labels: `ok`, `warn`, `low`. |
| `temperature_entity` | string | – | Optional sensor shown as a chip. |
| `extra_entities` | list | – | Extra chips: `entity`, optional `name`, `icon`. |
| `pump_entity` | string | – | Optional `switch`; renders an on/off toggle. |
| `pump_power_entity` | string | – | Optional power sensor (W) shown in the pump row. |
| `power_threshold` | number | `10` | W below which an ON pump is flagged as faulty (pump shown stopped, flow line red, warning icon). |
| `pump_name` | string | `Pompa` | Label for the pump toggle. |
| `pump_icon` | string | – | Icon override; if omitted the switch entity's own icon is used. |
| `pump_fault_label` | string | `Anomalia` | Tooltip on the fault warning icon. |
| `tap_action` | string | `more-info` | `more-info` opens the percentage entity; `none` disables. |

### Two entities

The card needs the level both as a percentage and in litres. If your sensor only provides one of them, derive the other with a small template sensor. For example, litres from a percentage (4050 L tank):

```yaml
template:
  - sensor:
      - name: Serbatoio litri
        unit_of_measurement: L
        state: "{{ (states('sensor.serbatoio_percentuale') | float(0)) / 100 * 4050 }}"
```

> A vertical tank's depth-to-volume relationship is roughly linear in the middle but not at the rounded top and bottom. For accurate litres, calibrate against known added volumes rather than a pure linear formula.

## License

[MIT](LICENSE)
