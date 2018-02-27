
/**
 *
 */
const sg                      = require('sgsg');
const _                       = sg._;
const unhandledRoutes         = require('../../lib/unhandled-routes');
const utils                   = require('../../lib/utils');
const http                    = require('http');
const urlLib                  = require('url');
const dbUtil                  = require('../../lib/db');
var   MongoClient             = require('mongodb').MongoClient;

const ARGV                    = sg.ARGV();
const argvGet                 = sg.argvGet;
const argvExtract             = sg.argvExtract;
const setOnn                  = sg.setOnn;
const deref                   = sg.deref;
const unhandled               = unhandledRoutes.unhandled;
const upsertOne               = dbUtil.upsertOne;

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

    const server = http.createServer(function(req, res) {

      const url       = urlLib.parse(req.url, true);
      const urlParts  = _.rest(url.pathname.split('/'));

      if (urlParts.length === 0 || _.last(urlParts).toLowerCase() !== 'clientstart') {
        return unhandled(req, res);
      }

      // We are a long-poll server
      req.setTimeout(0);
      res.setTimeout(0);

      const now         = new Date();
      var   msg           = '';
      var   projectId, sessionId, clientId;

      if (req.headers.host) {
        msg += req.headers.host;
      }
      msg += url.pathname;

      if (urlParts.length > 1) {
        projectId = urlParts[0];
      }

      var result = {upstreams:{}, preference:{}};

      return sg.getBody(req, function(err) {
        if (err) { console.error(msg); return unhandled(req, res); }

        var   who;

        // Collect all the interesting items
        const all   = sg._extend(url.query, req.bodyJson || {});
        const rsvr  = all.rsvr;
        const stack = utils.stackForRsvr(rsvr) || 'prod';

        projectId = projectId || all.projectId || all.project;

        sessionId = all.sessionId || all.session || sessionId;
        clientId  = all.clientId  || all.client  || clientId;

        if (!clientId && sessionId.match(/^[a-z0-9_]+-[0-9]+/i)) {
          clientId = _.first(sessionId.split('-'));
        }
        who =  clientId || sessionId;

        const clientsDb   = projectId ? db.db(projectId).collection('clients')  : null;
        const sessionsDb  = projectId ? db.db(projectId).collection('sessions') : null;

        return sg.__run2([function(next, last, abort) {

          //
          //  Get the domain name of the endpoint from the layer67 config.
          //
          //  Since layer67 controls the web-tier, we first get the config it uses.
          //

          const query = {
            projectId : 'l67',
            upstream  : {$exists:true}
          };

          return configDb.find(query, {projection:{_id:0}}).toArray(function(err, items) {
            if (!sg.ok(err, items)) { console.error('find', query, err); return next(); }

            return sg.__each(items, function(item, nextItem) {
              result.upstream   = item.upstream[stack] || result.upstream;
              result.upstreams  = sg._extend(result.upstreams, (item.upstreams && item.upstreams[stack]) || {});

              return nextItem();
            }, next);
          });

        }, function(next, last, abort) {
          if (!projectId)     { return next(); }

          //
          //  Get the config from the requested project
          //

          const query = {
            projectId,
            mainColor: {$exists:true}
          };

          return configDb.find(query, {projection:{_id:0}}).toArray(function(err, items) {
            if (!sg.ok(err, items)) { console.error('find', query, err); return next(); }

            return sg.__each(items, function(item, nextItem) {
              result.upstream         = (item.upstream && item.upstream[stack]) || result.upstream;

              // Translate 'upstream' into the actual fqdn
              item.upstreams[stack]   = sg.reduce(item.upstreams[stack], {}, function(m, value, key) {
                if (value === 'upstream') {
                  return sg.kv(m, key, result.upstream);
                }
                return sg.kv(m, key, value);
              });
              result.upstreams  = sg._extend(result.upstreams, (item.upstreams && item.upstreams[stack]) || {});

              return nextItem();
            }, next);
          });

        }, function(next, last, abort) {
          if (!sessionsDb || !sessionId)     { return next(); }

          // ----------- Save session ----------
          var updates = {};

          setOnn(updates, '$set.clientId', clientId);

          return upsertOne(sessionsDb, {sessionId}, updates, {}, function(err, receipt) {
            if (err) { console.error('session', {sessionId, err, receipt}); }
            return next();
          });

        }, function(next, last, abort) {
          if (!clientsDb || !clientId)     { return next(); }

          // ----------- Save client ----------
          var updates = {};

          setOnn(updates, '$set.sessionId', sessionId);
          setOnn(updates, '$set.email',     deref(all, 'email'));
          setOnn(updates, '$set.username',  deref(all, 'username'));

          who = deref(all, 'username') || deref(all, 'email') || deref(all, 'description') || who;

          return upsertOne(clientsDb, {clientId}, updates, {}, function(err, receipt) {
            if (err) { console.error('client', {clientId, err, receipt}); }
            else if (receipt) {
              who = deref(receipt, 'value.username') || deref(receipt, 'value.email') || deref(receipt, 'value.description') || who;
            }

            return next();
          });

        }], function done() {
          msg += `(${who})`;
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


