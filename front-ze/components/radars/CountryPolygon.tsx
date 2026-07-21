import { useMemo } from 'react';
import { GeoJSON } from 'react-leaflet';

const CountryPolygon = ({ geoJsonData }) => {
    const geoJsonStyle = useMemo(() => ({
        fillColor: 'var(--primary)',
        weight: 2,
        opacity: 1,
        color: 'var(--primary)',
        fillOpacity: 0.3
    }), []);

    const geoJsonOptions = useMemo(() => ({
        style: geoJsonStyle,
        interactive: false, // Make the polygon non-interactive/unclickable
        bubblingMouseEvents: true // Ensure events bubble up to the map
    }), [geoJsonStyle]);

    if (!geoJsonData) {
        return null;
    }

    return (
        <GeoJSON
            data={geoJsonData}
            pathOptions={geoJsonOptions}
        />
    );
};

export default CountryPolygon;