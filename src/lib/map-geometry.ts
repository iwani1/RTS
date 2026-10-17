/**
 * The geometry of the map.
 *
 * The live map draws a real basemap under the markers, and the markers have
 * to sit where the vehicles actually are. That means the projection used for
 * the markers and the area requested from the map provider must agree.
 *
 * The rules:
 *  - the projection is Web Mercator, the projection every map on earth uses;
 *  - the area covered is the Greater Accra service area vertically, and as
 *    wide as the panel needs for the picture to keep its shape;
 *  - the picture is requested in coarse steps, so a resize re-uses one of a
 *    handful of images instead of fetching a new one every few pixels.
 */
export const BOUNDS = { minLat: 5.45, maxLat: 5.8, minLng: -0.45, maxLng: 0.05 };

export type Viewport = {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
};

/** Web Mercator, the projection every map on earth uses. */
export function mercatorY(lat: number): number {
  const rad = (lat * Math.PI) / 180;
  return Math.log(Math.tan(Math.PI / 4 + rad / 2));
}

export type BasemapPlan = {
  viewport: Viewport;
  imageWidth: number;
  imageHeight: number;
  url: string | null;
};

/**
 * The area a basemap of this size should cover, and the image to request.
 *
 * The vertical span is the service area. The horizontal span follows the
 * shape of the panel, so the map is never stretched: the requested picture
 * and the covered area always have the same proportions.
 */
export function planBasemap(options: {
  width: number;
  height: number;
  token: string | null;
  style: string;
}): BasemapPlan {
  const imageWidth = Math.min(1280, Math.max(320, Math.round(options.width / 80) * 80));
  const imageHeight = Math.min(1280, Math.max(240, Math.round(options.height / 80) * 80));

  const top = mercatorY(BOUNDS.maxLat);
  const bottom = mercatorY(BOUNDS.minLat);
  const heightUnits = top - bottom;
  const centreLng = (BOUNDS.minLng + BOUNDS.maxLng) / 2;
  // The world is 360 degrees wide, and the Mercator unit is the same on
  // both axes, so the same number describes the horizontal span.
  const widthUnits = heightUnits * (imageWidth / imageHeight);
  const halfDegrees = (widthUnits * 360) / 2;

  const viewport: Viewport = {
    minLat: BOUNDS.minLat,
    maxLat: BOUNDS.maxLat,
    minLng: centreLng - halfDegrees,
    maxLng: centreLng + halfDegrees,
  };

  return {
    viewport,
    imageWidth,
    imageHeight,
    url: basemapUrl(viewport, imageWidth, imageHeight, options.token, options.style),
  };
}

/** The static image that covers exactly this area. */
export function basemapUrl(
  viewport: Viewport,
  imageWidth: number,
  imageHeight: number,
  token: string | null,
  style: string,
): string | null {
  if (!token) return null;
  const bbox = `[${viewport.minLng},${viewport.minLat},${viewport.maxLng},${viewport.maxLat}]`;
  const params = new URLSearchParams({ access_token: token, logo: "false" });
  return `https://api.mapbox.com/styles/v1/${style}/static/${bbox}/${imageWidth}x${imageHeight}@2x?${params.toString()}`;
}

/**
 * Where a point sits on the map, in per cent of the panel.
 *
 * The raw projection is not clamped: it is the honest position, and it is
 * what the basemap is aligned to.
 */
export function projectRaw(
  point: { lat: number; lng: number },
  viewport: Viewport,
): { x: number; y: number } {
  const top = mercatorY(viewport.maxLat);
  const bottom = mercatorY(viewport.minLat);
  const x = ((point.lng - viewport.minLng) / (viewport.maxLng - viewport.minLng)) * 100;
  const y = ((top - mercatorY(point.lat)) / (top - bottom)) * 100;
  return { x, y };
}

/** The same position, kept inside the panel so a marker is never cut off. */
export function project(
  point: { lat: number; lng: number },
  viewport: Viewport,
): { x: number; y: number } {
  const { x, y } = projectRaw(point, viewport);
  return { x: Math.max(2, Math.min(98, x)), y: Math.max(2, Math.min(98, y)) };
}
