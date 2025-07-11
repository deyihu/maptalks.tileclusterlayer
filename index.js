import * as maptalks from 'maptalks';
// import SphericalMercator from '@mapbox/sphericalmercator';
import KDBush from 'kdbush';
import TileCover from 'tile-cover-deyihu';
import tilebelt from 'tile-cover-deyihu/tilebelt';
const tileToBBOX = tilebelt.tileToBBOX;

const options = {
    maxClusterZoom: 18,
    minClusterCount: 2,
    clusterMarkerSymbol: null,
    markerEvents: {},
    clusterDispersion: false,
    dispersionCount: 100,
    dispersionDuration: 300
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
        markerLineWidth: 1,
        markerFillOpacity: 1,
        markerOpacity: 1,
        textSize: 15,
        textName: count,
        textHaloFill: '#000',
        textHaloRadius: 1.2,
        textFill: '#fff'
    };
}

const GLOBALSCALE = 32768, XMAX = 178, YMAX = 85, MAXZOOM = 31, SCALES = [];
for (let i = 0; i < MAXZOOM; i++) {
    SCALES.push(129202.08021 / Math.pow(2, i));
}

function getClosestZoom(scale) {
    for (let i = 0; i < MAXZOOM - 1; i++) {
        const s1 = SCALES[i], s2 = SCALES[i + 1];
        if (s1 === scale) {
            return i;
        }
        if (s2 === scale) {
            return i + 1;
        }
        if (scale < s1 && s2 < scale) {
            const d1 = Math.abs(scale - s1), d2 = Math.abs(scale - s2);
            if (d1 <= d2) {
                return i;
            }
            return i + 1;
        }
    }
}

function fixExtent(extent) {
    const { xmin, ymin, xmax, ymax } = extent;
    extent.xmin = Math.max(-XMAX, xmin);
    extent.ymin = Math.max(-YMAX, ymin);
    extent.xmax = Math.min(XMAX, xmax);
    extent.ymax = Math.min(YMAX, ymax);
}

export class TileClusterLayer extends maptalks.VectorLayer {

    constructor(id, options) {
        options.tileSize = options.tileSize || 256;
        super(id, options);
        this._initTileCache();
        // this.merc = new SphericalMercator({
        //     size: this.options.tileSize
        //     // antimeridian: true
        // });
        this.globalPoints = [];
        this.globalFeatures = [];
        this.kdbush = null;
    }

    onConfig(conf) {
        if (conf) {
            const keys = Object.keys(conf);
            for (let i = 0, len = keys.length; i < len; i++) {
                if (keys[i] in options) {
                    this._init();
                    break;
                }
            }
        }
    }

    _isGeoJSON(geojson) {
        return (geojson && geojson.features && Array.isArray(geojson.features));
    }

    _isEmpty() {
        return this.globalPoints.length === 0;
    }

    _initTileCache() {
        if (!this._globalCache) {
            this._globalCache = new Map();
        }
        if (!this._markerCache) {
            this._markerCache = new Map();
        }
        this._globalCache.clear();
        this._markerCache.clear();
        this._currentTileCache = {};
    }

    _init() {
        this.clear();
        this._initTileCache();
        this._viewChange();
        return this;
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
        this._init();
        return this;
    }

    onAdd() {
        super.onAdd();
        const map = this.map || this.getMap();
        if (!map) return this;
        map.on('viewchange', this._viewChange, this);
        map.on('spatialreferencechange', this._init, this);
        this._viewChange();
        return this;
    }

    onRemove() {
        super.onRemove();
        const map = this.map || this.getMap();
        if (!map) return this;
        map.off('viewchange', this._viewChange, this);
        map.off('spatialreferencechange', this._init, this);
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
        const dispersionMarkers = this.getGeometries().filter(p => {
            return p._isDispersion;
        });
        if (dispersionMarkers) {
            this.removeGeometry(dispersionMarkers);
        }
        const clusterMarkers = [];
        dispersionMarkers.forEach(marker => {
            const clusterParent = marker._clusterParent;
            if (clusterParent && clusterMarkers.indexOf(clusterParent) === -1) {
                clusterMarkers.push(clusterMarkers);
            }
        });
        clusterMarkers.forEach(clusterMarker => {
            this.fire('dispersionend', { marker: clusterMarker, children: clusterMarker._children });
        });
        const extent = map.getExtent();
        if (extent.xmin > extent.xmax) {
            extent.xmax = XMAX;
        }
        if (extent.ymin > extent.ymax) {
            extent.ymax = YMAX;
        }
        const scale = map.getScale();
        if (scale >= GLOBALSCALE) {
            extent.ymin = -YMAX;
            extent.ymax = YMAX;
            extent.xmax = XMAX;
            extent.xmin = -XMAX;
        }
        fixExtent(extent);
        const polygon = bboxToPolygon(extent);
        const zoom = getClosestZoom(map.pixelToDistance(1, 0));
        const tiles = TileCover.tiles(polygon, {
            min_zoom: zoom,
            max_zoom: zoom,
            tileSize: this.options.tileSize
        });
        this._cluster(tiles);
    }

    _cluster(tiles) {
        if (this._isEmpty()) {
            return this;
        }
        this.fire('clusterstart', { geometries: this.getGeometries() });
        const currentTileCache = this._currentTileCache, kdbush = this.kdbush;
        const cache = {};
        const mapZoom = this.getMap().getZoom();
        const isCluster = mapZoom <= this.options.maxClusterZoom;
        // const zoom = Math.ceil(mapZoom);
        const addMarkers = [], removeMarkers = [];
        for (let i = 0, len = tiles.length; i < len; i++) {
            const tile = tiles[i];
            // const [x, y, z] = tile;
            const key = tile.join('_').toString();
            cache[key] = 1;
            // let tileCache = currentTileCache[key];
            // if (tileCache) {
            //     // if (tileCache.clustering === isCluster) {
            //     //     continue;
            //     // } else {
            //     //     if (tileCache.markers.length) {
            //     //         tileCache.markers.forEach(marker => {
            //     //             removeMarkers.push(marker);
            //     //         });
            //     //     }
            //     //     delete currentTileCache[key];
            //     // }
            // }
            let clusterResult;
            const tileCache = this._currentTileCache[key];
            if (!tileCache) {
                // const bbox = merc.bbox(x, y, z);
                const bbox = tileToBBOX(tile, this.options.tileSize);
                // console.log('bbox', bbox);
                const ids = kdbush.range(bbox[0], bbox[1], bbox[2], bbox[3]);
                clusterResult = this._tileCluster(key, ids, mapZoom, isCluster);
            } else {
                clusterResult = tileCache;
            }
            if (!currentTileCache[key] && clusterResult.markers.length) {
                clusterResult.markers.forEach(marker => {
                    addMarkers.push(marker);
                });
            }
            currentTileCache[key] = clusterResult;
        }
        for (const key in currentTileCache) {
            if (!cache[key]) {
                if (currentTileCache[key].markers.length) {
                    currentTileCache[key].markers.forEach(marker => {
                        if (addMarkers.indexOf(marker) === -1) {
                            removeMarkers.push(marker);
                        }
                    });
                }
                delete currentTileCache[key];
            }
        }
        if (addMarkers.length) {
            this.addGeometry(addMarkers);
        }
        if (removeMarkers.length) {
            this.removeGeometry(removeMarkers);
        }
        this.fire('clusterend', { geometries: this.getGeometries() });
    }

    _tileCluster(key, ids, zoom, isCluster) {
        const globalPoints = this.globalPoints, globalFeatures = this.globalFeatures,
            maxZoom = this.options.maxClusterZoom;
        const globalCache = this._globalCache;
        let tileCache = globalCache.get(key);
        if (!tileCache) {
            tileCache = {
                points: [],
                features: [],
                coordinate: null,
                markers: [],
                clustering: true,
                zoom
            };
            globalCache.set(key, tileCache);
            if (ids.length) {
                const { x, y, points, features } = this._getClusterResult(globalPoints, ids);
                tileCache.coordinates = [x, y];
                if (zoom > maxZoom || ids.length < this.options.minClusterCount) {
                    tileCache.markers = ids.map(id => {
                        const feature = globalFeatures[id];
                        const __id = feature.__id;
                        const marker = this._markerCache.get(__id) || new maptalks.Marker(globalPoints[id], {
                            symbol: feature.symbol,
                            properties: feature.properties || {}
                        });
                        if (!this._markerCache.has(__id)) {
                            this._markerCache.set(__id, marker);
                        }
                        return marker;

                    });
                    tileCache.clustering = false;
                } else {
                    tileCache.markers = [this._getClusterMarker(tileCache.coordinates, ids.length, features)];
                }
                this._bindMarkersEvents(tileCache.markers);
                tileCache.points = points;
                tileCache.features = features;
            }
        }
        return tileCache;
    }

    _bindMarkersEvents(markers = []) {
        markers.forEach(marker => {
            if (marker.__clusterEventBind) {
                return;
            }
            const properties = marker.getProperties() || {};
            if (properties.isCluster && properties.features && properties.features.length <= this.options.dispersionCount) {
                // marker.off('click mouseover mouseout', this._clusterDispersion, this);
                marker.on('click mouseover mouseout', this._clusterDispersion, this);
            }
            for (const eventName in this.options.markerEvents) {
                // marker.off(eventName, this.options.markerEvents[eventName]);
                marker.on(eventName, this.options.markerEvents[eventName]);
            }
            marker.__clusterEventBind = true;
        });
        return this;
    }

    _clusterDispersion(e) {
        if (!this.options.clusterDispersion || e.type === 'mouseover') {
            return this;
        }
        const clusterMarker = e.target;
        const center = clusterMarker.getCenter();
        if (!clusterMarker._children) {
            const properties = clusterMarker.getProperties() || {};
            const features = properties.features || [];
            if (features.length) {
                clusterMarker._children = features.map(f => {
                    const coordinates = f.geometry.coordinates;
                    f.properties = f.properties || {};
                    f.properties.offset = [coordinates[0] - center.x, coordinates[1] - center.y];
                    const marker = new maptalks.Marker(center, {
                        symbol: f.symbol,
                        properties: f.properties,
                        zIndex: Infinity
                        // interactive: false
                    });
                    marker.setZIndex(Infinity);
                    marker._isDispersion = true;
                    marker._clusterParent = clusterMarker;
                    return marker;
                });
            }
        } else if (clusterMarker._children) {
            clusterMarker._children.forEach(marker => {
                marker.setCoordinates(center);
            });
        }
        const hasChildren = clusterMarker._children && clusterMarker._children.length;
        if (e.type === 'click' && hasChildren) {
            const children = clusterMarker._children.filter(p => {
                return !p.getLayer();
            });

            if (children.length) {
                this.addGeometry(children);
            }
            this.fire('dispersionstart', { marker: clusterMarker, children: clusterMarker._children });
            clusterMarker._children.filter(p => {
                return p.getLayer();
            }).forEach(marker => {
                marker.animate({
                    // animation translate distance
                    translate: marker.getProperties().offset
                }, {
                    duration: this.options.dispersionDuration
                    // easing: 'upAndDown'
                    // let map focus on the marker
                    // focus: true
                });
            });
        }
        if (e.type === 'mouseout' && hasChildren) {
            clusterMarker._children.forEach(marker => {
                if (marker._animPlayer && marker.getLayer()) {
                    marker._animPlayer.finish();
                }
                marker.setCoordinates(center.copy());
            });
            const removeMarkers = clusterMarker._children.filter(p => {
                if (p && p._animPlayer && p.getLayer()) {
                    delete p._animPlayer;
                    delete p._animationStarted;
                }
                return p.getLayer();
            });
            if (removeMarkers.length) {
                this.removeGeometry(removeMarkers);
                this.fire('dispersionend', { marker: clusterMarker, children: clusterMarker._children });
            }

        }
    }

    _getClusterMarker(coordinate, count, features) {
        const clusterMarkerSymbol = this.options.clusterMarkerSymbol;
        let symbol;
        if (clusterMarkerSymbol && maptalks.Util.isFunction(clusterMarkerSymbol)) {
            symbol = clusterMarkerSymbol(count, features);
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
            geojson.features[i].__id = maptalks.Util.GUID();
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
