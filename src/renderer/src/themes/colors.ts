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

const neon: ThemeColors = {
  bgCanvas: '#06060a',
  grid: '#12121e',
  gridMajor: '#1e1e33',
  wire: '#e040fb',
  wirePreview: '#e040fb55',
  component: '#e8e0f0',
  componentSelected: '#f06aff',
  pin: '#00ffaa',
  pinHover: '#44ffcc',
  text: '#e8e0f0',
  textSecondary: '#8878aa',
  selection: '#f06aff',
  selectionFill: '#e040fb15',
}

export const THEME_COLORS: Record<Theme, ThemeColors> = {
  neon,
}

export function getThemeColors(theme: Theme): ThemeColors {
  return THEME_COLORS[theme] ?? neon
}
