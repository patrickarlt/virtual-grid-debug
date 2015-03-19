(function(L){
  function debounce(fn, delay, context) {
    var timer = null;
    return function() {
      var context = this||context, args = arguments;
      clearTimeout(timer);
      timer = setTimeout(function () {
        fn.apply(context, args);
      }, delay);
    };
  }

  function roundAwayFromZero(num){
    return (num > 0) ? Math.ceil(num) : Math.floor(num);
  }

  L.VirtualGrid = L.Layer.extend({
    options: {
      cellSize: 512,
      debounce: 100,
      deduplicate: true
    },
    _previousCells: [],
    initialize: function(options) {
      L.Util.setOptions(this, options);
    },
    onAdd: function(map){
      this._map = map;
      this.center = this._map.getCenter();
      this.origin = this._map.project(this.center);

      this.handler = debounce(function(e){
        if(e.type === "zoomend"){
          this.origin = this._map.project(this.center);
          this._previousCells = [];
          this.fireEvent("clearcells");
        }
        this.fireEvent("newcells", this.cellsWithin(e.target.getBounds()));
      }, this.options.debounce, this);

      map.on("zoomend resize move", this.handler, this);

      this.fireEvent("newcells", this.cellsWithin(this._map.getBounds()));
    },
    onRemove: function(map){
      map.off("move zoomend resize", this.handler, this);
    },
    cellsWithin: function(mapBounds){
      var size = this._map.getSize();
      var offset = this._map.project(this._map.getCenter());
      var padding = Math.min(this.options.cellSize/size.x, this.options.cellSize/size.y)
      var bounds = mapBounds.pad(padding);
      var cellInfo = {
        bounds: bounds,
        cells: []
      };

      var topLeftPoint = this._map.project(bounds.getNorthWest());
      var bottomRightPoint = this._map.project(bounds.getSouthEast());

      var topLeft = topLeftPoint.subtract(offset).divideBy(this.options.cellSize);
      var bottomRight = bottomRightPoint.subtract(offset).divideBy(this.options.cellSize);

      var offsetRows = Math.round((this.origin.x - offset.x) / this.options.cellSize);
      var offsetCols = Math.round((this.origin.y - offset.y) / this.options.cellSize);

      var minRow = roundAwayFromZero(topLeft.x)-offsetRows;
      var maxRow = roundAwayFromZero(bottomRight.x)-offsetRows;
      var minCol = roundAwayFromZero(topLeft.y)-offsetCols;
      var maxCol = roundAwayFromZero(bottomRight.y)-offsetCols;

      for (var row = minRow; row < maxRow; row++) {
        for (var col = minCol; col < maxCol; col++) {
          var cellId = "cell:"+row+":"+col;
          var duplicate = this._previousCells.indexOf(cellId) >= 0;

          if(!duplicate || !this.options.deduplicate){
            var cellBounds = this.cellExtent(row, col);
            var cellCenter = cellBounds.getCenter();
            var radius = cellCenter.distanceTo(cellBounds.getNorthWest());
            var distance = cellCenter.distanceTo(this.center);
            var cell = {
              row: row,
              col: col,
              id: cellId,
              center: cellCenter,
              bounds: cellBounds,
              distance:distance,
              radius: radius
            };
            cellInfo.cells.push(cell);
            this._previousCells.push(cellId);
          }
        }
      }

      cellInfo.cells.sort(function (a, b) {
        return a.distance - b.distance;
      });
      return cellInfo;
    },
    cellExtent: function(row, col){
      var swPoint = this.cellPoint(row, col);
      var nePoint = this.cellPoint(row+1, col+1);
      var sw = this._map.unproject(swPoint);
      var ne = this._map.unproject(nePoint);
      return L.latLngBounds(sw, ne);
    },
    cellPoint:function(row, col){
      var x = this.origin.x + (row*this.options.cellSize);
      var y = this.origin.y + (col*this.options.cellSize);
      return [x, y];
    },
    addTo: function (map) {
      map.addLayer(this);
      return this;
    }
  });

  L.virtualGrid = function(options){
    return new L.VirtualGrid(options);
  };

})(L);

// L.VirtualGrid = L.Layer.extend({

//   includes: L.Mixin.Events,

//   options: {
//     cellSize: 512,
//     updateInterval: 150
//   },

//   initialize: function (options) {
//     options = L.setOptions(this, options);
//   },

//   onAdd: function (map) {
//     this._map = map;
//     this._update = L.Util.throttle(this._update, this.options.updateInterval, this);

//     // @TODO remove for leaflet 0.8
//     // this._map.addEventListener(this.getEvents(), this);

//     this._reset();
//     this._update();
//   },

//   onRemove: function(){
//     this._map.removeEventListener(this.getEvents(), this);
//     this._removeCells();
//   },

//   getEvents: function () {
//     var events = {
//       viewreset: this._reset,
//       moveend: this._update
//     };

//     return events;
//   },

//   addTo: function(map){
//     map.addLayer(this);
//     return this;
//   },

//   removeFrom: function(map){
//     map.removeLayer(this);
//     return this;
//   },

//   _reset: function () {
//     this._removeCells();

//     this._cells = {};
//     this._activeCells = {};
//     this._cellsToLoad = 0;
//     this._cellsTotal = 0;

//     // @TODO enable at Leaflet 0.8
//     this._cellNumBounds = this._getCellNumBounds();

//     this._resetWrap();
//   },

//   _resetWrap: function () {
//     var map = this._map,
//         crs = map.options.crs;

//     if (crs.infinite) { return; }

//     var cellSize = this._getCellSize();

//     if (crs.wrapLng) {
//       this._wrapLng = [
//         Math.floor(map.project([0, crs.wrapLng[0]]).x / cellSize),
//         Math.ceil(map.project([0, crs.wrapLng[1]]).x / cellSize)
//       ];
//     }

//     if (crs.wrapLat) {
//       this._wrapLat = [
//         Math.floor(map.project([crs.wrapLat[0], 0]).y / cellSize),
//         Math.ceil(map.project([crs.wrapLat[1], 0]).y / cellSize)
//       ];
//     }
//   },

//   _getCellSize: function () {
//     return this.options.cellSize;
//   },

//   _update: function () {

//     if (!this._map) { return; }

//     var bounds = this._map.getPixelBounds(),
//         zoom = this._map.getZoom(),
//         cellSize = this._getCellSize();

//     if (zoom > this.options.maxZoom ||
//         zoom < this.options.minZoom) { return; }

//     // cell coordinates range for the current view
//     var cellBounds = L.bounds(
//       bounds.min.divideBy(cellSize).floor(),
//       bounds.max.divideBy(cellSize).floor());

//     this._addCells(cellBounds);
//     this._removeOtherCells(cellBounds);
//   },

//   _addCells: function (bounds) {

//     var queue = [],
//         center = bounds.getCenter(),
//         zoom = this._map.getZoom();

//     var j, i, coords;
//     // create a queue of coordinates to load cells from
//     for (j = bounds.min.y; j <= bounds.max.y; j++) {
//       for (i = bounds.min.x; i <= bounds.max.x; i++) {
//         coords = new L.Point(i, j);
//         coords.z = zoom;

//         // @TODO enable at Leaflet 0.8
//         if (this._isValidCell(coords)) {
//           queue.push(coords);
//         }

//         queue.push(coords);
//       }
//     }

//     var cellsToLoad = queue.length;

//     if (cellsToLoad === 0) { return; }

//     this._cellsToLoad += cellsToLoad;
//     this._cellsTotal += cellsToLoad;

//     // sort cell queue to load cells in order of their distance to center
//     queue.sort(function (a, b) {
//       return a.distanceTo(center) - b.distanceTo(center);
//     });

//     for (i = 0; i < cellsToLoad; i++) {
//       this._addCell(queue[i]);
//     }
//   },

//   // @TODO enable at Leaflet 0.8
//   _isValidCell: function (coords) {
//     var crs = this._map.options.crs;

//     if (!crs.infinite) {
//       // don't load cell if it's out of bounds and not wrapped
//       var bounds = this._cellNumBounds;
//       if (
//         (!crs.wrapLng && (coords.x < bounds.min.x || coords.x > bounds.max.x)) ||
//         (!crs.wrapLat && (coords.y < bounds.min.y || coords.y > bounds.max.y))
//       ) {
//         return false;
//       }
//     }

//     if (!this.options.bounds) {
//       return true;
//     }

//     // don't load cell if it doesn't intersect the bounds in options
//     var cellBounds = this._cellCoordsToBounds(coords);
//     return L.latLngBounds(this.options.bounds).intersects(cellBounds);
//   },

//   // converts cell coordinates to its geographical bounds
//   _cellCoordsToBounds: function (coords) {
//     var map = this._map,
//         cellSize = this.options.cellSize,

//         nwPoint = coords.multiplyBy(cellSize),
//         sePoint = nwPoint.add([cellSize, cellSize]),

//         // @TODO for Leaflet 0.8
//         nw = map.wrapLatLng(map.unproject(nwPoint, coords.z)),
//         se = map.wrapLatLng(map.unproject(sePoint, coords.z));

//         nw = map.unproject(nwPoint, coords.z).wrap(),
//         se = map.unproject(sePoint, coords.z).wrap();

//     return new L.LatLngBounds(nw, se);
//   },

//   // converts cell coordinates to key for the cell cache
//   _cellCoordsToKey: function (coords) {
//     return coords.x + ':' + coords.y;
//   },

//   // converts cell cache key to coordiantes
//   _keyToCellCoords: function (key) {
//     var kArr = key.split(':'),
//         x = parseInt(kArr[0], 10),
//         y = parseInt(kArr[1], 10);

//     return new L.Point(x, y);
//   },

//   // remove any present cells that are off the specified bounds
//   _removeOtherCells: function (bounds) {
//     for (var key in this._cells) {
//       if (!bounds.contains(this._keyToCellCoords(key))) {
//         this._removeCell(key);
//       }
//     }
//   },

//   _removeCell: function (key) {
//     var cell = this._activeCells[key];
//     if(cell){
//       delete this._activeCells[key];

//       if (this.cellLeave) {
//         this.cellLeave(cell.bounds, cell.coords);
//       }

//       this.fire('cellleave', {
//         bounds: cell.bounds,
//         coords: cell.coords
//       });
//     }
//   },

//   _removeCells: function(){
//     for (var key in this._cells) {
//       var bounds = this._cells[key].bounds;
//       var coords = this._cells[key].coords;

//       if (this.cellLeave) {
//         this.cellLeave(bounds, coords);
//       }

//       this.fire('cellleave', {
//         bounds: bounds,
//         coords: coords
//       });
//     }
//   },

//   _addCell: function (coords) {
//     // wrap cell coords if necessary (depending on CRS)
//     this._wrapCoords(coords);

//     // generate the cell key
//     var key = this._cellCoordsToKey(coords);

//     // get the cell from the cache
//     var cell = this._cells[key];
//     // if this cell should be shown as isnt active yet (enter)

//     if (cell && !this._activeCells[key]) {
//       if (this.cellEnter) {
//         this.cellEnter(cell.bounds, coords);
//       }

//       this.fire('cellenter', {
//         bounds: cell.bounds,
//         coords: coords
//       });

//       this._activeCells[key] = cell;
//     }

//     // if we dont have this cell in the cache yet (create)
//     if (!cell) {
//       cell = {
//         coords: coords,
//         bounds: this._cellCoordsToBounds(coords)
//       };

//       this._cells[key] = cell;
//       this._activeCells[key] = cell;

//       if(this.createCell){
//         this.createCell(cell.bounds, coords);
//       }

//       this.fire('cellcreate', {
//         bounds: cell.bounds,
//         coords: coords
//       });
//     }
//   },

//   _wrapCoords: function (coords) {
//     coords.x = this._wrapLng ? L.Util.wrapNum(coords.x, this._wrapLng) : coords.x;
//     coords.y = this._wrapLat ? L.Util.wrapNum(coords.y, this._wrapLat) : coords.y;
//   },

//   // get the global cell coordinates range for the current zoom
//   // @TODO enable at Leaflet 0.8
//   _getCellNumBounds: function () {
//     // @TODO for Leaflet 0.8
//     var bounds = this._map.getPixelWorldBounds(),
//         size = this._getCellSize();

//     return bounds ? L.bounds(
//         bounds.min.divideBy(size).floor(),
//         bounds.max.divideBy(size).ceil().subtract([1, 1])) : null;
//   }

// });

// L.virtualGrid = function(options){
//   return new L.VirtualGrid(options);
// };