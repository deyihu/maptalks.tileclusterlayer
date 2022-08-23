/*!
 * maptalks.tileclusterlayer v0.0.8
  */
(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('maptalks')) :
	typeof define === 'function' && define.amd ? define(['exports', 'maptalks'], factory) :
	(global = global || self, factory(global.maptalks = global.maptalks || {}, global.maptalks));
}(this, function (exports, maptalks) { 'use strict';

	function createCommonjsModule(fn, module) {
		return module = { exports: {} }, fn(module, module.exports), module.exports;
	}

	var sphericalmercator = createCommonjsModule(function (module, exports) {
	var SphericalMercator = (function(){

	// Closures including constants and other precalculated values.
	var cache = {},
	    D2R = Math.PI / 180,
	    R2D = 180 / Math.PI,
	    // 900913 properties.
	    A = 6378137.0,
	    MAXEXTENT = 20037508.342789244;

	function isFloat(n){
	    return Number(n) === n && n % 1 !== 0;
	}

	// SphericalMercator constructor: precaches calculations
	// for fast tile lookups.
	function SphericalMercator(options) {
	    options = options || {};
	    this.size = options.size || 256;
	    this.expansion = (options.antimeridian === true) ? 2 : 1;
	    if (!cache[this.size]) {
	        var size = this.size;
	        var c = cache[this.size] = {};
	        c.Bc = [];
	        c.Cc = [];
	        c.zc = [];
	        c.Ac = [];
	        for (var d = 0; d < 30; d++) {
	            c.Bc.push(size / 360);
	            c.Cc.push(size / (2 * Math.PI));
	            c.zc.push(size / 2);
	            c.Ac.push(size);
	            size *= 2;
	        }
	    }
	    this.Bc = cache[this.size].Bc;
	    this.Cc = cache[this.size].Cc;
	    this.zc = cache[this.size].zc;
	    this.Ac = cache[this.size].Ac;
	}
	// Convert lon lat to screen pixel value
	//
	// - `ll` {Array} `[lon, lat]` array of geographic coordinates.
	// - `zoom` {Number} zoom level.
	SphericalMercator.prototype.px = function(ll, zoom) {
	  if (isFloat(zoom)) {
	    var size = this.size * Math.pow(2, zoom);
	    var d = size / 2;
	    var bc = (size / 360);
	    var cc = (size / (2 * Math.PI));
	    var ac = size;
	    var f = Math.min(Math.max(Math.sin(D2R * ll[1]), -0.9999), 0.9999);
	    var x = d + ll[0] * bc;
	    var y = d + 0.5 * Math.log((1 + f) / (1 - f)) * -cc;
	    (x > ac * this.expansion) && (x = ac * this.expansion);
	    (y > ac) && (y = ac);
	    //(x < 0) && (x = 0);
	    //(y < 0) && (y = 0);
	    return [x, y];
	  } else {
	    var d = this.zc[zoom];
	    var f = Math.min(Math.max(Math.sin(D2R * ll[1]), -0.9999), 0.9999);
	    var x = Math.round(d + ll[0] * this.Bc[zoom]);
	    var y = Math.round(d + 0.5 * Math.log((1 + f) / (1 - f)) * (-this.Cc[zoom]));
	    (x > this.Ac[zoom] * this.expansion) && (x = this.Ac[zoom] * this.expansion);
	    (y > this.Ac[zoom]) && (y = this.Ac[zoom]);
	    //(x < 0) && (x = 0);
	    //(y < 0) && (y = 0);
	    return [x, y];
	  }
	};

	// Convert screen pixel value to lon lat
	//
	// - `px` {Array} `[x, y]` array of geographic coordinates.
	// - `zoom` {Number} zoom level.
	SphericalMercator.prototype.ll = function(px, zoom) {
	  if (isFloat(zoom)) {
	    var size = this.size * Math.pow(2, zoom);
	    var bc = (size / 360);
	    var cc = (size / (2 * Math.PI));
	    var zc = size / 2;
	    var g = (px[1] - zc) / -cc;
	    var lon = (px[0] - zc) / bc;
	    var lat = R2D * (2 * Math.atan(Math.exp(g)) - 0.5 * Math.PI);
	    return [lon, lat];
	  } else {
	    var g = (px[1] - this.zc[zoom]) / (-this.Cc[zoom]);
	    var lon = (px[0] - this.zc[zoom]) / this.Bc[zoom];
	    var lat = R2D * (2 * Math.atan(Math.exp(g)) - 0.5 * Math.PI);
	    return [lon, lat];
	  }
	};

	// Convert tile xyz value to bbox of the form `[w, s, e, n]`
	//
	// - `x` {Number} x (longitude) number.
	// - `y` {Number} y (latitude) number.
	// - `zoom` {Number} zoom.
	// - `tms_style` {Boolean} whether to compute using tms-style.
	// - `srs` {String} projection for resulting bbox (WGS84|900913).
	// - `return` {Array} bbox array of values in form `[w, s, e, n]`.
	SphericalMercator.prototype.bbox = function(x, y, zoom, tms_style, srs) {
	    // Convert xyz into bbox with srs WGS84
	    if (tms_style) {
	        y = (Math.pow(2, zoom) - 1) - y;
	    }
	    // Use +y to make sure it's a number to avoid inadvertent concatenation.
	    var ll = [x * this.size, (+y + 1) * this.size]; // lower left
	    // Use +x to make sure it's a number to avoid inadvertent concatenation.
	    var ur = [(+x + 1) * this.size, y * this.size]; // upper right
	    var bbox = this.ll(ll, zoom).concat(this.ll(ur, zoom));

	    // If web mercator requested reproject to 900913.
	    if (srs === '900913') {
	        return this.convert(bbox, '900913');
	    } else {
	        return bbox;
	    }
	};

	// Convert bbox to xyx bounds
	//
	// - `bbox` {Number} bbox in the form `[w, s, e, n]`.
	// - `zoom` {Number} zoom.
	// - `tms_style` {Boolean} whether to compute using tms-style.
	// - `srs` {String} projection of input bbox (WGS84|900913).
	// - `@return` {Object} XYZ bounds containing minX, maxX, minY, maxY properties.
	SphericalMercator.prototype.xyz = function(bbox, zoom, tms_style, srs) {
	    // If web mercator provided reproject to WGS84.
	    if (srs === '900913') {
	        bbox = this.convert(bbox, 'WGS84');
	    }

	    var ll = [bbox[0], bbox[1]]; // lower left
	    var ur = [bbox[2], bbox[3]]; // upper right
	    var px_ll = this.px(ll, zoom);
	    var px_ur = this.px(ur, zoom);
	    // Y = 0 for XYZ is the top hence minY uses px_ur[1].
	    var x = [ Math.floor(px_ll[0] / this.size), Math.floor((px_ur[0] - 1) / this.size) ];
	    var y = [ Math.floor(px_ur[1] / this.size), Math.floor((px_ll[1] - 1) / this.size) ];
	    var bounds = {
	        minX: Math.min.apply(Math, x) < 0 ? 0 : Math.min.apply(Math, x),
	        minY: Math.min.apply(Math, y) < 0 ? 0 : Math.min.apply(Math, y),
	        maxX: Math.max.apply(Math, x),
	        maxY: Math.max.apply(Math, y)
	    };
	    if (tms_style) {
	        var tms = {
	            minY: (Math.pow(2, zoom) - 1) - bounds.maxY,
	            maxY: (Math.pow(2, zoom) - 1) - bounds.minY
	        };
	        bounds.minY = tms.minY;
	        bounds.maxY = tms.maxY;
	    }
	    return bounds;
	};

	// Convert projection of given bbox.
	//
	// - `bbox` {Number} bbox in the form `[w, s, e, n]`.
	// - `to` {String} projection of output bbox (WGS84|900913). Input bbox
	//   assumed to be the "other" projection.
	// - `@return` {Object} bbox with reprojected coordinates.
	SphericalMercator.prototype.convert = function(bbox, to) {
	    if (to === '900913') {
	        return this.forward(bbox.slice(0, 2)).concat(this.forward(bbox.slice(2,4)));
	    } else {
	        return this.inverse(bbox.slice(0, 2)).concat(this.inverse(bbox.slice(2,4)));
	    }
	};

	// Convert lon/lat values to 900913 x/y.
	SphericalMercator.prototype.forward = function(ll) {
	    var xy = [
	        A * ll[0] * D2R,
	        A * Math.log(Math.tan((Math.PI*0.25) + (0.5 * ll[1] * D2R)))
	    ];
	    // if xy value is beyond maxextent (e.g. poles), return maxextent.
	    (xy[0] > MAXEXTENT) && (xy[0] = MAXEXTENT);
	    (xy[0] < -MAXEXTENT) && (xy[0] = -MAXEXTENT);
	    (xy[1] > MAXEXTENT) && (xy[1] = MAXEXTENT);
	    (xy[1] < -MAXEXTENT) && (xy[1] = -MAXEXTENT);
	    return xy;
	};

	// Convert 900913 x/y values to lon/lat.
	SphericalMercator.prototype.inverse = function(xy) {
	    return [
	        (xy[0] * R2D / A),
	        ((Math.PI*0.5) - 2.0 * Math.atan(Math.exp(-xy[1] / A))) * R2D
	    ];
	};

	return SphericalMercator;

	})();

	{
	    module.exports = exports = SphericalMercator;
	}
	});

	function sortKD(ids, coords, nodeSize, left, right, depth) {
	    if (right - left <= nodeSize) return;

	    const m = (left + right) >> 1;

	    select(ids, coords, m, left, right, depth % 2);

	    sortKD(ids, coords, nodeSize, left, m - 1, depth + 1);
	    sortKD(ids, coords, nodeSize, m + 1, right, depth + 1);
	}

	function select(ids, coords, k, left, right, inc) {

	    while (right > left) {
	        if (right - left > 600) {
	            const n = right - left + 1;
	            const m = k - left + 1;
	            const z = Math.log(n);
	            const s = 0.5 * Math.exp(2 * z / 3);
	            const sd = 0.5 * Math.sqrt(z * s * (n - s) / n) * (m - n / 2 < 0 ? -1 : 1);
	            const newLeft = Math.max(left, Math.floor(k - m * s / n + sd));
	            const newRight = Math.min(right, Math.floor(k + (n - m) * s / n + sd));
	            select(ids, coords, k, newLeft, newRight, inc);
	        }

	        const t = coords[2 * k + inc];
	        let i = left;
	        let j = right;

	        swapItem(ids, coords, left, k);
	        if (coords[2 * right + inc] > t) swapItem(ids, coords, left, right);

	        while (i < j) {
	            swapItem(ids, coords, i, j);
	            i++;
	            j--;
	            while (coords[2 * i + inc] < t) i++;
	            while (coords[2 * j + inc] > t) j--;
	        }

	        if (coords[2 * left + inc] === t) swapItem(ids, coords, left, j);
	        else {
	            j++;
	            swapItem(ids, coords, j, right);
	        }

	        if (j <= k) left = j + 1;
	        if (k <= j) right = j - 1;
	    }
	}

	function swapItem(ids, coords, i, j) {
	    swap(ids, i, j);
	    swap(coords, 2 * i, 2 * j);
	    swap(coords, 2 * i + 1, 2 * j + 1);
	}

	function swap(arr, i, j) {
	    const tmp = arr[i];
	    arr[i] = arr[j];
	    arr[j] = tmp;
	}

	function range(ids, coords, minX, minY, maxX, maxY, nodeSize) {
	    const stack = [0, ids.length - 1, 0];
	    const result = [];
	    let x, y;

	    while (stack.length) {
	        const axis = stack.pop();
	        const right = stack.pop();
	        const left = stack.pop();

	        if (right - left <= nodeSize) {
	            for (let i = left; i <= right; i++) {
	                x = coords[2 * i];
	                y = coords[2 * i + 1];
	                if (x >= minX && x <= maxX && y >= minY && y <= maxY) result.push(ids[i]);
	            }
	            continue;
	        }

	        const m = Math.floor((left + right) / 2);

	        x = coords[2 * m];
	        y = coords[2 * m + 1];

	        if (x >= minX && x <= maxX && y >= minY && y <= maxY) result.push(ids[m]);

	        const nextAxis = (axis + 1) % 2;

	        if (axis === 0 ? minX <= x : minY <= y) {
	            stack.push(left);
	            stack.push(m - 1);
	            stack.push(nextAxis);
	        }
	        if (axis === 0 ? maxX >= x : maxY >= y) {
	            stack.push(m + 1);
	            stack.push(right);
	            stack.push(nextAxis);
	        }
	    }

	    return result;
	}

	function within(ids, coords, qx, qy, r, nodeSize) {
	    const stack = [0, ids.length - 1, 0];
	    const result = [];
	    const r2 = r * r;

	    while (stack.length) {
	        const axis = stack.pop();
	        const right = stack.pop();
	        const left = stack.pop();

	        if (right - left <= nodeSize) {
	            for (let i = left; i <= right; i++) {
	                if (sqDist(coords[2 * i], coords[2 * i + 1], qx, qy) <= r2) result.push(ids[i]);
	            }
	            continue;
	        }

	        const m = Math.floor((left + right) / 2);

	        const x = coords[2 * m];
	        const y = coords[2 * m + 1];

	        if (sqDist(x, y, qx, qy) <= r2) result.push(ids[m]);

	        const nextAxis = (axis + 1) % 2;

	        if (axis === 0 ? qx - r <= x : qy - r <= y) {
	            stack.push(left);
	            stack.push(m - 1);
	            stack.push(nextAxis);
	        }
	        if (axis === 0 ? qx + r >= x : qy + r >= y) {
	            stack.push(m + 1);
	            stack.push(right);
	            stack.push(nextAxis);
	        }
	    }

	    return result;
	}

	function sqDist(ax, ay, bx, by) {
	    const dx = ax - bx;
	    const dy = ay - by;
	    return dx * dx + dy * dy;
	}

	const defaultGetX = p => p[0];
	const defaultGetY = p => p[1];

	class KDBush {
	    constructor(points, getX = defaultGetX, getY = defaultGetY, nodeSize = 64, ArrayType = Float64Array) {
	        this.nodeSize = nodeSize;
	        this.points = points;

	        const IndexArrayType = points.length < 65536 ? Uint16Array : Uint32Array;

	        const ids = this.ids = new IndexArrayType(points.length);
	        const coords = this.coords = new ArrayType(points.length * 2);

	        for (let i = 0; i < points.length; i++) {
	            ids[i] = i;
	            coords[2 * i] = getX(points[i]);
	            coords[2 * i + 1] = getY(points[i]);
	        }

	        sortKD(ids, coords, nodeSize, 0, ids.length - 1, 0);
	    }

	    range(minX, minY, maxX, maxY) {
	        return range(this.ids, this.coords, minX, minY, maxX, maxY, this.nodeSize);
	    }

	    within(x, y, r) {
	        return within(this.ids, this.coords, x, y, r, this.nodeSize);
	    }
	}

	var d2r = Math.PI / 180,
	    r2d = 180 / Math.PI;

	/**
	 * Get the bbox of a tile
	 *
	 * @name tileToBBOX
	 * @param {Array<number>} tile
	 * @returns {Array<number>} bbox
	 * @example
	 * var bbox = tileToBBOX([5, 10, 10])
	 * //=bbox
	 */
	function tileToBBOX(tile) {
	    var e = tile2lon(tile[0] + 1, tile[2]);
	    var w = tile2lon(tile[0], tile[2]);
	    var s = tile2lat(tile[1] + 1, tile[2]);
	    var n = tile2lat(tile[1], tile[2]);
	    return [w, s, e, n];
	}

	/**
	 * Get a geojson representation of a tile
	 *
	 * @name tileToGeoJSON
	 * @param {Array<number>} tile
	 * @returns {Feature<Polygon>}
	 * @example
	 * var poly = tileToGeoJSON([5, 10, 10])
	 * //=poly
	 */
	function tileToGeoJSON(tile) {
	    var bbox = tileToBBOX(tile);
	    var poly = {
	        type: 'Polygon',
	        coordinates: [[
	            [bbox[0], bbox[3]],
	            [bbox[0], bbox[1]],
	            [bbox[2], bbox[1]],
	            [bbox[2], bbox[3]],
	            [bbox[0], bbox[3]]
	        ]]
	    };
	    return poly;
	}

	function tile2lon(x, z) {
	    return x / Math.pow(2, z) * 360 - 180;
	}

	function tile2lat(y, z) {
	    var n = Math.PI - 2 * Math.PI * y / Math.pow(2, z);
	    return r2d * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
	}

	/**
	 * Get the tile for a point at a specified zoom level
	 *
	 * @name pointToTile
	 * @param {number} lon
	 * @param {number} lat
	 * @param {number} z
	 * @returns {Array<number>} tile
	 * @example
	 * var tile = pointToTile(1, 1, 20)
	 * //=tile
	 */
	function pointToTile(lon, lat, z) {
	    var tile = pointToTileFraction(lon, lat, z);
	    tile[0] = Math.floor(tile[0]);
	    tile[1] = Math.floor(tile[1]);
	    return tile;
	}

	/**
	 * Get the 4 tiles one zoom level higher
	 *
	 * @name getChildren
	 * @param {Array<number>} tile
	 * @returns {Array<Array<number>>} tiles
	 * @example
	 * var tiles = getChildren([5, 10, 10])
	 * //=tiles
	 */
	function getChildren(tile) {
	    return [
	        [tile[0] * 2, tile[1] * 2, tile[2] + 1],
	        [tile[0] * 2 + 1, tile[1] * 2, tile[2 ] + 1],
	        [tile[0] * 2 + 1, tile[1] * 2 + 1, tile[2] + 1],
	        [tile[0] * 2, tile[1] * 2 + 1, tile[2] + 1]
	    ];
	}

	/**
	 * Get the tile one zoom level lower
	 *
	 * @name getParent
	 * @param {Array<number>} tile
	 * @returns {Array<number>} tile
	 * @example
	 * var tile = getParent([5, 10, 10])
	 * //=tile
	 */
	function getParent(tile) {
	    return [tile[0] >> 1, tile[1] >> 1, tile[2] - 1];
	}

	function getSiblings(tile) {
	    return getChildren(getParent(tile));
	}

	/**
	 * Get the 3 sibling tiles for a tile
	 *
	 * @name getSiblings
	 * @param {Array<number>} tile
	 * @returns {Array<Array<number>>} tiles
	 * @example
	 * var tiles = getSiblings([5, 10, 10])
	 * //=tiles
	 */
	function hasSiblings(tile, tiles) {
	    var siblings = getSiblings(tile);
	    for (var i = 0; i < siblings.length; i++) {
	        if (!hasTile(tiles, siblings[i])) return false;
	    }
	    return true;
	}

	/**
	 * Check to see if an array of tiles contains a particular tile
	 *
	 * @name hasTile
	 * @param {Array<Array<number>>} tiles
	 * @param {Array<number>} tile
	 * @returns {boolean}
	 * @example
	 * var tiles = [
	 *     [0, 0, 5],
	 *     [0, 1, 5],
	 *     [1, 1, 5],
	 *     [1, 0, 5]
	 * ]
	 * hasTile(tiles, [0, 0, 5])
	 * //=boolean
	 */
	function hasTile(tiles, tile) {
	    for (var i = 0; i < tiles.length; i++) {
	        if (tilesEqual(tiles[i], tile)) return true;
	    }
	    return false;
	}

	/**
	 * Check to see if two tiles are the same
	 *
	 * @name tilesEqual
	 * @param {Array<number>} tile1
	 * @param {Array<number>} tile2
	 * @returns {boolean}
	 * @example
	 * tilesEqual([0, 1, 5], [0, 0, 5])
	 * //=boolean
	 */
	function tilesEqual(tile1, tile2) {
	    return (
	        tile1[0] === tile2[0] &&
	        tile1[1] === tile2[1] &&
	        tile1[2] === tile2[2]
	    );
	}

	/**
	 * Get the quadkey for a tile
	 *
	 * @name tileToQuadkey
	 * @param {Array<number>} tile
	 * @returns {string} quadkey
	 * @example
	 * var quadkey = tileToQuadkey([0, 1, 5])
	 * //=quadkey
	 */
	function tileToQuadkey(tile) {
	    var index = '';
	    for (var z = tile[2]; z > 0; z--) {
	        var b = 0;
	        var mask = 1 << (z - 1);
	        if ((tile[0] & mask) !== 0) b++;
	        if ((tile[1] & mask) !== 0) b += 2;
	        index += b.toString();
	    }
	    return index;
	}

	/**
	 * Get the tile for a quadkey
	 *
	 * @name quadkeyToTile
	 * @param {string} quadkey
	 * @returns {Array<number>} tile
	 * @example
	 * var tile = quadkeyToTile('00001033')
	 * //=tile
	 */
	function quadkeyToTile(quadkey) {
	    var x = 0;
	    var y = 0;
	    var z = quadkey.length;

	    for (var i = z; i > 0; i--) {
	        var mask = 1 << (i - 1);
	        var q = +quadkey[z - i];
	        if (q === 1) x |= mask;
	        if (q === 2) y |= mask;
	        if (q === 3) {
	            x |= mask;
	            y |= mask;
	        }
	    }
	    return [x, y, z];
	}

	/**
	 * Get the smallest tile to cover a bbox
	 *
	 * @name bboxToTile
	 * @param {Array<number>} bbox
	 * @returns {Array<number>} tile
	 * @example
	 * var tile = bboxToTile([ -178, 84, -177, 85 ])
	 * //=tile
	 */
	function bboxToTile(bboxCoords) {
	    var min = pointToTile(bboxCoords[0], bboxCoords[1], 32);
	    var max = pointToTile(bboxCoords[2], bboxCoords[3], 32);
	    var bbox = [min[0], min[1], max[0], max[1]];

	    var z = getBboxZoom(bbox);
	    if (z === 0) return [0, 0, 0];
	    var x = bbox[0] >>> (32 - z);
	    var y = bbox[1] >>> (32 - z);
	    return [x, y, z];
	}

	function getBboxZoom(bbox) {
	    var MAX_ZOOM = 28;
	    for (var z = 0; z < MAX_ZOOM; z++) {
	        var mask = 1 << (32 - (z + 1));
	        if (((bbox[0] & mask) !== (bbox[2] & mask)) ||
	            ((bbox[1] & mask) !== (bbox[3] & mask))) {
	            return z;
	        }
	    }

	    return MAX_ZOOM;
	}

	/**
	 * Get the precise fractional tile location for a point at a zoom level
	 *
	 * @name pointToTileFraction
	 * @param {number} lon
	 * @param {number} lat
	 * @param {number} z
	 * @returns {Array<number>} tile fraction
	 * var tile = pointToTileFraction(30.5, 50.5, 15)
	 * //=tile
	 */
	function pointToTileFraction(lon, lat, z) {
	    var sin = Math.sin(lat * d2r),
	        z2 = Math.pow(2, z),
	        x = z2 * (lon / 360 + 0.5),
	        y = z2 * (0.5 - 0.25 * Math.log((1 + sin) / (1 - sin)) / Math.PI);

	    // Wrap Tile X
	    x = x % z2;
	    if (x < 0) x = x + z2;
	    return [x, y, z];
	}

	var tilebelt = {
	    tileToGeoJSON: tileToGeoJSON,
	    tileToBBOX: tileToBBOX,
	    getChildren: getChildren,
	    getParent: getParent,
	    getSiblings: getSiblings,
	    hasTile: hasTile,
	    hasSiblings: hasSiblings,
	    tilesEqual: tilesEqual,
	    tileToQuadkey: tileToQuadkey,
	    quadkeyToTile: quadkeyToTile,
	    pointToTile: pointToTile,
	    bboxToTile: bboxToTile,
	    pointToTileFraction: pointToTileFraction
	};
	var tilebelt_1 = tilebelt.tileToGeoJSON;
	var tilebelt_2 = tilebelt.tileToBBOX;
	var tilebelt_3 = tilebelt.getChildren;
	var tilebelt_4 = tilebelt.getParent;
	var tilebelt_5 = tilebelt.getSiblings;
	var tilebelt_6 = tilebelt.hasTile;
	var tilebelt_7 = tilebelt.hasSiblings;
	var tilebelt_8 = tilebelt.tilesEqual;
	var tilebelt_9 = tilebelt.tileToQuadkey;
	var tilebelt_10 = tilebelt.quadkeyToTile;
	var tilebelt_11 = tilebelt.pointToTile;
	var tilebelt_12 = tilebelt.bboxToTile;
	var tilebelt_13 = tilebelt.pointToTileFraction;

	var tilebelt$1 = /*#__PURE__*/Object.freeze({
		default: tilebelt,
		__moduleExports: tilebelt,
		tileToGeoJSON: tilebelt_1,
		tileToBBOX: tilebelt_2,
		getChildren: tilebelt_3,
		getParent: tilebelt_4,
		getSiblings: tilebelt_5,
		hasTile: tilebelt_6,
		hasSiblings: tilebelt_7,
		tilesEqual: tilebelt_8,
		tileToQuadkey: tilebelt_9,
		quadkeyToTile: tilebelt_10,
		pointToTile: tilebelt_11,
		bboxToTile: tilebelt_12,
		pointToTileFraction: tilebelt_13
	});

	var tilebelt$2 = ( tilebelt$1 && tilebelt ) || tilebelt$1;

	/**
	 * Given a geometry, create cells and return them in a format easily readable
	 * by any software that reads GeoJSON.
	 *
	 * @alias geojson
	 * @param {Object} geom GeoJSON geometry
	 * @param {Object} limits an object with min_zoom and max_zoom properties
	 * specifying the minimum and maximum level to be tiled.
	 * @returns {Object} FeatureCollection of cells formatted as GeoJSON Features
	 */
	var geojson = function (geom, limits) {
	    return {
	        type: 'FeatureCollection',
	        features: getTiles(geom, limits).map(tileToFeature)
	    };
	};

	function tileToFeature(t) {
	    return {
	        type: 'Feature',
	        geometry: tilebelt$2.tileToGeoJSON(t),
	        properties: {}
	    };
	}

	/**
	 * Given a geometry, create cells and return them in their raw form,
	 * as an array of cell identifiers.
	 *
	 * @alias tiles
	 * @param {Object} geom GeoJSON geometry
	 * @param {Object} limits an object with min_zoom and max_zoom properties
	 * specifying the minimum and maximum level to be tiled.
	 * @returns {Array<Array<number>>} An array of tiles given as [x, y, z] arrays
	 */
	var tiles = getTiles;

	/**
	 * Given a geometry, create cells and return them as
	 * [quadkey](http://msdn.microsoft.com/en-us/library/bb259689.aspx) indexes.
	 *
	 * @alias indexes
	 * @param {Object} geom GeoJSON geometry
	 * @param {Object} limits an object with min_zoom and max_zoom properties
	 * specifying the minimum and maximum level to be tiled.
	 * @returns {Array<String>} An array of tiles given as quadkeys.
	 */
	var indexes = function (geom, limits) {
	    return getTiles(geom, limits).map(tilebelt$2.tileToQuadkey);
	};

	function getTiles(geom, limits) {
	    var i, tile,
	        coords = geom.coordinates,
	        maxZoom = limits.max_zoom,
	        tileHash = {},
	        tiles = [];

	    if (geom.type === 'Point') {
	        return [tilebelt$2.pointToTile(coords[0], coords[1], maxZoom)];

	    } else if (geom.type === 'MultiPoint') {
	        for (i = 0; i < coords.length; i++) {
	            tile = tilebelt$2.pointToTile(coords[i][0], coords[i][1], maxZoom);
	            tileHash[toID(tile[0], tile[1], tile[2])] = true;
	        }
	    } else if (geom.type === 'LineString') {
	        lineCover(tileHash, coords, maxZoom);

	    } else if (geom.type === 'MultiLineString') {
	        for (i = 0; i < coords.length; i++) {
	            lineCover(tileHash, coords[i], maxZoom);
	        }
	    } else if (geom.type === 'Polygon') {
	        polygonCover(tileHash, tiles, coords, maxZoom);

	    } else if (geom.type === 'MultiPolygon') {
	        for (i = 0; i < coords.length; i++) {
	            polygonCover(tileHash, tiles, coords[i], maxZoom);
	        }
	    } else {
	        throw new Error('Geometry type not implemented');
	    }

	    if (limits.min_zoom !== maxZoom) {
	        // sync tile hash and tile array so that both contain the same tiles
	        var len = tiles.length;
	        appendHashTiles(tileHash, tiles);
	        for (i = 0; i < len; i++) {
	            var t = tiles[i];
	            tileHash[toID(t[0], t[1], t[2])] = true;
	        }
	        return mergeTiles(tileHash, tiles, limits);
	    }

	    appendHashTiles(tileHash, tiles);
	    return tiles;
	}

	function mergeTiles(tileHash, tiles, limits) {
	    var mergedTiles = [];

	    for (var z = limits.max_zoom; z > limits.min_zoom; z--) {

	        var parentTileHash = {};
	        var parentTiles = [];

	        for (var i = 0; i < tiles.length; i++) {
	            var t = tiles[i];

	            if (t[0] % 2 === 0 && t[1] % 2 === 0) {
	                var id2 = toID(t[0] + 1, t[1], z),
	                    id3 = toID(t[0], t[1] + 1, z),
	                    id4 = toID(t[0] + 1, t[1] + 1, z);

	                if (tileHash[id2] && tileHash[id3] && tileHash[id4]) {
	                    tileHash[toID(t[0], t[1], t[2])] = false;
	                    tileHash[id2] = false;
	                    tileHash[id3] = false;
	                    tileHash[id4] = false;

	                    var parentTile = [t[0] / 2, t[1] / 2, z - 1];

	                    if (z - 1 === limits.min_zoom) mergedTiles.push(parentTile);
	                    else {
	                        parentTileHash[toID(t[0] / 2, t[1] / 2, z - 1)] = true;
	                        parentTiles.push(parentTile);
	                    }
	                }
	            }
	        }

	        for (i = 0; i < tiles.length; i++) {
	            t = tiles[i];
	            if (tileHash[toID(t[0], t[1], t[2])]) mergedTiles.push(t);
	        }

	        tileHash = parentTileHash;
	        tiles = parentTiles;
	    }

	    return mergedTiles;
	}

	function polygonCover(tileHash, tileArray, geom, zoom) {
	    var intersections = [];

	    for (var i = 0; i < geom.length; i++) {
	        var ring = [];
	        lineCover(tileHash, geom[i], zoom, ring);

	        for (var j = 0, len = ring.length, k = len - 1; j < len; k = j++) {
	            var m = (j + 1) % len;
	            var y = ring[j][1];

	            // add interesction if it's not local extremum or duplicate
	            if ((y > ring[k][1] || y > ring[m][1]) && // not local minimum
	                (y < ring[k][1] || y < ring[m][1]) && // not local maximum
	                y !== ring[m][1]) intersections.push(ring[j]);
	        }
	    }

	    intersections.sort(compareTiles); // sort by y, then x

	    for (i = 0; i < intersections.length; i += 2) {
	        // fill tiles between pairs of intersections
	        y = intersections[i][1];
	        for (var x = intersections[i][0] + 1; x < intersections[i + 1][0]; x++) {
	            var id = toID(x, y, zoom);
	            if (!tileHash[id]) {
	                tileArray.push([x, y, zoom]);
	            }
	        }
	    }
	}

	function compareTiles(a, b) {
	    return (a[1] - b[1]) || (a[0] - b[0]);
	}

	function lineCover(tileHash, coords, maxZoom, ring) {
	    var prevX, prevY;

	    for (var i = 0; i < coords.length - 1; i++) {
	        var start = tilebelt$2.pointToTileFraction(coords[i][0], coords[i][1], maxZoom),
	            stop = tilebelt$2.pointToTileFraction(coords[i + 1][0], coords[i + 1][1], maxZoom),
	            x0 = start[0],
	            y0 = start[1],
	            x1 = stop[0],
	            y1 = stop[1],
	            dx = x1 - x0,
	            dy = y1 - y0;

	        if (dy === 0 && dx === 0) continue;

	        var sx = dx > 0 ? 1 : -1,
	            sy = dy > 0 ? 1 : -1,
	            x = Math.floor(x0),
	            y = Math.floor(y0),
	            tMaxX = dx === 0 ? Infinity : Math.abs(((dx > 0 ? 1 : 0) + x - x0) / dx),
	            tMaxY = dy === 0 ? Infinity : Math.abs(((dy > 0 ? 1 : 0) + y - y0) / dy),
	            tdx = Math.abs(sx / dx),
	            tdy = Math.abs(sy / dy);

	        if (x !== prevX || y !== prevY) {
	            tileHash[toID(x, y, maxZoom)] = true;
	            if (ring && y !== prevY) ring.push([x, y]);
	            prevX = x;
	            prevY = y;
	        }

	        while (tMaxX < 1 || tMaxY < 1) {
	            if (tMaxX < tMaxY) {
	                tMaxX += tdx;
	                x += sx;
	            } else {
	                tMaxY += tdy;
	                y += sy;
	            }
	            tileHash[toID(x, y, maxZoom)] = true;
	            if (ring && y !== prevY) ring.push([x, y]);
	            prevX = x;
	            prevY = y;
	        }
	    }

	    if (ring && y === ring[0][1]) ring.pop();
	}

	function appendHashTiles(hash, tiles) {
	    var keys = Object.keys(hash);
	    for (var i = 0; i < keys.length; i++) {
	        tiles.push(fromID(+keys[i]));
	    }
	}

	function toID(x, y, z) {
	    var dim = 2 * (1 << z);
	    return ((dim * y + x) * 32) + z;
	}

	function fromID(id) {
	    var z = id % 32,
	        dim = 2 * (1 << z),
	        xy = ((id - z) / 32),
	        x = xy % dim,
	        y = ((xy - x) / dim) % dim;
	    return [x, y, z];
	}

	var tileCover = {
		geojson: geojson,
		tiles: tiles,
		indexes: indexes
	};

	const options = {
	    maxClusterZoom: 18,
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

	class TileClusterLayer extends maptalks.VectorLayer {

	    constructor(id, options) {
	        super(id, options);
	        this._tileCache = {};
	        this._currentTileCache = {};
	        this.merc = new sphericalmercator({
	            size: 256
	            // antimeridian: true
	        });
	        this.globalPoints = [];
	        this.globalFeatures = [];
	        this.kdbush = null;
	    }

	    _isGeoJSON(geojson$$1) {
	        return (geojson$$1 && geojson$$1.features && Array.isArray(geojson$$1.features));
	    }

	    _isEmpty() {
	        return this.globalPoints.length === 0;
	    }

	    _init() {
	        this.clear();
	        this._tileCache = {};
	        this._currentTileCache = {};
	        this._viewChange();
	        return this;
	    }

	    setData(geojson$$1) {
	        if (!this._isGeoJSON(geojson$$1)) {
	            console.error('data is not geojson');
	            return this;
	        }
	        const { features, points } = this._filterGeoJSON(geojson$$1);
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
	        const tiles$$1 = tileCover.tiles(polygon, {
	            min_zoom: zoom,
	            max_zoom: zoom
	        });
	        this._cluster(tiles$$1);
	    }

	    _cluster(tiles$$1) {
	        if (this._isEmpty()) {
	            return this;
	        }
	        const currentTileCache = this._currentTileCache, tileCache = this._tileCache, merc = this.merc, kdbush = this.kdbush;
	        const cache = {};
	        const zoom = Math.floor(this.getMap().getZoom());
	        const addMarkers = [], removeMarkers = [];
	        for (let i = 0, len = tiles$$1.length; i < len; i++) {
	            const tile = tiles$$1[i];
	            const [x, y, z] = tile;
	            const key = [x, y, z].join('_').toString();
	            cache[key] = 1;
	            if (currentTileCache[key]) {
	                continue;
	            }
	            let clusterResult;
	            if (!tileCache[key]) {
	                const bbox = merc.bbox(x, y, z);
	                const ids = kdbush.range(bbox[0], bbox[1], bbox[2], bbox[3]);
	                clusterResult = this._tileCluster(key, ids, zoom);
	            } else {
	                clusterResult = tileCache[key];
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
	                        removeMarkers.push(marker);
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
	            if (properties.isCluster && properties.features && properties.features.length <= this.options.dispersionCount) {
	                marker.on('click mouseover mouseout', this._clusterDispersion, this);
	            }
	            for (const eventName in this.options.markerEvents) {
	                marker.on(eventName, this.options.markerEvents[eventName]);
	            }
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
	            this.removeGeometry(clusterMarker._children.filter(p => {
	                if (p && p._animPlayer && p.getLayer()) {
	                    delete p._animPlayer;
	                    delete p._animationStarted;
	                }
	                return p.getLayer();
	            }));
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

	    _filterGeoJSON(geojson$$1) {
	        const points = [], features = [];
	        for (let i = 0, len = geojson$$1.features.length; i < len; i++) {
	            if (geojson$$1.features[i].geometry.type !== 'Point') {
	                continue;
	            }
	            points.push(geojson$$1.features[i].geometry.coordinates);
	            features.push(geojson$$1.features[i]);
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
	}TileClusterLayer.mergeOptions(options);

	exports.TileClusterLayer = TileClusterLayer;

	Object.defineProperty(exports, '__esModule', { value: true });

}));
//# sourceMappingURL=maptalks.tileclusterlayer.js.map
