import * as maptalks from 'maptalks';
import SphericalMercator from '@mapbox/sphericalmercator';
import KDBush from 'kdbush';
import TileCover from '@mapbox/tile-cover';

const options = {
    maxClusterZoom: 18,
    clusterMarkerSymbol: null,
    markerEvents: {},
    clusterDispersion: false
};

function bboxToPolygon(bbox) {
    const { xmin, ymin, xmax, ymax } = bbox;
    return {
        type: 'Polygon',
        coordinates: [
            [
                [xmin, ymin],
                [xmin, ymax],
                [xmax, ymax],
                [xmax, ymin],
                [xmin, ymin]
            ]
        ]
    };
}

function getMarkerFill(count) {
    let color = 'rgb(135, 196, 240)';
    if (!count) { return color; }
    if (count > 1000) { color = '#1bbc9b'; }
    if (count > 5000) { color = 'rgb(216, 115, 149)'; }
    return color;
}

function getDefaultClusterMarkerSymbol(count) {
    const markerFill = getMarkerFill(count);
    return {
        markerType: 'ellipse',
        markerWidth: 65,
        markerHeight: 65,
        markerFill,
        markerLineWidth: 0,
        markerFillOpacity: 1,
        markerOpacity: 1,
        textSize: 15,
        textName: count,
        textHaloFill: '#000',
        textHaloRadius: 1.2,
        textFill: '#fff'
    };
}

export class TileClusterLayer extends maptalks.VectorLayer {

    constructor(id, options) {
        super(id, options);
        this._tileCache = {};
        this._currentTileCache = {};
        this.merc = new SphericalMercator({
            size: 256
            // antimeridian: true
        });
        this.globalPoints = [];
        this.globalFeatures = [];
        this.kdbush = null;
    }

    _isGeoJSON(geojson) {
        return (geojson && geojson.features && Array.isArray(geojson.features));
    }

    _isEmpty() {
        return this.globalPoints.length === 0;
    }

    setData(geojson) {
        if (!this._isGeoJSON(geojson)) {
            console.error('data is not geojson');
            return this;
        }
        const { features, points } = this._filterGeoJSON(geojson);
        this.globalFeatures = features;
        this.globalPoints = points;
        this.kdbush = new KDBush(points);
        this.clear();
        this._tileCache = {};
        this._currentTileCache = {};
        this._viewChange();
        return this;
    }

    onAdd() {
        super.onAdd();
        const map = this.map || this.getMap();
        if (!map) return this;
        map.on('viewchange', this._viewChange, this);
        this._viewChange();
        return this;
    }

    onRemove() {
        super.onRemove();
        const map = this.map || this.getMap();
        if (!map) return this;
        map.off('viewchange', this._viewChange, this);
        return this;
    }

    _viewChange() {
        if (this._isEmpty()) {
            return this;
        }
        const map = this.getMap();
        if (!map) {
            return this;
        }
        const extent = map.getExtent();
        if (extent.xmin > extent.xmax) {
            extent.xmax = 178;
            // extent.xmin = -180;
            // extent.xmax = 180;
            // extent.ymin = -85;
            // extent.ymax = 85;
        }
        if (extent.ymin > extent.ymax) {
            extent.ymax = 85;
        }
        const polygon = bboxToPolygon(extent);
        const zoom = Math.round(map.getZoom());
        const tiles = TileCover.tiles(polygon, {
            min_zoom: zoom,
            max_zoom: zoom
        });
        this._cluster(tiles);
    }

    _cluster(tiles) {
        if (this._isEmpty()) {
            return this;
        }
        const currentTileCache = this._currentTileCache, tileCache = this._tileCache, merc = this.merc, kdbush = this.kdbush;
        const cache = {};
        tiles.forEach(tile => {
            const [x, y, z] = tile;
            const key = [x, y, z].join('_').toString();
            cache[key] = 1;
            if (currentTileCache[key]) {
                return;
            }
            let clusterResult;
            if (!tileCache[key]) {
                const bbox = merc.bbox(x, y, z);
                const ids = kdbush.range(bbox[0], bbox[1], bbox[2], bbox[3]);
                clusterResult = this._tileCluster(key, ids, z);
            } else {
                clusterResult = tileCache[key];
            }
            if (!currentTileCache[key] && clusterResult.markers.length) {
                this.addGeometry(clusterResult.markers);
            }
            currentTileCache[key] = clusterResult;
        });
        for (const key in currentTileCache) {
            if (!cache[key]) {
                if (currentTileCache[key].markers.length) {
                    this.removeGeometry(currentTileCache[key].markers);
                }
                delete currentTileCache[key];
            }
        }
    }

    _tileCluster(key, ids, zoom) {
        const tileCache = this._tileCache, globalPoints = this.globalPoints, globalFeatures = this.globalFeatures,
            maxZoom = this.options.maxClusterZoom;
        if (!tileCache[key]) {
            tileCache[key] = {
                points: [],
                features: [],
                coordinate: null,
                markers: []
            };
            if (ids.length) {
                const { x, y, points, features } = this._getClusterResult(globalPoints, ids);
                tileCache[key].coordinates = [x, y];
                if (ids.length === 1) {
                    const feature = globalFeatures[ids[0]];
                    tileCache[key].markers = [new maptalks.Marker(tileCache[key].coordinates, {
                        symbol: feature.symbol,
                        properties: feature.properties || {}
                    })];
                } else if (zoom > maxZoom) {
                    tileCache[key].markers = ids.map(id => {
                        const feature = globalFeatures[id];
                        return new maptalks.Marker(globalPoints[id], {
                            symbol: feature.symbol,
                            properties: feature.properties || {}
                        });
                    });
                } else {
                    tileCache[key].markers = [this._getClusterMarker(tileCache[key].coordinates, ids.length, features)];
                }
                this._bindMarkersEvents(tileCache[key].markers);
                tileCache[key].points = points;
                tileCache[key].features = features;
            }
        }
        return tileCache[key];
    }

    _bindMarkersEvents(markers = []) {
        markers.forEach(marker => {
            const properties = marker.getProperties() || {};
            if (properties.isCluster && properties.features && properties.features.length < 100) {
                marker.on('mouseover mouseout', this._clusterDispersion, this);
            }
            for (const eventName in this.options.markerEvents) {
                marker.on(eventName, this.options.markerEvents[eventName]);
            }
        });
        return this;
    }

    _clusterDispersion(e) {
        if (!this.options.clusterDispersion) {
            return this;
        }
        const clusterMarker = e.target;
        if (!clusterMarker._children) {
            const properties = clusterMarker.getProperties() || {};
            const features = properties.features || [];
            if (features.length) {
                clusterMarker._children = features.map(f => {
                    return new maptalks.Marker(f.geometry.coordinate, {
                        symbol: f.symbol,
                        properties: f.properties
                    });
                });
            }
        }
        if (e.type === 'mouseover' && clusterMarker._children && clusterMarker._children.length) {
            this.addGeometry(clusterMarker._children);
        }
        if (e.type === 'mouseout' && clusterMarker._children && clusterMarker._children.length) {
            this.removeGeometry(clusterMarker._children);
        }
    }

    _getClusterMarker(coordinate, count, features) {
        const clusterMarkerSymbol = this.options.clusterMarkerSymbol;
        let symbol;
        if (clusterMarkerSymbol && maptalks.Util.isFunction(clusterMarkerSymbol)) {
            symbol = clusterMarkerSymbol(count);
        }
        if (!symbol) {
            symbol = getDefaultClusterMarkerSymbol(count);
        }
        return new maptalks.Marker(coordinate, {
            symbol,
            properties: {
                isCluster: true,
                features
            }
        });
    }

    _filterGeoJSON(geojson) {
        const points = [], features = [];
        for (let i = 0, len = geojson.features.length; i < len; i++) {
            if (geojson.features[i].geometry.type !== 'Point') {
                continue;
            }
            points.push(geojson.features[i].geometry.coordinates);
            features.push(geojson.features[i]);
        }
        return {
            points,
            features
        };
    }

    _getClusterResult(points, ids) {
        const { globalFeatures } = this;
        const filterPoints = [], features = [];
        let sumX = 0, sumY = 0;
        const len = ids.length;
        for (let i = 0; i < len; i++) {
            const id = ids[i];
            const [x, y] = points[id];
            sumX += x;
            sumY += y;
            filterPoints.push(points[id]);
            features.push(globalFeatures[id]);
        }
        return {
            x: sumX / len,
            y: sumY / len,
            points: filterPoints,
            features
        };
    }
};
TileClusterLayer.mergeOptions(options);
