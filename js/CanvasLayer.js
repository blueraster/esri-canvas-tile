define([
  'dojo/_base/declare',
  'dojo/dom-construct',
  'esri/layers/layer',
  'esri/geometry/Point',
  'esri/geometry/screenUtils',
  'esri/SpatialReference'
], function (declare, domConsruct, Layer, Point, screenUtils, SpatialReference) {

  /**
  * Helper Functions for fetching tiles
  */

  /**
  * Calcualte the tile this latitude and level intersects
  */
  var getTileRow = function getTileRow (tileInfo, level, latitude) {
    var tileSizeInMapUnits = tileInfo.rows * tileInfo.lods[level].resolution;
    var origin = tileInfo.origin.y;
    return Math.floor((origin - latitude) / tileSizeInMapUnits);
  };

  /**
  * Calcualte the tile this longitude and level intersects
  */
  var getTileColumn = function getTileColumn (tileInfo, level, longitude) {
    var tileSizeInMapUnits = tileInfo.cols * tileInfo.lods[level].resolution;
    var origin = tileInfo.origin.x;
    return Math.floor((longitude - origin) / tileSizeInMapUnits);
  };

  /**
  * Takes min and max for columns and rows and returns an array of stats({x,y,z}) for tiles that I need to request
  */
  var getTileStats = function (colMin, colMax, rowMin, rowMax, level) {
    var stats = [];
    for (var col = colMin; col <= colMax; col++) {
      for (var row = rowMin; row <= rowMax; row++) {
        stats.push({
          x: col,
          y: row,
          z: level
        });
      }
    }
    return stats;
  };


  return declare('CanvasLayer', [Layer], {

    /**
    * Override Esri Constructor
    * Make sure to set loaded and triger parent onLoad
    */
    constructor: function constructor (options) {
      // Set loaded to true, and invoke the default Layer onLoad behavior
      this.loaded = true;
      this.onLoad(this);
    },

    /**
    * Override Esri _setMap
    * Called when the layer is added to the map
    */
    _setMap: function _setMap (map, container) {
      this._map = map;
      // Setup the canvas element
      this._element = domConsruct.create('canvas', {
        id: 'CanvasLayer_canvas',
        width: map.width + 'px',
        height: map.height + 'px',
        style: 'position:absolute;left:0;top:0;'
      }, container);

      if (!this._element.getContext('2d')) {
        console.error('Your browser does not support <canvas> elements.');
      }

      //- Set up a listener to fetch tiles
      map.on('extent-change', this.extentDidChange.bind(this));

      return this._element;
    },

    /**
    * Override Esri _unsetMap
    * Called when the layer is removed from the map
    */
    _unsetMap: function _unsetMap (map, container) {
      this._map = null;
    },

    extentDidChange: function (evt) {
      var level = this._map.getLevel();
      var extent = evt.extent;
      var lod = evt.lod;
      //- Clear the current context
      this.clearCanvas();
      //- Calculate start and end columns and rows
      var colMin = getTileColumn(this._map.__tileInfo, level, extent.xmin);
      var colMax = getTileColumn(this._map.__tileInfo, level, extent.xmax);
      //- These seem to be reversed for some reason, not sure why yet
      var rowMin = getTileRow(this._map.__tileInfo, level, extent.ymax);
      var rowMax = getTileRow(this._map.__tileInfo, level, extent.ymin);
      //- Get an array of stats containing the information needed to request tiles for this zoom and extent
      var stats = getTileStats(colMin, colMax, rowMin, rowMax, level);
      stats.forEach(function (stat) {
        this.getTile(stat.z, stat.y, stat.x, rowMin, colMin);
      }, this);
    },

    /**
    * Request the tile for the canvas
    */
    getTile: function getTileUrl (level, row, col, baseRow, baseCol) {
      var url = 'http://wri-tiles.s3.amazonaws.com/glad_test/test2/' + level + '/' + col + '/' + row + '.png';
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
            self.drawToCanvas(image, self._element.getContext('2d'), rowFactor, colFactor);
          };
          image.src = imageUrl;
        }
      };
    },

    drawToCanvas: function (image, context, rowFactor, colFactor) {
      var width = image.width;
      var height = image.height;
      var x = height * colFactor;
      var y = width * rowFactor;
      var imageData;

      context.drawImage(image, x, y);
      //- Get the image data
      imageData = context.getImageData(x, y, width, height);
      imageData.data = this.filterData(imageData.data);
      context.putImageData(imageData, x, y);
    },

    clearCanvas: function () {
      var canvas = this._element;
      var context = canvas.getContext('2d');
      context.clearRect(0, 0, canvas.width, canvas.height);
    },

    filterData: function (data) {
      for (var i = 0; i < data.length; i += 4) {
        //- Remove No Data Pixels by setting the alpha to 0
        if (data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 0) {
          data[i + 3] = 0;
        }
      }
      return data;
    }

  });

});
