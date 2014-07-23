var request = require('request');
var Queue = require('./queue');

var RedditRequest = function (options, callback) {

  this.options = options;
  this.callback = callback;

};

RedditRequest.prototype = {

  constructor: RedditRequest,

  send: function (callback) {

    request(this.options, callback);

  }

};

var RedditApi = function (options) {

  this.app_id = options.app_id;
  this.app_secret = options.app_secret;
  this.redirect_uri = options.redirect_uri;
  this.user_agent = options.user_agent || 'reddit.js/1.0.3 by aihamh';
  this.access_token = options.access_token || null;
  this.refresh_token = options.refresh_token || null;
  this.queue = new Queue(options.request_buffer || 2000);

};

RedditApi.prototype = {

  constructor: RedditApi,

  isAuthed: function () {

    return !!this.access_token;

  },

  request: function (path, options, callback, is_refreshing_token) {

    if (!options.headers) {
      options.headers = {};
    }
    options.headers['User-Agent'] = this.user_agent;
    if (this.isAuthed()) {
      options.headers['Authorization'] = 'bearer ' + this.access_token;
    }

    if (!options.url) {
      var subdomain = this.isAuthed() ? 'oauth' : 'ssl';
      options.url = 'https://' + subdomain + '.reddit.com' + path;
    }

    if (!options.method) {
      options.method = 'GET';
    }

    this.queue.add(new RedditRequest(options, (function (api) {

      return function (error, response, body) {

        if (!error && response.statusCode === 200) {
          response.jsonData = JSON.parse(body);
        } else if (!is_refreshing_token && response.statusCode === 401 && api.refresh_token) {
          api.refreshToken(function (success) {

            if (success) {
              api.request(path, options, callback);
            } else {
              callback.call(api, error, response, data);
            }

          });
          return;
        } else {
          console.log('reddit-oauth Error:', error);
        }
        callback.call(api, error, response, body);

      };

    })(this)));

  },

  passAuth: function (username, password, callback) {

    this.access_token = null;
    this.refresh_token = null;

    this.request('/api/v1/access_token', {
      method: 'POST',
      form: {
        grant_type: 'password',
        username: username,
        password: password
      },
      auth: {
        username: this.app_id,
        password: this.app_secret
      }
    }, function (error, response, body) {

      if (!error) {
        this.access_token = response.jsonData.access_token;
      }

      if (callback) {
        callback(!error);
      }

    });

  },

  oAuthUrl: function (state, scope) {

    if (typeof scope === 'string') {
      scope = [scope];
    }

    var url = 'https://ssl.reddit.com/api/v1/authorize';
    url += '?client_id=' + encodeURIComponent(this.app_id);
    url += '&response_type=code';
    url += '&state=' + encodeURIComponent(state);
    url += '&redirect_uri=' + encodeURIComponent(this.redirect_uri);
    url += '&duration=permanent';
    url += '&scope=' + encodeURIComponent(scope.join(','));

    return url;

  },

  oAuthTokens: function (state, query, callback) {

    if (query.state !== state || !query.code) {
      callback(false);
      return;
    }

    this.access_token = null;
    this.refresh_token = null;

    this.request('/api/v1/access_token', {
      method: 'POST',
      form: {
        grant_type: 'authorization_code',
        code: query.code,
        redirect_uri: this.redirect_uri
      },
      auth: {
        username: this.app_id,
        password: this.app_secret
      }
    }, function (error, response, body) {

      if (!error) {
        this.access_token = response.jsonData.access_token;
        this.refresh_token = response.jsonData.refresh_token;
      }

      if (callback) {
        callback(!error);
      }

    });

  },

  refreshToken: function (callback) {

    this.access_token = null;

    this.request('/api/v1/access_token', {
      method: 'POST',
      form: {
        grant_type: 'refresh_token',
        refresh_token: this.refresh_token
      },
      auth: {
        username: this.app_id,
        password: this.app_secret
      }
    }, function (error, response, body) {

      if (!error) {
        this.access_token = response.jsonData.access_token;
      }

      if (callback) {
        callback(!error);
      }

    }, true);

  },

  get: function (path, params, callback) {

    var options = {};
    if (params) {
      for (var key in params) {
        if (params.hasOwnProperty(key)) {
          options.form = params;
          break;
        }
      }
    }
    this.request(path, options, callback);

  },

  post: function (path, params, callback) {

    var options = {method: 'POST'};
    if (params) {
      for (var key in params) {
        if (params.hasOwnProperty(key)) {
          options.form = params;
          break;
        }
      }
    }
    this.request(path, options, callback);

  }

};

module.exports = RedditApi;
