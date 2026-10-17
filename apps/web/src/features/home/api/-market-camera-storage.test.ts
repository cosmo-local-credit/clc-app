import { beforeEach, describe, expect, it } from "vite-plus/test";

import { clearMarketCamera, readMarketCamera, writeMarketCamera } from "./market-camera-storage";

const CAMERA = { owner: "0xabc", index: 2, lat: -3.63, lng: 39.85, zoom: 15, fitKey: "art" };

beforeEach(() => window.sessionStorage.clear());

describe("market camera storage", () => {
  it("gives the view back to its owner only", () => {
    writeMarketCamera(CAMERA);

    expect(readMarketCamera("0xabc")).toEqual(CAMERA);
    expect(readMarketCamera("guest")).toBeNull();
  });

  it("keeps it for the tab, not the device", () => {
    writeMarketCamera(CAMERA);

    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(1);
  });

  it("ignores a malformed or out-of-range view", () => {
    window.sessionStorage.setItem("clc.market-camera.v1", "{");
    expect(readMarketCamera("0xabc")).toBeNull();

    writeMarketCamera({ ...CAMERA, lat: 120 });
    expect(readMarketCamera("0xabc")).toBeNull();
  });

  it("forgets it on request", () => {
    writeMarketCamera(CAMERA);
    clearMarketCamera();

    expect(readMarketCamera("0xabc")).toBeNull();
  });
});
