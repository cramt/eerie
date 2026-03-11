import _pinData from "../../../pin-definitions.json";

export interface PinMeta {
  name: string;
  file_alias?: string;
}

type PinDataShape = Record<string, PinMeta[]>;

export const PIN_DEFINITIONS: PinDataShape = _pinData;

export const FILE_PIN_TO_UI: Record<string, Record<string, string>> =
  Object.fromEntries(
    Object.entries(PIN_DEFINITIONS).map(([kind, pins]) => [
      kind,
      Object.fromEntries(
        pins.filter((p) => p.file_alias).map((p) => [p.file_alias!, p.name])
      ),
    ])
  );

export const UI_PIN_TO_FILE: Record<string, Record<string, string>> =
  Object.fromEntries(
    Object.entries(PIN_DEFINITIONS).map(([kind, pins]) => [
      kind,
      Object.fromEntries(
        pins.filter((p) => p.file_alias).map((p) => [p.name, p.file_alias!])
      ),
    ])
  );
