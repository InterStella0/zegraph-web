import type {LatLngTuple} from "leaflet";

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const MERCATOR_MAX_LAT = 85.0511;
const WORLD_COPIES = [-720, -360, 0, 360, 720];

export const TWILIGHT_ALTITUDES = [0, -6, -12, -18];

export function subsolarPoint(date: Date): { lat: number, lng: number } {
    const n = date.getTime() / 86400000 - 10957.5;
    const meanLongitude = 280.46 + 0.9856474 * n;
    const meanAnomaly = (357.528 + 0.9856003 * n) * RAD;
    const eclipticLongitude = (meanLongitude + 1.915 * Math.sin(meanAnomaly) + 0.02 * Math.sin(2 * meanAnomaly)) * RAD;
    const obliquity = (23.439 - 0.0000004 * n) * RAD;

    const declination = Math.asin(Math.sin(obliquity) * Math.sin(eclipticLongitude));
    const rightAscension = Math.atan2(Math.cos(obliquity) * Math.sin(eclipticLongitude), Math.cos(eclipticLongitude)) * DEG;
    const gmst = 280.46061837 + 360.98564736629 * n;

    return {lat: declination * DEG, lng: wrapLongitude(rightAscension - gmst)};
}

function wrapLongitude(lng: number): number {
    return ((lng + 180) % 360 + 360) % 360 - 180;
}

function capBoundary(centerLat: number, centerLng: number, radius: number, samples: number): LatLngTuple[] {
    const lat0 = centerLat * RAD;
    const lng0 = centerLng * RAD;
    const r = radius * RAD;
    const points: LatLngTuple[] = [];
    let previousLng = centerLng;

    for (let i = 0; i < samples; i++) {
        const bearing = (i / samples) * 2 * Math.PI;
        const lat = Math.asin(Math.sin(lat0) * Math.cos(r) + Math.cos(lat0) * Math.sin(r) * Math.cos(bearing));
        const lng = lng0 + Math.atan2(
            Math.sin(bearing) * Math.sin(r) * Math.cos(lat0),
            Math.cos(r) - Math.sin(lat0) * Math.sin(lat)
        );
        const unwrapped = i === 0 ? lng * DEG : previousLng + wrapLongitude(lng * DEG - previousLng);
        previousLng = unwrapped;
        points.push([lat * DEG, unwrapped]);
    }
    return points;
}

function shifted(ring: LatLngTuple[], offset: number): LatLngTuple[] {
    return ring.map(([lat, lng]) => [lat, lng + offset]);
}

function capPolygon(centerLat: number, centerLng: number, radius: number, samples: number): LatLngTuple[][][] {
    const ring = capBoundary(centerLat, centerLng, radius, samples);

    const firstLng = ring[0][1];
    const lastLng = ring[ring.length - 1][1];
    const step = (lastLng - firstLng) / (ring.length - 1);
    const sweep = lastLng - firstLng + step;

    if (Math.abs(sweep) < 180) {
        const centered = shifted(ring, wrapLongitude(firstLng) - firstLng);
        return WORLD_COPIES.map(offset => [shifted(centered, offset)]);
    }

    const ascending = sweep > 0 ? ring : [...ring].reverse();
    const base = shifted(ascending, wrapLongitude(ascending[0][1]) - ascending[0][1]);
    const band = [-1080, ...WORLD_COPIES].flatMap(offset => shifted(base, offset));
    const poleLat = 90 - centerLat < radius ? MERCATOR_MAX_LAT : -MERCATOR_MAX_LAT;

    band.push([poleLat, band[band.length - 1][1]], [poleLat, band[0][1]]);
    return [[band]];
}

export function nightPolygons(date: Date, altitudes = TWILIGHT_ALTITUDES, samples = 360): LatLngTuple[][][][] {
    const sun = subsolarPoint(date);
    return altitudes.map(altitude => capPolygon(-sun.lat, sun.lng + 180, 90 + altitude, samples));
}
