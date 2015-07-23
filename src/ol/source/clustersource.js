// FIXME keep cluster cache by resolution ?
// FIXME distance not respected because of the centroid

goog.provide('ol.source.Cluster');

goog.require('goog.asserts');
goog.require('ol.Feature');
goog.require('ol.coordinate');
goog.require('ol.events.EventType');
goog.require('ol.extent');
goog.require('ol.geom.Point');
goog.require('ol.source.Vector');


/**
 * @classdesc
 * Layer source to cluster vector data. Works out of the box with point
 * geometries. For other geometry types, or if not all geometries should be
 * considered for clustering, a custom `geometryFunction` can be defined.
 *
 * @constructor
 * @param {olx.source.ClusterOptions} options Constructor options.
 * @extends {ol.source.Vector}
 * @api
 */
ol.source.Cluster = function(options) {
  goog.base(this, {
    attributions: options.attributions,
    extent: options.extent,
    logo: options.logo,
    projection: options.projection,
    wrapX: options.wrapX
  });
  this._clusterCreate_func = [];
  this._onClustersReady_funcs = [];

  /**
   * @type {number|undefined}
   * @private
   */
  this.resolution_ = undefined;

  /**
   * @type {number}
   * @private
   */
  this.distance_ = options.distance !== undefined ? options.distance : 20;

  /**
   * @type {Array.<ol.Feature>}
   * @private
   */
  this.features_ = [];

  /**
   * @param {ol.Feature} feature Feature.
   * @return {ol.geom.Point} Cluster calculation point.
   */
  this.geometryFunction_ = options.geometryFunction || function(feature) {
    var geometry = feature.getGeometry();
    goog.asserts.assert(geometry instanceof ol.geom.Point,
        'feature geometry is a ol.geom.Point instance');
    return geometry;
  };

  /**
   * @type {ol.source.Vector}
   * @private
   */
  this.source_ = options.source;

  this.source_.on(ol.events.EventType.CHANGE,
      ol.source.Cluster.prototype.onSourceChange_, this);
};
goog.inherits(ol.source.Cluster, ol.source.Vector);


/**
 * Get a reference to the wrapped source.
 * @return {ol.source.Vector} Source.
 * @api
 */
ol.source.Cluster.prototype.getSource = function() {
  return this.source_;
};


/**
 * @inheritDoc
 */
ol.source.Cluster.prototype.loadFeatures = function(extent, resolution,
    projection) {
  this.source_.loadFeatures(extent, resolution, projection);
  if (resolution !== this.resolution_) {
    this.clear();
    this.resolution_ = resolution;
    this.cluster_();
    this.addFeatures(this.features_);
  }
};


/**
 * handle the source changing
 * @private
 */
ol.source.Cluster.prototype.onSourceChange_ = function() {
  this.clear();
  this.cluster_();
  this.addFeatures(this.features_);
  this.changed();
};


/**
 * @private
 */
ol.source.Cluster.prototype.cluster_ = function() {
  if (this.resolution_ === undefined) {
    return;
  }
  this.features_.length = 0;
  var extent = ol.extent.createEmpty();
  var mapDistance = this.distance_ * this.resolution_;
  var features = this.source_.getFeatures();

  /**
   * @type {!Object.<string, boolean>}
   */
  var clustered = {};
  var exec_func = function (func) {
            try {
              func(c);
            } catch (e) {
              console.error(e);
            }
          };

  for (var i = 0, ii = features.length; i < ii; i++) {
    var feature = features[i];

    if (!(goog.getUid(feature).toString() in clustered)) {
      var geometry = this.geometryFunction_(feature);
      if (geometry) {
        var coordinates = geometry.getCoordinates();
        ol.extent.createOrUpdateFromCoordinate(coordinates, extent);
        ol.extent.buffer(extent, mapDistance, extent);

        var neighbors = this.source_.getFeaturesInExtent(extent);
        goog.asserts.assert(neighbors.length >= 1, 'at least one neighbor found');
        neighbors = neighbors.filter(function(neighbor) {
          var uid = goog.getUid(neighbor).toString();
          if (!(uid in clustered)) {
            clustered[uid] = true;
            return true;
          } else {
            return false;
          }
        });
        var c = this.createCluster_(neighbors);
        this._clusterCreate_func.forEach(exec_func);
        this.features_.push(c);
      }
    }
  }
  var cluster_ready_func = (function (func) {
      try {
        func(this.features_);
      } catch (err) {
        console.error(err);
      }
    }).bind(this);

  this._onClustersReady_funcs.forEach(cluster_ready_func);
  goog.asserts.assert(
      Object.keys(clustered).length == this.source_.getFeatures().length,
      'number of clustered equals number of features in the source');
};


ol.source.Cluster.prototype.addOnClustersReadyTrigger = function (clusters_func) {
   this._onClustersReady_funcs.push(clusters_func);
};

ol.source.Cluster.prototype.addOnClusterCreateTrigger = function (cluster_func) {
   this._clusterCreate_func.push(cluster_func);
};

ol.source.Cluster.prototype.removeOnClusterCreateTrigger = function (cluster_func) {
  var index = this._clusterCreate_func.indexOf(cluster_func);
  if (index > -1) {
    this._clusterCreate_func.splice(index, 1);
  }
};

ol.source.Cluster.prototype.removeOnClustersReadyTrigger = function (clusters_func) {
  var index = this._onClustersReady_funcs.indexOf(clusters_func);
  if (index > -1) {
    this._onClustersReady_funcs.splice(index, 1);
  }
};

/**
 * @param {Array.<ol.Feature>} features Features
 * @return {ol.Feature} The cluster feature.
 * @private
 */
ol.source.Cluster.prototype.createCluster_ = function(features) {
  var centroid = [0, 0];
  for (var i = features.length - 1; i >= 0; --i) {
    var geometry = this.geometryFunction_(features[i]);
    if (geometry) {
      ol.coordinate.add(centroid, geometry.getCoordinates());
    } else {
      features.splice(i, 1);
    }
  }
  ol.coordinate.scale(centroid, 1 / features.length);

  var cluster = new ol.Feature(new ol.geom.Point(centroid));
  cluster.set('features', features);
  return cluster;
};
