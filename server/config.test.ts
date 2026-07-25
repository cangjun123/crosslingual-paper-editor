// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readServerConfig } from "./config.js";

describe("server configuration", () => {
  it("binds to loopback by default", () => {
    const config = readServerConfig({});
    expect(config.host).toBe("127.0.0.1");
    expect(config.port).toBe(3001);
  });

  it("accepts a container listen address and custom port", () => {
    const config = readServerConfig({ HOST: "0.0.0.0", PORT: "8080" });
    expect(config.host).toBe("0.0.0.0");
    expect(config.port).toBe(8080);
  });

  it("falls back when the port is invalid", () => {
    expect(readServerConfig({ PORT: "70000" }).port).toBe(3001);
    expect(readServerConfig({ PORT: "invalid" }).port).toBe(3001);
  });
});
