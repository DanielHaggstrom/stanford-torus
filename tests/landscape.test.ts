import assert from "node:assert/strict";
import test from "node:test";
import { requestLandscape } from "../src/landscape.ts";
import type { LandscapeHost } from "../src/landscape.ts";

test("browsers without fullscreen or orientation lock keep the rotate fallback", async () => {
  const host: LandscapeHost = { fullscreenElement: null, documentElement: {} };
  assert.deepEqual(await requestLandscape(host, undefined), { fullscreen: false, locked: false });
  assert.deepEqual(await requestLandscape(host, {}), { fullscreen: false, locked: false });
});

test("fullscreen completes before orientation lock and hides browser navigation", async () => {
  const events: string[] = [];
  const host: LandscapeHost = {
    fullscreenElement: null,
    documentElement: {
      async requestFullscreen(options) {
        assert.deepEqual(options, { navigationUI: "hide" });
        events.push("fullscreen");
        await Promise.resolve();
        host.fullscreenElement = {};
      },
    },
  };
  const result = await requestLandscape(host, {
    async lock(orientation) {
      assert.equal(orientation, "landscape");
      assert.ok(host.fullscreenElement);
      events.push("lock");
    },
  });
  assert.deepEqual(events, ["fullscreen", "lock"]);
  assert.deepEqual(result, { fullscreen: true, locked: true });
});

test("already fullscreen pages only request the landscape lock", async () => {
  const host: LandscapeHost = {
    fullscreenElement: {},
    documentElement: { async requestFullscreen() { assert.fail("already fullscreen"); } },
  };
  assert.deepEqual(await requestLandscape(host, { async lock() {} }), {
    fullscreen: true, locked: true,
  });
});

test("a denied fullscreen request still allows standalone orientation lock", async () => {
  const host: LandscapeHost = {
    fullscreenElement: null,
    documentElement: { async requestFullscreen() { throw new Error("denied"); } },
  };
  assert.deepEqual(await requestLandscape(host, { async lock() {} }), {
    fullscreen: false, locked: true,
  });
});

test("orientation lock can work without a fullscreen API", async () => {
  const host: LandscapeHost = { fullscreenElement: null, documentElement: {} };
  assert.deepEqual(await requestLandscape(host, { async lock() {} }), {
    fullscreen: false, locked: true,
  });
});

test("rejected fullscreen and orientation requests resolve safely", async () => {
  const events: string[] = [];
  const host: LandscapeHost = {
    fullscreenElement: null,
    documentElement: {
      async requestFullscreen() {
        events.push("fullscreen");
        throw new Error("denied");
      },
    },
  };
  const result = await requestLandscape(host, {
    async lock() {
      events.push("lock");
      throw new Error("unsupported");
    },
  });
  assert.deepEqual(events, ["fullscreen", "lock"]);
  assert.deepEqual(result, { fullscreen: false, locked: false });
});
