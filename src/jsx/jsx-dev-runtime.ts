// Eigene JSX-Laufzeit für den Dev-Server (siehe transform.ts).
import { Fragment, jsxDEV as reactJsxDEV } from "react/jsx-dev-runtime";
import { transformProps } from "./transform";

export { Fragment };
export type { JSX } from "react/jsx-dev-runtime";

export const jsxDEV: typeof reactJsxDEV = (type, props, key, isStatic, source, self) =>
  reactJsxDEV(type, transformProps(type, props as Record<string, unknown>), key, isStatic, source, self);
