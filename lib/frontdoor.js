
/**
 *
 */
const sg                      = require('sgsg');
const _                       = sg._;
const http                    = require('http');
const urlLib                  = require('url');

const ARGV                    = sg.ARGV();
const argvGet                 = sg.argvGet;
const argvExtract             = sg.argvExtract;
const setOnn                  = sg.setOnn;
const deref                   = sg.deref;

var   lib   = sg.extend(require('../admin/scripts/frontdoor'));
const cmds  = lib.cmds;

lib.runFrontdoorServer = function(argv, context, callback) {

  const ip        = argvGet(argv, 'ip')       || ARGV.ip        || '127.0.0.1';
  const port      = argvGet(argv, 'port')     || ARGV.port      || 12340;
  const exitable  = argvGet(argv, 'exitable') || ARGV.exitable;

  const server = http.createServer((req, res) => {

    // Long held connections
    req.setTimeout(0);
    res.setTimeout(0);

    const url       = urlLib.parse(req.url, true);
    const pathParts = _.rest(url.pathname.split('/'));

    const [ a, b ]  = pathParts;

    if (exitable) {
      if (a === 'exit' || a === 'close') {
        sg._200(req, res, {closing:true});
        setTimeout(function() { server.close(); }, 100);
        return;
      }
    }

    if (cmds[a] && _.isFunction(cmds[a][b])) {
      return cmds[a][b](req, res, url, _.rest(pathParts, 2).join('/'));

    } else if (_.isFunction(cmds[a])) {
      return cmds[a][b](req, res, url, _.rest(pathParts).join('/'));
    }

    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain');
    res.end('Not Found\n');
  });

  server.listen(port, ip, () => {
    console.log(`Server running at http://${ip}:${port}/`);
    return callback(null, {ip, port});
  });

};



_.each(lib, (value, key) => {
  exports[key] = value;
});



