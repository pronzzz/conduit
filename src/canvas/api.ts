import type { NodeKind } from '../core/types';

/** Imperative handle the chrome (palette, menus, zoom buttons) uses to reach the canvas. */
export interface ViewportApi {
  beginPlace(kind: NodeKind, e: PointerEvent): void;
  addAtCenter(kind: NodeKind): void;
  zoomBy(factor: number): void;
  exportPng(): Promise<void>;
}

const noop = () => {};

export const viewport: ViewportApi = {
  beginPlace: noop,
  addAtCenter: noop,
  zoomBy: noop,
  exportPng: async () => {},
};
