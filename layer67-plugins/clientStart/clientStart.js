
/**
 *
 */
const sg                      = require('sgsg');
const _                       = sg._;
const unhandledRoutes         = require('../../lib/unhandled-routes');
const http                    = require('http');
const urlLib                  = require('url');
var   MongoClient             = require('mongodb').MongoClient;

const ARGV                    = sg.ARGV();
const argvGet                 = sg.argvGet;
const argvExtract             = sg.argvExtract;
const setOnn                  = sg.setOnn;
const deref                   = sg.deref;
const unhandled               = unhandledRoutes.unhandled;
var   namespace               = 'layer67';

var   bootstrap;

const main = function() {

  const ip          = ARGV.ip       || '127.0.0.1';
  const port        = ARGV.port;

  if (!port) {
    console.log('Need --port=');
    process.exit(2);
  }

  return bootstrap(function(err, db, config_) {
    const configDb  = db.db('layer67').collection('config');
    const clientsDb = db.db('layer67').collection('clients');

    const server = http.createServer(function(req, res) {

      const url       = urlLib.parse(req.url, true);
      const urlParts  = _.rest(url.pathname.split('/'));

      if (urlParts.length === 0 || _.last(urlParts).toLowerCase() !== 'clientstart') {
        return unhandled(req, res);
      }

      // We are a long-poll server
      req.setTimeout(0);
      res.setTimeout(0);

      var msg           = '';
      var projectId;

      if (req.headers.host) {
        msg += req.headers.host;
      }
      msg += url.pathname;

      if (urlParts.length > 1) {
        projectId = urlParts[0];
      }

      var result = {upstreams:{}};

      return sg.getBody(req, function(err) {
        if (err) { console.error(msg); return unhandled(req, res); }

        // Collect all the interesting items
        const all = sg._extend(url.query, req.bodyJson || {});

        projectId = projectId || all.projectId;

        return sg.__run2([function(next, last, abort) {
          const query = {
            projectId,
            upstream: {$exists:true}
          };

          msg += ', projectId:'+projectId;

          return configDb.find(query, {projection:{_id:0}}).toArray(function(err, items) {
            if (!sg.ok(err, items)) { return abort(500, 'find project fail'); }
            if (items.length === 0) { return next(); }

            const item = items[0];
            result.upstream   = item.upstream.prod;
            result.upstreams  = sg._extend(result.upstreams, item.upstreams.prod);

            return next();
          });

        }], function done() {
          if (result.upstream) {
            msg += ` --> |${result.upstream}|`;
          }

          console.log(msg);
          return sg._200(req, res, result);

        }, function abort(code_, errMsg) {
          console.error(msg);
          if (errMsg)  { console.error(errMsg); }

          const code = code_ || 400;

          return sg['_'+code](req, res);
        });
      });

    });

    server.listen(port, ip, function() {
      console.log(`Listening on ${ip}:${port}`);
    });
  });
};


bootstrap = function(callback) {
  const dbAddress = process.env.SERVERASSIST_DB_IP;
  var   dbUrl     = 'mongodb://10.12.21.229:27017/'+namespace;

  var   db, config = {};

  return sg.__run([function(next) {
    if (db) { return next(); }

    return MongoClient.connect(dbUrl, function(err, db_) {
      if (!sg.ok(err, db_)) { return process.exit(2); }

      db = db_;
      return next();
    });

  }], function done() {
    return callback(null, db, config);
  });
};





main();

