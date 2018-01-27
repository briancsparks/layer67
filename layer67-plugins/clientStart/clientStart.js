
/**
 *
 */
const sg                      = require('sgsg');
const _                       = sg._;
const unhandledRoutes         = require('../../lib/unhandled-routes');
const AWS                     = require('aws-sdk');
const http                    = require('http');
const urlLib                  = require('url');

const ARGV                    = sg.ARGV();
const argvGet                 = sg.argvGet;
const argvExtract             = sg.argvExtract;
const setOnn                  = sg.setOnn;
const deref                   = sg.deref;
const unhandled               = unhandledRoutes.unhandled;
const dynamoDb                = new AWS.DynamoDB({region: 'us-east-1'});

const main = function() {

  const ip          = ARGV.ip       || '127.0.0.1';
  const port        = ARGV.port;

  if (!port) {
    console.log('Need --port=');
    process.exit(2);
  }

  const server = http.createServer(function(req, res) {

    // We are a long-poll server
    req.setTimeout(0);
    res.setTimeout(0);

    var result = {upstream: 'http://prod.mobilewebassist.net/api/v1', upstreams:{}};

    const url = urlLib.parse(req.url, true);
    if (url.pathname.toLowerCase() !== '/clientstart') {
      return unhandled(req, res);
    }

    return sg.getBody(req, function(err) {
      if (err) { return unhandled(req, res); }

      // Collect all the interesting items
      const all = sg._extend(url.query, req.bodyJson || {});

      return sg.__each(['project', 'partner', 'client'], function(idType, next) {
        // First, did the request have this type if id?
        if (!all[idType+'Id']) { return next(); }

        const name = all[idType+'Id'];

        var query = {};
        query.TableName     = 'clientsDb';
        query.Key           = {id:{S:`${idType}_${name}`}};

        return dynamoDb.getItem(query, function(err, data_) {

          if (!sg.ok(err, data_)) { return next(); }

          const data = {upstreams: sg.reduce(deref(data_, 'Item.upstreams.M'), {}, function(m, v, k) {
            return sg.kv(m, k, v.S || v.N || v.SS);
          })};

          const upstreams = sg.extract(data, 'upstreams');
          _.extend(result, data);
          _.extend(result.upstreams, upstreams);
          return next();
        });
      }, function() {
        console.log('HQ handling: '+req.url+', sending to: '+result.upstream);
        return sg._200(req, res, result);
      });

    });

  });

  server.listen(port, ip, function() {
    console.log(`Listening on ${ip}:${port}`);
  });
};






main();

