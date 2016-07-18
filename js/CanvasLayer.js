define([
  'dojo/_base/declare',
  'dojo/dom-construct',
  'esri/layers/layer',
  'esri/geometry/Point',
  'esri/geometry/screenUtils',
  'esri/SpatialReference'
], function (declare, domConsruct, Layer, Point, screenUtils, SpatialReference) {

  // TODO: EXPLORE THE FOLLOWING
  // https://github.com/Vizzuality/gfw/blob/90918be507a9c39956f9375010b161a2c7b4c560/app/assets/javascripts/abstract/layer/CanvasLayerClass.js
  // _drawCanvasImage, spicifically tile scaling, for upscaling tiles so they appear below zoom level 12
  // _getTileCoords, for determining which tiles to request if the zoom level is greater than the max zoom level

  /**
  * Helper Functions for fetching tiles
  */

  /**
  * Calcualte the tile this latitude and level intersects
  */
  var getTileRow = function getTileRow (tileInfo, level, latitude, resolution) {
    var tileSizeInMapUnits = tileInfo.rows * resolution;
    var origin = tileInfo.origin.y;
    return Math.floor((origin - latitude) / tileSizeInMapUnits);
  };

  /**
  * Calcualte the tile this longitude and level intersects
  */
  var getTileColumn = function getTileColumn (tileInfo, level, longitude, resolution) {
    var tileSizeInMapUnits = tileInfo.cols * resolution;
    var origin = tileInfo.origin.x;
    return Math.floor((longitude - origin) / tileSizeInMapUnits);
  };

  /**
  * Takes min and max for columns and rows and returns an array of stats({x,y,z}) for tiles that I need to request
  */
  var getTileStats = function getTileStats (colMin, colMax, rowMin, rowMax, level) {
    var stats = [];
    for (var col = colMin; col <= colMax; col++) {
      for (var row = rowMin; row <= rowMax; row++) {
        stats.push({ x: col, y: row, z: level });
      }
    }
    return stats;
  };

  /**
  * Get Longitude
  * Taken from http://gis.stackexchange.com/questions/17278/calculate-lat-lon-bounds-for-individual-tile-generated-from-gdal2tiles
  */
  var longFromTilePosition = function longFromTilePosition (col, zoom) {
    return col / Math.pow(2, zoom) * 360 - 180;
  };

  /**
  * Get Latitude
  * Taken from http://gis.stackexchange.com/questions/17278/calculate-lat-lon-bounds-for-individual-tile-generated-from-gdal2tiles
  */
  var latFromTilePosition = function latFromTilePosition (row, zoom) {
    var n = Math.PI - Math.PI * 2 * row / Math.pow(2, zoom);
    return (180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))));
  };

  /**
  * Decode Dates from raw data
  * Pixel is an array of values representing the rgba of the pixel
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
  * Return an array of confidence values
  */
  var confidenceValues = function confidenceValues (confidenceLevel) {
    return confidenceLevel === DEFAULT.confidence ? [0, 1] : [0];
  };

  /**
  * Simple pad function to force numbers to be at least 3 digits
  */
  var pad = function pad (number) {
    var str = '00' + number;
    return str.slice(str.length - 3);
  };

  /**
  * Defaults
  */
  var DEFAULT = {
    confidence: 'all', // 'all' or 'confirmed'
    minDate: 15000,
    maxDate: 16365
  };

  return declare('CanvasLayer', [Layer], {
    /**
    * @description Override Esri Constructor
    * Make sure to set loaded and trigger parent onLoad
    */
    constructor: function constructor (options) {
      // Set defaults for this layer that are specific to this layer
      /**
      * Tile Cache Properties
      * Type: <string, object>
      * KeyFormat: row:col:level
      * ValueType: {
      *   x: number
      *   y: number
      *   height: number
      *   width: number
      * }
      */
      // this._tileCache = {};
      this.minDateValue = DEFAULT.minDate;
      this.maxDateValue = DEFAULT.maxDate;
      this.confidence = DEFAULT.confidence;
      // Set some esri defaults, and invoke the default Layer onLoad behavior
      this.visible = options.visible || true;
      this.loaded = true;
      this.onLoad(this);
    },

    /**
    * @description Override _setMap method, called when the layer is added to the map
    */
    _setMap: function _setMap (map, container) {
      this._map = map;
      // Setup the canvas element
      this._element = domConsruct.create('canvas', {
        id: 'CanvasLayer_canvas',
        width: map.width + 'px',
        height: map.height + 'px',
        style: 'position:absolute;left:0;top:0;' + (this.visible ? 'display:block;' : 'display:none;')
      }, container);

      if (!this._element.getContext('2d')) {
        console.error('Your browser does not support <canvas> elements.');
      }

      //- Set up a listener to fetch tiles
      map.on('extent-change', this._update.bind(this));
      //- Set up a listener to clear tiles
      map.on('pan-start, zoom-start', this._clear.bind(this));

      return this._element;
    },

    /**
    * @description Override _unsetMap method, called when the layer is removed from the map
    */
    _unsetMap: function _unsetMap (map, container) {
      this._map = null;
    },

    /**
    * Public Method
    * @description Override show method
    */
    show: function () {
      if (this._element) {
        this._element.style.display = 'block';
        this.visible = true;
        this._update();
      }
    },

    /**
    * Public Method
    * @description Override hide method
    */
    hide: function () {
      if (this._element) {
        this._element.style.display = 'none';
        this.visible = false;
        //- Clear canvas as there is a good chance the map extent will change when this layer is hidden
        //- and we do not want to flash old tiles on the canvas
        this._clear();
      }
    },

    /**
    * Public Method - forceUpdate
    * @description Force Update the layer
    */
    forceUpdate: function () {
      if (this._element && this.visible) {
        this._clear();
        this._update();
      }
    },

    /**
    * Public Method - setConfidenceLevel
    * @description Set the confidence level and redraw tiles from cache
    * @param {string} confidence - New confidence setting
    */
    setConfidenceLevel: function (confidence) {
      this.confidence = confidence;
      this._update();
    },

    /**
    * Public Method - setMinimumDate
    * @description Set the minimum date and redraw tiles from cache
    * @param {number} date - New minimum date setting
    */
    setMinimumDate: function (date) {
      this.minDateValue = parseInt(date);
      this._update();
    },

    /**
    * Public Method - setMaximumDate
    * @description Set the maximum date and redraw tiles from cache
    * @param {number} date - New maximum date setting
    */
    setMaximumDate: function (date) {
      this.maxDateValue = parseInt(date);
      this._update();
    },

    /**
    * Public Method - setDateRange
    * @description Set the range of dates and redraw tiles from cache
    * @param {number} date - New maximum date setting
    * @param {number} date - New maximum date setting
    */
    setDateRange: function (minDate, maxDate) {
      this.minDateValue = parseInt(minDate);
      this.maxDateValue = parseInt(maxDate);
      this._update();
    },

    /**
    * @description Internal method for updating the tiles
    */
    _update: function () {
      //- Dont update if were hidden
      if (!this.visible) { return; }
      var map = this._map;
      var resolution = map.getResolution();
      var level = map.getLevel();
      var extent = map.extent;
      //- Calculate start and end columns and rows
      var colMin = getTileColumn(map.__tileInfo, level, extent.xmin, resolution);
      var colMax = getTileColumn(map.__tileInfo, level, extent.xmax, resolution);
      //- These seem to be reversed for some reason, not sure why yet
      var rowMin = getTileRow(map.__tileInfo, level, extent.ymax, resolution);
      var rowMax = getTileRow(map.__tileInfo, level, extent.ymin, resolution);
      //- Get an array of stats containing the information needed to request tiles for this zoom and extent
      var stats = getTileStats(colMin, colMax, rowMin, rowMax, level);
      stats.forEach(function (stat) {
        this.getTile(stat.z, stat.y, stat.x, rowMin, colMin);
      }, this);
    },

    /**
    * @description Internal method for clearing the tiles
    */
    _clear: function () {
      //- Dont update if were hidden
      if (!this.visible || !this._element) { return; }
      //- Clear the current context
      var canvas = this._element;
      var context = canvas.getContext('2d');
      context.clearRect(0, 0, canvas.width, canvas.height);
    },

    /**
    * @description Request the tiles needed for the current extent and draw them to the canvas
    */
    getTile: function getTileUrl (level, row, col, baseRow, baseCol) {
      var url = '//wri-tiles.s3.amazonaws.com/glad_test/test2/' + level + '/' + col + '/' + row + '.png';
      var xhr = new XMLHttpRequest();
      var self = this;

      // I need to calculate the factor to multiple 256 by to determint the tile position
      var rowFactor = row - baseRow;
      var colFactor = col - baseCol;

      xhr.responseType = 'arraybuffer';
      xhr.open('GET', url, true);
      xhr.send();
      xhr.onreadystatechange = function () {
        if (this.readyState == 4 && this.status == 200) {
          var arrayBuffer = new Uint8Array(xhr.response);
          var blob = new Blob([arrayBuffer], { type: 'image/jpeg' });
          var imageUrl = URL.createObjectURL(blob);
          var image = new Image();
          image.onload = function () {
            self.drawToCanvas(image, self._element.getContext('2d'), row, col, level);
          };
          image.src = imageUrl;
        }
      };
    },

    /**
    * @description Internal method to draw the tiles to the canvas
    * 1. Determine the Lat/Long from the Tile's Rowm Col, and Zoom then,
    * 2. Convert that to an ArcGIS point then,
    * 3. Convert that to a screen position then,
    * 4. Draw the tile at the screen position then,
    * 5. Filter the data
    */
    drawToCanvas: function (image, context, row, col, level) {
      var long = longFromTilePosition(col, level);
      var lat = latFromTilePosition(row, level);
      var screen = this._map.toScreen(new Point(long, lat));
      var confidence = confidenceValues(this.confidence);
      var height = image.height;
      var width = image.width;
      var x = screen.x;
      var y = screen.y;
      var imageData;

      //- Update the local cache of the positions of the tiles, this way I can redraw them efficiently without
      //- having to request the tiles again
      // var key = [row, col, level].join(':');
      // this._tileCache[key] = { x: x, y: y, height: height, width: width };

      context.drawImage(image, x, y);
      //- Get the image data
      imageData = context.getImageData(x, y, width, height);
      imageData.data = this.filterData(imageData.data, confidence);
      context.putImageData(imageData, x, y);
    },

    // /**
    // * @description Internal method to redraw the tiles to the canvas from the cache
    // */
    // redrawTiles: function () {
    //   var context = this._element.getContext('2d');
    //
    //   Object.keys(this._tileCache).forEach(function (key) {
    //     var tileInfo = this._tileCache[key];
    //     var imageData = context.getImageData(tileInfo.x, tileInfo.y, tileInfo.width, tileInfo.height);
    //     imageData.data = this.filterData(imageData.data);
    //     context.putImageData(imageData, tileInfo.x, tileInfo.y);
    //   }, this);
    // },

    /**
    * @description Internal method for filtering the tiles
    * TODO: Move this out of the module and make a private function, inject all neceeary dependencies
    */
    filterData: function (data, confidence) {
      for (var i = 0; i < data.length; i += 4) {
        // Decode the rgba/pixel so I can filter on confidence and date ranges
        var values = decodeDate(data.slice(i, i + 4));
        //- Check against confidence, min date, and max date
        if (
          values.date >= this.minDateValue &&
          values.date <= this.maxDateValue &&
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
    }

  });

});
