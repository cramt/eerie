import type { Theme } from '../types'

export interface ThemeColors {
  bgCanvas: string
  grid: string
  gridMajor: string
  wire: string
  wirePreview: string
  component: string
  componentSelected: string
  pin: string
  pinHover: string
  text: string
  textSecondary: string
  selection: string
  selectionFill: string
}

// Workshop Compositor — sRGB equivalents of the OKLCH tokens in
// themes/neon.css, materialized for Konva (which can't read CSS vars).
const workshop: ThemeColors = {
  bgCanvas: '#1c1b1a',          // canvas
  grid: '#252422',              // hairline-soft
  gridMajor: '#2e2c29',         // hairline
  wire: '#dba460',              // signal (muted gold-amber)
  wirePreview: 'rgba(219, 164, 96, 0.40)',
  component: '#e8e3da',         // text-primary
  componentSelected: '#dba460', // signal
  pin: '#7cc6c4',               // probe (cool teal)
  pinHover: '#a3dad8',
  text: '#e8e3da',
  textSecondary: '#b3aca0',     // text-secondary
  selection: '#dba460',
  selectionFill: 'rgba(219, 164, 96, 0.10)',
}

export const THEME_COLORS: Record<Theme, ThemeColors> = {
  neon: workshop,
}

export function getThemeColors(_theme: Theme): ThemeColors {
  return workshop
}
