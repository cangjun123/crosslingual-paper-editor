import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

type GlobalWithJsdom = typeof globalThis & {
  jsdom?: { window: Window & typeof globalThis };
};

const jsdomWindow = (globalThis as GlobalWithJsdom).jsdom?.window;
if (jsdomWindow) {
  Object.defineProperties(globalThis, {
    Storage: { value: jsdomWindow.Storage, configurable: true, writable: true },
    localStorage: { value: jsdomWindow.localStorage, configurable: true, writable: true },
    sessionStorage: { value: jsdomWindow.sessionStorage, configurable: true, writable: true },
  });
}

afterEach(() => {
  cleanup();
});
