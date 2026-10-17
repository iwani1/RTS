import { strict as assert } from "node:assert";
import test from "node:test";
import {
  BOUNDS,
  basemapUrl,
  mercatorY,
  planBasemap,
  project,
  projectRaw,
} from "../src/lib/map-geometry.ts";

/**
 * The map has to be right in two ways: the basemap must not be stretched,
 * and a marker must land on the place it names. Both are arithmetic, so
 * they are checked here rather than by eye.
 */

test("the covered area keeps the shape of the picture that is requested", () => {
  const plan = planBasemap({
    width: 640,
    height: 360,
    token: "pk.test",
    style: "mapbox/dark-v11",
  });

  const mercatorWidth =
    (plan.viewport.maxLng - plan.viewport.minLng) / 360;
  const mercatorHeight =
    mercatorY(plan.viewport.maxLat) - mercatorY(plan.viewport.minLat);

  const areaAspect = mercatorWidth / mercatorHeight;
  const pictureAspect = plan.imageWidth / plan.imageHeight;

  assert.ok(
    Math.abs(areaAspect - pictureAspect) < 0.0005,
    `area aspect ${areaAspect} should match the picture aspect ${pictureAspect}`,
  );
});

test("the picture is requested in coarse steps, so a resize re-uses it", () => {
  const first = planBasemap({ width: 700, height: 380, token: "pk.test", style: "s" });
  const nudged = planBasemap({ width: 706, height: 384, token: "pk.test", style: "s" });
  assert.equal(first.imageWidth, nudged.imageWidth);
  assert.equal(first.imageHeight, nudged.imageHeight);
  assert.equal(first.url, nudged.url);

  // The step is coarse, and the picture is never far from the size asked for.
  const sizes = new Set<string>();
  for (let width = 400; width <= 900; width += 7) {
    const plan = planBasemap({ width, height: 360, token: "pk.test", style: "s" });
    assert.ok(Math.abs(plan.imageWidth - width) <= 80, `image width ${plan.imageWidth} for ${width}`);
    sizes.add(plan.url ?? "");
  }
  assert.ok(sizes.size <= 10, `a resize should not fetch a new picture every time (${sizes.size})`);
});

test("the service area is covered from north to south", () => {
  const plan = planBasemap({ width: 800, height: 400, token: "pk.test", style: "s" });
  assert.equal(plan.viewport.minLat, BOUNDS.minLat);
  assert.equal(plan.viewport.maxLat, BOUNDS.maxLat);
});

test("a marker lands where the map says it does", () => {
  const plan = planBasemap({ width: 800, height: 400, token: "pk.test", style: "s" });
  const { viewport } = plan;

  // The edges of the covered area sit on the edges of the panel.
  const north = projectRaw({ lat: BOUNDS.maxLat, lng: 0 }, viewport);
  assert.ok(Math.abs(north.y - 0) < 0.001, `the north edge was ${north.y}`);
  const south = projectRaw({ lat: BOUNDS.minLat, lng: 0 }, viewport);
  assert.ok(Math.abs(south.y - 100) < 0.001, `the south edge was ${south.y}`);
  const west = projectRaw({ lat: 5.6, lng: viewport.minLng }, viewport);
  assert.ok(Math.abs(west.x - 0) < 0.001, `the west edge was ${west.x}`);
  const east = projectRaw({ lat: 5.6, lng: viewport.maxLng }, viewport);
  assert.ok(Math.abs(east.x - 100) < 0.001, `the east edge was ${east.x}`);

  // Accra (5.6037) is south of the middle latitude of the area (5.625), so it
  // must sit below the middle of the panel.
  const accra = projectRaw({ lat: 5.6037, lng: -0.187 }, viewport);
  assert.ok(accra.y > 50, `Accra should sit below the middle, was ${accra.y}`);
  assert.ok(accra.y < 60, `Accra should sit near the middle, was ${accra.y}`);

  // A point east of the centre must be to the right of it.
  const eastPoint = project({ lat: 5.6, lng: 0.0 }, viewport);
  assert.ok(eastPoint.x > 50, `the east should sit right of the middle, was ${eastPoint.x}`);
});

test("the request carries the area, the size and the token", () => {
  const plan = planBasemap({ width: 800, height: 400, token: "pk.test", style: "mapbox/dark-v11" });
  assert.ok(plan.url);
  assert.match(plan.url, /api\.mapbox\.com\/styles\/v1\/mapbox\/dark-v11\/static\//);
  assert.match(plan.url, /access_token=pk\.test/);
  assert.match(plan.url, new RegExp(`/${plan.imageWidth}x${plan.imageHeight}@2x`));
  assert.match(plan.url, /\[-?[\d.]+,-?[\d.]+,-?[\d.]+,-?[\d.]+\]/);
});

test("without a token there is no request to make", () => {
  const plan = planBasemap({ width: 800, height: 400, token: null, style: "s" });
  assert.equal(plan.url, null);
  assert.equal(
    basemapUrl(plan.viewport, 800, 400, null, "s"),
    null,
  );
});
