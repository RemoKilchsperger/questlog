// Eigene JSX-Laufzeit (siehe transform.ts): wie react/jsx-runtime, nur mit Pixel-Icons statt Emojis.
import { Fragment, jsx as reactJsx, jsxs as reactJsxs } from "react/jsx-runtime";
import { transformProps } from "./transform";

export { Fragment };
export type { JSX } from "react/jsx-runtime";

export const jsx: typeof reactJsx = (type, props, key) => reactJsx(type, transformProps(type, props as Record<string, unknown>), key);
export const jsxs: typeof reactJsxs = (type, props, key) => reactJsxs(type, transformProps(type, props as Record<string, unknown>), key);
