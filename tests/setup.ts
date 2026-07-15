import { afterEach } from "vitest";

Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
  configurable: true,
  value() {
    return {
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 200,
      bottom: 280,
      width: 200,
      height: 280,
      toJSON: () => ({}),
    };
  },
});

afterEach(() => {
  document.body.replaceChildren();
  document.documentElement.removeAttribute("style");
});
