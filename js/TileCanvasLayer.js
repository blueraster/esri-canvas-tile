/**
* Base canvas layer module
* @return TileCanvasLayer {class} (extends esri/layers/layer)
*/
define([
  'dojo/_base/lang',
  'dojo/_base/declare',
  'dojo/dom-construct',
  'esri/layers/layer',
  'esri/geometry/Point',
  'esri/geometry/screenUtils',
  'esri/SpatialReference'
], function (lang, declare, domConstruct, Layer, Point, screenUtils, SpatialReference) {

  /**
  * This may need to change if the spatial reference is not
  */
  var TILE_INFO = {
    rows: 256,
    cols: 256,
    origin: {
      x: -20037508.34,
      y: 20037508.34
    }
  };

  /**
  * Default Values
  */
  var DEFAULTS = {
    urlTemplate: 'http://wri-tiles.s3.amazonaws.com/glad_test/test2/{z}/{x}/{y}.png',
    minDateValue: 15000,
    maxDateValue: 16365,
    confidence: [0, 1],
    tileSize: 256,
    maxZoom: 12
  };

  /**
  * @description Simple check for canvas support
  * @return {boolean}
  */
  function supportsCanvas () {
    var canvas = document.createElement('canvas');
    return canvas && canvas.getContext && canvas.getContext('2d');
  }

  /**
  * @description Calculate the tile row this should reside in
  * @return {number} tile coordinate
  */
  function getRow (yValue, resolution) {
    var sizeInMapUnits = TILE_INFO.rows * resolution;
    return Math.floor((TILE_INFO.origin.y - yValue) / sizeInMapUnits);
  }

  /**
  * @description Calculate the tile column this should reside in
  * @return {number} tile coordinate
  */
  function getColumn (xValue, resolution) {
    var sizeInMapUnits = TILE_INFO.rows * resolution;
    return Math.floor((xValue - TILE_INFO.origin.x) / sizeInMapUnits);
  }

  /**
  * @description Get an array of tile infos so I know what tiles are needed for this extent
  * @return {object[]} - array of objects containing the x, y, and z properties
  */
  function getTileInfos (rowMin, colMin, rowMax, colMax, level) {
    var infos = [], row, col;
    for (col = colMin; col <= colMax; col++) {
      for (row = rowMin; row <= rowMax; row++) {
        infos.push({ x: col, y: row, z: level });
      }
    }
    return infos;
  }

  /**
  * Taken from http://gis.stackexchange.com/questions/17278/calculate-lat-lon-bounds-for-individual-tile-generated-from-gdal2tiles
  * @description Get the longitude for the top left corner of the tile
  * @return {number} longitude
  */
  function getLongFromTile (col, zoom) {
    return col / Math.pow(2, zoom) * 360 - 180;
  }

  /**
  * Taken from http://gis.stackexchange.com/questions/17278/calculate-lat-lon-bounds-for-individual-tile-generated-from-gdal2tiles
  * @description Get the latitude for the top left corner of the tile
  * @return {number} latitude
  */
  function getLatFromTile (row, zoom) {
    var n = Math.PI - Math.PI * 2 * row / Math.pow(2, zoom);
    return (180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))));
  }


  /**
  * @description Decode Dates from raw data
  * @param {number[]} pixel - Pixel is an array of values representing the rgba of the pixel
  */
  var decodeDate = function decodeDate (pixel) {
    // Find the total days of the pixel by multiplying the red band by 255 and adding the green band
    var totalDays = (pixel[0] * 255) + pixel[1];
    // Dived the total days by 365 to get the year offset, add 15 to this to get current year
    // Example, parseInt(totalDays / 365) = 1, add 15, year is 2016
    var yearAsInt = parseInt(totalDays / 365) + 15;
    // Multiple by 1000 to get in YYDDD format, i.e. 15000 or 16000
    var year = yearAsInt * 1000;
    // Add the remaining days to get the julian day for that year
    var julianDay = totalDays % 365;
    // Add julian to year to get the data value
    var date = year + julianDay;
    // Convert the blue band to a string and pad with 0's to three digits
    // It's rarely not three digits, except for cases where there is an intensity value and no date/confidence.
    // This is due to bilinear resampling
    var band3Str = pad(pixel[2]);
    // Parse confidence, confidence is stored as 1/2, subtract 1 so it's values are 0/1
    var confidence = parseInt(band3Str[0]) - 1;
    // Parse raw intensity to make it visible, it is the second and third character in blue band, it's range is 1 - 55
    var rawIntensity = parseInt(band3Str.slice(1, 3));
    // Scale it to make it visible
    var intensity = rawIntensity * 50;
    // Prevent intensity from being higher then the max value
    if (intensity > 255) { intensity = 255; }
    // Return all components needed for filtering/labeling
    return {
      confidence: confidence,
      intensity: intensity,
      date: date
    };
  };

  /**
  * @description Simple left-pad function
  */
  function pad (number) {
    var str = '00' + number;
    return str.slice(str.length - 3);
  }

  /**
  * @description Simple method to return a valid css translate3d string
  */
  function getTranslate (position) {
    return 'translate3d(' + position.x + 'px, ' + position.y + 'px, 0)';
  }

  return declare('TileCanvasLayer', [Layer], {
    /**
    * @description Override Esri Constructor
    */
    constructor: function constructor (options) {
      //- Mixin provided options with the defaults
      this.options = lang.mixin(DEFAULTS, options);
      //- Set Esri Layer Properties
      this.loaded = this.options.loaded || true;
      this.visible = this.options.visible || true;
      //- Create a cache to optimize this layer
      this.tiles = {};
      this.position = { x: 0, y: 0 };
      //- Log if canvas is not supported
      if (!supportsCanvas()) {
        console.error('Your browser does not support canvas');
      }

      this.onLoad(this);
    },

    /**
    * @description Override _setMap method, called when the layer is added to the map
    * @return {Element} must return a HTML element
    */
    _setMap: function _setMap (map, container) {
      this._map = map;
      //- Create a div to contain all the canvas tiles
      this._container = document.createElement('div');
      this._container.style.display = this.visible ? 'block' : 'none';
      this._container.style.transform = getTranslate(this.position);
      this._container.style.position = 'absolute';
      this._container.style.height = '100%';
      this._container.style.width = '100%';
      this._container.style.left = 0;
      this._container.style.top = 0;
      //- Set up a listener to fetch tiles
      map.on('extent-change', this._extentChanged.bind(this));
      map.on('pan', this._onPan.bind(this));
      map.on('pan-end', this._onPanEnd.bind(this));
      map.on('zoom-start', this._reset.bind(this));
      return this._container;
    },

    /**
    * @description Override _unsetMap method, called when the layer is removed from the map
    */
    _unsetMap: function _unsetMap (map, container) {
      this._map = null;
    },

    /**
    * @description Method for start the process for rendering canvases as tiles
    */
    _extentChanged: function _extentChanged () {
      if (!this.visible) { return; }

      var resolution = this._map.getResolution(),
          level = this._map.getLevel(),
          extent = this._map.extent,
          rowMin, rowMax,
          colMin, colMax,
          tileInfos;

      //- Get the bounds of the tiles row and columns from extent, tileInfo, and resolution
      rowMin = getRow(extent.ymax, resolution); // These two seem to be reversed??, May need to check something on that
      rowMax = getRow(extent.ymin, resolution);
      colMin = getColumn(extent.xmin, resolution);
      colMax = getColumn(extent.xmax, resolution);

      //- If the zoom level is greater than the max zoom, get scaled values
      if (level > this.options.maxZoom) {
        var steps = this._getZoomSteps(level);
        var min = this._getScaledCoords(colMin, rowMin, steps);
        var max = this._getScaledCoords(colMax, rowMax, steps);
        level = this.options.maxZoom;
        colMin = min[0] - 1;
        rowMin = min[1] - 1;
        colMax = max[0] + 1;
        rowMax = max[1] + 1;
      }

      //- Get a range of tiles I need for this extent
      tileInfos = getTileInfos(rowMin, colMin, rowMax, colMax, level);
      //- Get the tile and update the map
      tileInfos.forEach(function (info) {
        this._getCanvasTile(info);
      }, this);
    },

    /**
    * @description Get the tile from the cache or from the server if not cached
    * @return {object} canvasData
    */
    _getCanvasTile: function _getCanvasTile (info) {
      var id = this._getTileId(info),
          canvas, data, url;

      // Return if their is a cached tile
      if (this.tiles[id]) {
        this._drawCanvasTile(this.tiles[id]);
        return;
      }

      url = this._getTileUrl(info);
      this._getImage(url, function (image) {
        // Create the canvas element for the tile, will need to set position on it later
        canvas = document.createElement('canvas');
        canvas.height = this.options.tileSize;
        canvas.width = this.options.tileSize;
        canvas.style.position = 'absolute';
        canvas.setAttribute('id', id);

        data = {
          canvas: canvas,
          image: image,
          x: info.x,
          y: info.y,
          z: info.z,
          id: id
        };

        this._cacheTile(data);
        this._drawCanvasTile(data);
      }.bind(this));
    },

    /**
    * @description Takes some canvas data and add it to the map
    */
    _drawCanvasTile: function _drawCanvasTile (canvasData) {
      'use asm';
      var longitude = getLongFromTile(canvasData.x, canvasData.z),
          latitude = getLatFromTile(canvasData.y, canvasData.z),
          coords = this._map.toScreen(new Point(longitude, latitude)),
          realZoom = this._map.getLevel(),
          canvas = canvasData.canvas,
          sX, sY, sWidth, sHeight,
          currentPosition,
          imageData,
          context,
          steps;

      //- Put the canvas in the correct position and append it to the container
      if (!canvas.parentElement) {
        context = canvas.getContext('2d');
        currentPosition = {
          x: Math.abs(this.position.x) + coords.x,
          y: Math.abs(this.position.y) + coords.y
        };
        canvas.style.transform = getTranslate(currentPosition);
        //- Scale the tile if we are past maxZoom
        if (realZoom > this.options.maxZoom) {
          steps = this._getZoomSteps(realZoom);
          // sX = (256 / Math.pow(2, steps) * (canvasData.x % Math.pow(2, steps)));
          // sY = (256 / Math.pow(2, steps) * (canvasData.y % Math.pow(2, steps)));
          // sWidth = (256 / Math.pow(2, steps));
          // sHeight = (256 / Math.pow(2, steps));

          canvas.height = canvas.width = (256 * Math.pow(2, steps));
          canvasData.image.style.width = (256 * Math.pow(2, steps));
          canvasData.image.style.height = (256 * Math.pow(2, steps));
          context.imageSmoothingEnabled = false;
          context.mozImageSmoothingEnabled = false;
          context.drawImage(canvasData.image, 0, 0, canvas.width, canvas.height);
          // context.imageSmoothingEnabled = false;
          // context.mozImageSmoothingEnabled = false;
          // context.drawImage(canvasData.image, sX, sY, sWidth, sHeight, 0, 0, 256, 256);
        } else {
          context.drawImage(canvasData.image, 0, 0);
        }

        imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        imageData.data = this.filterData(imageData.data, this.options.confidence);
        context.putImageData(imageData, 0, 0);
        this._container.appendChild(canvas);
      }
    },

    /**
    * @description Filters the image data in the current tile cache
    * You should call this after you update any properties used in the filterData function
    * For this Glad Layer, it is maxDateValue, minDateValue, and confidence,
    */
    _refreshTiles: function _refreshTiles () {
      Object.keys(this.tiles).forEach(function (key) {
        var tile = this.tiles[key];
        var context = tile.canvas.getContext('2d');
        context.drawImage(tile.image, 0, 0, tile.canvas.width, tile.canvas.height);
        var imageData = context.getImageData(0, 0, tile.canvas.width, tile.canvas.height);
        imageData.data = this.filterData(imageData.data, this.options.confidence);
        context.putImageData(imageData, 0, 0);
      }, this);
    },

    /**
    * @description Return url for the tile
    * @return {string}
    */
    _getTileUrl: function _getTileUrl (tile) {
      return this.options.urlTemplate.replace('{x}', tile.x).replace('{y}', tile.y).replace('{z}', tile.z);
    },

    /**
    * Fetch the tile image and pass it back through the callback
    */
    _getImage: function _getImage (url, callback) {
      var xhr = new XMLHttpRequest();

      xhr.onload = function () {
        var objecturl = URL.createObjectURL(this.response);
        var image = new Image();

        image.onload = function () {
          callback(image);
          URL.revokeObjectURL(objecturl);
        };
        image.src = objecturl;
      };

      xhr.open('GET', url, true);
      xhr.responseType = 'blob';
      xhr.send();
    },

    /**
    * @description Clear the context of the canvas
    */
    _onPan: function _onPan (evt) {
      var delta = evt.delta;
      //- Update the current position
      this._container.style.transform = getTranslate({
        x: this.position.x + delta.x,
        y: this.position.y + delta.y
      });
    },

    _onPanEnd: function _onPanEnd (evt) {
      var delta = evt.delta;
      this.position = {
        x: this.position.x + delta.x,
        y: this.position.y + delta.y
      };
    },

    _reset: function _reset () {
      // Delete tiles from other zoom levels
      Object.keys(this.tiles).forEach(function (key) {
        this.tiles[key].canvas.remove();
        delete this.tiles[key];
      }, this);
      // Reset the position
      this.position = { x: 0, y: 0 };
      this._container.style.transform = getTranslate(this.position);
    },

    /**
    * @description Return unique id for the tile
    * @return {string} id for the tile
    */
    _getTileId: function _getTileId (tile) {
      return tile.x + '_' + tile.y + '_' + tile.z;
    },

    /**
    * @description Cache the tile based on its unique id
    */
    _cacheTile: function _cacheTile (data) {
      this.tiles[data.id] = data;
    },

    /**
    * @description Get tile locations for tiles when the map is zoomed past the max zoom
    */
    _getScaledCoords: function _getScaledCoords (x, y, steps) {
      x = Math.floor(x / Math.pow(2, steps));
      y = Math.floor(y / Math.pow(2, steps));
      return [x, y];
    },

    /**
    * @description Get number of levels past max zoom
    */
    _getZoomSteps: function _getZoomSteps (level) {
      return level - this.options.maxZoom;
    },

    //////////////////////////////////////////////////////
    // Methods that should be in a Class that extends   //
    // this one so we can make this class more flexible //
    //////////////////////////////////////////////////////
    /**
    * @description Filter the data, this should be removed and implemented by a parent layer that extends this layer
    * @return {array} imageData
    */
    filterData: function filterData (data, confidence) {
      for (var i = 0; i < data.length; i += 4) {
        // Decode the rgba/pixel so I can filter on confidence and date ranges
        var slice = [data[i], data[i + 1], data[i + 2]];
        var values = decodeDate(slice);
        //- Check against confidence, min date, and max date
        if (
          values.date >= this.options.minDateValue &&
          values.date <= this.options.maxDateValue &&
          confidence.indexOf(values.confidence) > -1
        ) {
          // Set the alpha to the intensity
          data[i + 3] = values.intensity;
          // Make the pixel pink for glad alerts
          // Note, this may mess up the decode date function if it's called at a future date as the decoded information comes from the pixel
          data[i] = 220; // R
          data[i + 1] = 102; // G
          data[i + 2] = 153; // B
        } else {
          // Hide the pixel
          data[i + 3] = 0;
        }
      }
      return data;
    },

    ////////////////////
    // PUBLIC METHODS //
    ////////////////////
    setDateRange: function setDateRange (minDate, maxDate) {
      this.options.minDateValue = parseInt(minDate);
      this.options.maxDateValue = parseInt(maxDate);
      this._refreshTiles();
    },

    setConfidenceLevel: function setConfidenceLevel (confidence) {
      this.options.confidence = confidence === 'all' ? [0, 1] : [1];
      this._refreshTiles();
    },

    show: function show () {
      this.visible = true;
      this._container.style.display = 'block';
    },

    hide: function hide () {
      this.visible = false;
      this._container.style.display = 'none';
    }

  });

});
