
/**
 *  Does the main routing function for protected and unprotected routes. (Routes that require a
 *  client SSL cert are 'protected'.)
 *
 *  Longer routes are matched first:
 *
 *      /proj/[x]api/vXX/service1/...
 *
 *        The above is the longest route that will be matched and routed. This form allows
 *        the `proj` project's `service1` handler to handle all routes for that service,
 *        without having to route all the services itself.
 *
 *      /proj/[x]api/vXX/...
 *
 *        The above is routed to the `proj` project.
 *
 *      /proj/...
 *
 *        The above is the default for `proj`.
 *
 *  Then, theres the color. Xapi-router supports blue/green deployments. The client can
 *  (1) ask for a specific color, (2) ask for main/next, or (3) ask for nothing (and
 *  get what the project wants them to have.
 *
 *  The color comes after the vXX part of the path, like: .../vXX/teal/... and can be one of
 *  many white-listed color names, or `main` or `next` (of course, `main` is kinda pointless.)
 *
 */
const sg                      = require('sgsg');
const _                       = sg._;
const unhandledRoutes         = require('../../lib/unhandled-routes');
const redisUtils              = require('../../lib/redis-utils');
const utils                   = require('../../lib/utils');
const adminsDb                = require('../../lib/admins-db');
const http                    = require('http');
const urlLib                  = require('url');
const redisLib                = require('redis');
var   MongoClient             = require('mongodb').MongoClient;

const ARGV                    = sg.ARGV();
const argvGet                 = sg.argvGet;
const argvExtract             = sg.argvExtract;
const setOnn                  = sg.setOnn;
const deref                   = sg.deref;
const unhandled               = unhandledRoutes.unhandled;
const redisPort               = argvGet(ARGV, 'redis-port')             || 6379;
const redisHost               = argvGet(ARGV, 'redis-host')             || 'redis';
var   namespace               = 'layer67';
const argvStack               = ARGV.stack;
const argvColor               = ARGV.color;

const redis                   = redisLib.createClient(redisPort, redisHost);

var   bootstrap;

const main = function() {
  return bootstrap(function(err, db, config_) {
    const adminsDb = db.db('layer67').collection('admins');
    const configDb = db.db('layer67').collection('config');

    const ip          = ARGV.ip       || '127.0.0.1';
    const port        = ARGV.port;

    if (!port) {
      console.log('Need --port=');
      process.exit(2);
    }

    var serviceIndex = 0;

    const server = http.createServer(function(req, res) {

      // We are a long-poll server
      req.setTimeout(0);
      res.setTimeout(0);

      const url   = urlLib.parse(req.url, true);
      const parts = _.rest(url.pathname.toLowerCase().split('/'));

      const rsvr            = url.query.rsvr;
      const requestedStack  = utils.stackForRsvr(rsvr);

      var   projectId;
      var   service;
      var   serviceName;
      var   colorIndex;
      var   extraOffset = 0;
      var   color;
      var   serviceNames = [];
      return sg.__run([function(next) {

        // ---------- Verify user, if necessary ----------

        // A header of X-Client-Verify means nginx was told to check client certs
        if (req.headers['x-client-verify']) {
          var msg = 'verify...';
          if (req.headers['x-client-verify'] !== 'SUCCESS') { msg+='fail'; console.error(msg); return sg._403(req, res); }
          msg += 'SUCCESS.';

          const serverSigner   = req.headers['x-client-i-dn'];
          const clientCryptoId = req.headers['x-client-s-dn'];
          const email          = (utils.parseClientCert(clientCryptoId || '') || {}).CN;

          //console.log(req.headers);
          console.log(clientCryptoId);

          if (!serverSigner || !clientCryptoId || !email) {
            msg+='!headers';
            console.error(msg);
            return sg._403(req, res);
          }
          msg=email+','+msg+',good-headers';

          // Now, look up the email in our DB
          return adminsDb.find({email:email}).toArray(function(err, result) {

            if (!sg.ok(err, result)) { msg+='unknown'; console.error(msg); return sg._403(req, res); }
            msg+=',is-in-the-db';

            const role = result[0].role;
            if (role !== 'admin') { msg+='!admin'; console.error(msg); return sg._403(req, res); }
            msg+=',Pass.';
            console.log(msg);

            return next();
          });
        }

        // No client cert required
        return next();

      }, function(next) {

        // We do not route to root
        if (parts.length === 0)     { return sg._400(req, res); }
        return next();

      }, function(next) {

        // Get the project
        projectId = parts[0];

        //
        // We will route to one of these forms (the longest that has a service running.)
        //
        //  /proj/xapi/v1/color/serviceRoute/...
        //  /proj/xapi/v1/color/...
        //

        // If there is a color in the route, use it
        if (parts.length >= 3 && utils.theColor(parts[3])) {
          color = utils.theColor(parts[3]);
          if (parts.length >= 4) {
            serviceNames.push({path:'/'+parts.slice(0, 3).join('/')+'/'+color+'/'+parts[4], colorIndex:3});
          }
          serviceNames.push({path:'/'+parts.slice(0, 3).join('/')+'/'+color, colorIndex:3});
          return next();
        }

        /* otherwise */

        // If the request has `next` or `main` in place of the color...
        var   mainNext;

        if (parts.length >= 3 && parts[3] in {main:true, next:true}) {
          mainNext    = parts[3];
          extraOffset = 0;
        } else {
          mainNext    = 'main';
          extraOffset = -1;
        }

        if (mainNext) {
          const which = (mainNext === 'next' ? 'nextColor' : 'mainColor')+'.'+(requestedStack || 'prod');
          return configDb.find({projectId, [which] : {$exists:true}}).next(function(err, doc) {
            if (!sg.ok(err, doc))    { return next(); }

            // Is it a valid color?
            if (!(color = utils.theColor(deref(doc, which)))) { return next(); }

            if (parts.length >= 4) {
              serviceNames.push({path:'/'+parts.slice(0, 3).join('/')+'/'+color+'/'+parts[4 + extraOffset], colorIndex:3});
            }
            serviceNames.push({path:'/'+parts.slice(0, 3).join('/')+'/'+color, colorIndex:3});

            return next();
          });
        }

        return next();

      }, function(next) {

        //
        // We will route to one of these forms (the longest that has a service running.)
        //
        //  /proj/xapi/v1/serviceRoute/...
        //  /proj/xapi/v1/...
        //  /proj/...
        //

        // See if one of the forms is running
        if (parts.length >= 3) {
          if (parts[1].match(/(xapi|api)/) && parts[2].match(/v[0-9.]+/)) {

            // Try for the version with xapi/v1/serviceRoute
            if (parts.length >= 4 && !utils.theColor(parts[3])) {
              serviceNames.push({path:'/'+parts.slice(0, 4).join('/'), colorIndex:-1});
            }

            // Try for the version with xapi/v1
            serviceNames.push({path:'/'+parts.slice(0, 3).join('/'), colorIndex:-1});
          }
        }

        // If we do not find the specific service, see if we can find the project
        serviceNames.push({path:'/'+parts[0], colorIndex:-1});

        // Now, simply loop over the forms, and see if anyone has registered for any of them
        return sg.__each(serviceNames, function(serviceNameData, next) {
          const serviceName_ = serviceNameData.path;

          // Once we find a service, do not need to keep looking
          if (service)    { return next(); }

          // Call Redis to see if the service is available.
          return getServices(serviceName_, requestedStack, (err, services) => {
            if (!sg.ok(err, services)) { return next(); }

            // Are there any services available?
            if (services.length === 0) { return next(); }

            // If so, pick one
            if (++serviceIndex >= services.length) {
              serviceIndex -= services.length;
              if (serviceIndex >= services.length) {
                serviceIndex = 0;
              }
            }

            // We found a service
            service     = services[serviceIndex++];
            serviceName = serviceName_;
            colorIndex  = serviceNameData.colorIndex;

            return next();
          });
        }, next);

      }, function(next) {

        //
        // This function will respond with a not-found, unless we found a service
        //

        // Move on, if we have a service
        if (service) { return next(); }

        // No service, just 404
        if (!isProd()) {
          console.log('No services found for: ', _.pluck(serviceNames, 'path'));
        }

        return unhandled(req, res, 404);

      }], function done() {

        // Got one -- Magic nginx potion
        // location ~* ^/rpxi/GET/(.*) {...}
        // location ~* ^/rpxissl/GET/(.*) {...}

        // TODO: if we are rpxi-ing ssl, use ssl version
        const svc     = service.replace(/(http|https):[/][/]/i, '');
        var   useUrl  = req.url.split('/');

        if (colorIndex >= 0) {
          useUrl.splice(colorIndex+1, 1+extraOffset, color);
        }

        const redir   = sg.normlz(`/rpxi/${req.method.toUpperCase()}/${svc}/${useUrl.join('/')}`);

        console.log('xapi: '+url.pathname+' --> '+redir);

        res.statusCode = 200;
        res.setHeader('X-Accel-Redirect', redir);
        res.end();
      });

    });

    server.listen(port, ip, function() {
      console.log(`Xapi listening on ${ip}:${port}`);
    });
  });
};




const maintainTime = function() {
  // First, schedule next maintenance
  setTimeout(maintainTime, 1000*30);
  hourHasBeenComputed = false;
};
maintainTime();

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

function getServices(name, stack_, callback) {
  const stack   = stack_ || argvStack;
  const root    = ['service', stack, name].join(':');

  var result = [];
  return sg.__eachll(getThreeHours(), (h, next) => {
    const redisKey = `${root}:${h}`;

    return redis.smembers(redisKey, function(err, members) {

      if (!sg.ok(err, members)) { return next(); }
      if (members.length === 0) { return next(); }

      return redis.mget(members, function(err, services) {
        if (!sg.ok(err, services)) { return next(); }

        result = result.concat(services);
        return next();
      });
    });
  }, function() {
    return callback(null, _.compact(result));
  });
}

function getThreeHours() {
  const current = redisUtils.getHour();
  const prev    = ('0' + (+current === 0 ? 23 : +current -1)).slice(-2);
  const next    = ('0' + (+current === 23 ? 0 : +current +1)).slice(-2);

  return [prev, current, next];
}

function isProd() {
  return process.env.NODE_ENV === 'production';
}


