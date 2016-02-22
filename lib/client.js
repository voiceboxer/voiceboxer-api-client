var events = require('events');
var util = require('util');
var voiceboxer = require('voiceboxer-api');
var Cookies = require('cookies-js');
var extend = require('xtend');
var debug = require('debug')('voiceboxer:api');

var COOKIE = '__vb.token';
var IO_SERVER_DISCONNECT = 'io server disconnect';
var IO_CLIENT_DISCONNECT = 'io client disconnect';

var noop = function() {};

var getCookieToken = function() {
  var token = Cookies.get(COOKIE);
  if(!token) return null;

  try {
    return JSON.parse(token);
  } catch(err) {};
};

module.exports = Client;

function Client() {
  events.EventEmitter.call(this);

  this.authenticated = false;
  this.token = getCookieToken();
  this.registered = false;
  this.connecting = false;
  this.state = {};
  this.ondisconnect = noop;

  this._retryTimeout = null;
  this._disconnectTimeout = null;
};

util.inherits(Client, events.EventEmitter);

Client.prototype.init = function(options) {
  this.options = options || {};
  Cookies.defaults = extend(this.options.cookie || {}, Cookies.defaults);

  var defaults = {
    client_id: this.options.api ? this.options.api.client_id : null,
    api: this.options.api ? this.options.api.url : null,
    air: this.options.air ? this.options.air.url : null
  };

  this.defaults = voiceboxer.defaults(defaults);
  this.api = this._api(this.token);

  return this;
};

Client.prototype.login = function(credentials, callback) {
  if(!callback && typeof credentials === 'function') {
    callback = credentials;
    credentials = null;
  }

  callback = callback || noop;

  var api = credentials ? this._api(credentials) : this.api;

  api.authenticate(function(err, token) {
    if(err) return callback(err);

    this.token = token;
    this.api = api;
    this.authenticated = true;

    Cookies.set(COOKIE, JSON.stringify(token));

    api.get('/users/me', function(err, user) {
      if(err) return callback(err);
      this.emit('login', user);
    }.bind(this));
  }.bind(this));
};

Client.prototype.logout = function() {
  Cookies.expire(COOKIE);

  this.unregister();

  this.token = null;
  this.api = this._api();
  this.authenticated = false;
  this.state = {};

  this.emit('logout');
};

Client.prototype.register = function(literalId) {
  if(this.registered) throw new Error('Already registered');

  this.registered = true;
  this.state.literalId = literalId;

  var self = this;

  var connect = function() {
    self.api.register(literalId, this.state, retry);
  };

  var retry = function(err) {
    if(!self.registered) return;

    if(err) {
      debug('connect error', err);

      self._retryTimeout = setTimeout(function() {
        debug('retrying connect');
        connect();
      }, self.options.reconnect);
    } else {
      self.connecting = false;
    }
  };

  var reconnect = function() {
    self.connecting = true;
    connect();
  };

  this.ondisconnect = function(literalId, reason) {
    debug('disconnected', reason);

    if(reason !== IO_SERVER_DISCONNECT && reason !== IO_CLIENT_DISCONNECT) {
      // Fix for reconnect on browser reload
      self._disconnectTimeout = setTimeout(function() {
        reconnect();
      }, 1000);
    }
  };

  this.api.on('disconnect', this.ondisconnect);
  reconnect();
};

Client.prototype.unregister = function() {
  clearTimeout(this._retryTimeout);
  clearTimeout(this._disconnectTimeout);
  this.api.removeListener('disconnect', this.ondisconnect);
  this.api.unregister(this.state.literalId);

  this.registered = false;
  this.connecting = false;
  this.ondisconnect = noop;

  delete this.state.literalId;
};

Client.prototype.update = function(options) {
  this.state.status = options.status;
  this.state.language = options.language;
};

Client.prototype._api = function(credentials) {
  var self = this;
  var api = this.defaults(credentials);

  var request = function(method, resource) {
    var prefix = resource === 'liveEvents' ? '/live-events/' : '/chats/';

    if(!api[resource]) api[resource] = {};

    api[resource][method] = function(url, data, callback) {
      var literalId = self.state.literalId;
      if(!literalId) throw new Error('Literal ID missing');

      api[method](prefix + literalId + url, data, callback);
    };
  };

  ['get', 'post', 'put', 'delete', 'patch'].forEach(function(method) {
    request(method, 'liveEvents');
    request(method, 'chats');
  });

  return api;
};
