define(['esri/map', 'dojox/form/HorizontalRangeSlider', 'js/GladLayer'], function (_map, _HorizontalRangeSlider, _GladLayer) {
  'use strict';

  var _map2 = _interopRequireDefault(_map);

  var _HorizontalRangeSlider2 = _interopRequireDefault(_HorizontalRangeSlider);

  var _GladLayer2 = _interopRequireDefault(_GladLayer);

  function _interopRequireDefault(obj) {
    return obj && obj.__esModule ? obj : {
      default: obj
    };
  }

  var map = new _map2.default('map', {
    center: [113.763, 0.334],
    basemap: 'gray',
    zoom: 7
  });

  var testLayer = new _GladLayer2.default({
    url: 'https://wri-tiles.s3.amazonaws.com/glad_prod/tiles/{z}/{x}/{y}.png',
    minDateValue: 15000,
    maxDateValue: 16365,
    confidence: [0, 1],
    id: 'TESTING'
  });

  map.addLayers([testLayer]);

  map.on('zoom-end', function () {
    console.log('Current zoom level: %s', map.getLevel());
  });

  /**
  * Helper to show the dates in the UI
  */
  var presentDatesForUser = function presentDatesForUser(query, julianDate) {
    // This basic setup renders a julian date of 15000 to last day of 2014, if 15000 is passed in
    // make it 15001
    if (julianDate === '15000') {
      julianDate = '15001';
    }
    var year = 2000 + parseInt(julianDate.slice(0, 2));
    var days = julianDate.slice(julianDate.length - 3);
    var dateString = new Date(year, 0, days).toDateString();
    document.querySelector(query).innerHTML = dateString;
  };

  // Create controls and setup listeners
  window._Slider = new _HorizontalRangeSlider2.default({
    name: 'datepicker',
    value: [0, 2],
    minimum: 0,
    maximum: 2,
    discreteValues: 365 * 2,
    style: 'width:300px',
    onChange: function onChange(values) {
      var from = values[0];
      var to = values[1];
      // Get the julian date
      var fromJulian = from <= 1 ? parseInt(15000 + from * 365) : parseInt(16000 + (from - 1) * 365);
      var toJulian = to <= 1 ? parseInt(15000 + to * 365) : parseInt(16000 + (to - 1) * 365);

      presentDatesForUser('.start-date', fromJulian.toString());
      presentDatesForUser('.end-date', toJulian.toString());

      // Update the layer
      // gladLayer.setDateRange(fromJulian, toJulian);
      testLayer.setDateRange(fromJulian, toJulian);
    }
  }, 'date-slider');

  presentDatesForUser('.start-date', '15000');
  presentDatesForUser('.end-date', '16365');

  document.getElementById('confidence-level').addEventListener('change', function (evt) {
    var target = evt.target;
    // Acceptable values are 'all' or 'confirmed' only
    // gladLayer.setConfidenceLevel(target.value);
    testLayer.setConfidenceLevel(target.value);
  });

  // For easier debugging
  window._Map = map;
});