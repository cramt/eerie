# Eerie

The Electric Engineering Real-Time Interactive Editor.

## Keyboard Shortcuts

All shortcuts are left-hand accessible for mouse+keyboard workflow.

### Modes

| Key | Action |
|-----|--------|
| `Q` | Select mode |
| `W` | Wire mode |
| `E` | Place mode (or start place chord) |
| `Escape` | Cancel / back to select |

### Editing

| Key | Action |
|-----|--------|
| `R` | Rotate selected components |
| `F` | Flip selected components |
| `Delete` / `Backspace` | Delete selection |

### Place Chords

Press `E` then a second key within 500ms to place a specific component:

| Chord | Component |
|-------|-----------|
| `E, R` | Resistor |
| `E, C` | Capacitor |
| `E, X` | Inductor |
| `E, D` | Diode |
| `E, V` | DC Voltage Source |
| `E, A` | DC Current Source |
| `E, G` | Ground |
| `E, T` | NPN Transistor |
| `E, F` | N-MOSFET |
| `E, W` | Op-Amp |

If no second key is pressed, `E` falls back to generic place mode.

### General

| Key | Action |
|-----|--------|
| `Ctrl+A` | Select all |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` | Redo |
| `Ctrl+S` | Save |
| `Ctrl+O` | Open |
