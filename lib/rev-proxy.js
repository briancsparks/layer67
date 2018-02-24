
/**
 *  A super-capable reverse-proxy (or at least the beginnings of one.)
 *
 *  There is always something wrong with any reverse-proxy I come up with,
 *  but this should be different :). That is because I am using both curl
 *  and superagent (and any others that I would need to), in order to
 *  handle all the situations.
 *
 *   - Superagent has a problem with Proxies, curl doesn't.
 *   - Superagent can do it with one thread/process.
 */
const sg                      = require('sgsg');
const _                       = sg._;
const urlLib                  = require('url');
const tempy                   = require('tempy');
const fs                      = sg.extlibs.fs;

var   lib                     = {};

// Forward declare
var   saveFile, extFor;

/**
 *  Here it is.
 */
lib.revProxy = function(req, res, destUrlObj /*, options, callback*/ ) {
  var   argv      = _.rest(arguments, 3);
  const callback  = _.isFunction(_.last(argv)) ? argv.pop() : function(){};
  const options   = argv.shift()        || {};
  const verbose   = options.verbose     || (sg.verbosity() > 3);

  const origUrl   = urlLib.parse(req.url, true);
  var   urlObj    = _.extend({}, origUrl, destUrlObj);      // TODO: merge query params
  const destHref  = urlLib.format(urlObj);

  // Arguments to send to curl
  var   args      = options.args || [];

  // Verbose?
  if (verbose)    { args.push('-v'); }
  else            { args.push('-sS'); }

  args.push('-L');

  // Push the href
  args.push(destHref);

  // Set headers
  if (req.headers.accept) {
    args.push('-H', `Accept: ${req.headers.accept}`);
  }

  if (req.headers['user-agent']) {
    args.push('-H', `User-Agent: ${req.headers['user-agent']}`);
  }

  if (req.headers['content-type']) {
    args.push('-H', `Content-Type: ${req.headers['content-type']}`);
  }


  // Run!
  return sg.__run2({}, [function(result, next, last, abort) {
    if (!(req.method in {POST:true, PUT:true})) { return next(); }    /* This type does not have a body */

    // ---------- Have to wait for the body ----------
    return sg.getRawBody(req, function(err, XbodyX) {
      if (!sg.ok(err, XbodyX))            { return abort(err, 'Failed to get raw body'); }

      // Is the body so large that we need to upload it as a file?
      return saveFile(req, function(err, result) {
        if (!sg.ok(err, result))          { return abort(err, 'Failed to save body'); }

        // Body on the command line, or in a file
        if (result.body)                  { args.push('-X', req.method, '-d', result.body); }
        else if (result.filename)         { args.push('-X', req.method, '-d', '@'+result.filename); }

        return next();
      });
    });

  }, function(result, next, last, abort) {

    // ---------- Run the curl command ----------
    return sg.curl(args, function(err, response) {
      if (!sg.ok(err, response))          { return abort(err, 'Error response from upstream'); }

      // The result
      result.response = response;

      return next();
    });

  }], function last(err, result) {

    // ---------- Success! ----------
    sg._200(req, res, result.response);
    return callback(null, result.response);

  }, function abort(err, msg) {

    // ---------- Something went wrong - log to the console ----------
    console.error('Failed to reverse proxy to '+destHref, msg, err);
    console.error('  args: curl ', args);

    if (msg)          { sg._404(req, res, msg); }
    else              { sg._400(req, res, err); }

    return callback(err);
  });
};


/**
 *  Hides the complexity of maybe having to save the file to
 *  disk (because it is too big for the command-line).
 */
saveFile = function(req, callback) {

  // Must already have a body
  if (!req.bufferChunks)                  { return callback('ENOBODY'); }

  // First, determine if it is too big or not
  if (req.bufferChunks.length <= 50)      { return callback(null, { body: req.bufferChunks }); }

  // It is too big, must write it to a file
  const ext         = extFor(req);

  const tmpfilename = sg.isnt(ext) ? tempy.file() : tempy.file({extension: ext});

  return fs.writeFile(tmpfilename, req.bufferChunks, function(err) {
    return callback(err, {filename:tmpfilename});
  });
};

/**
 *  What is the extension for the body?
 */
extFor = function(req) {
  const contentType = req.headers && req.headers['content-type'];

  if (contentType.endsWith('json'))   { return 'json'; }

  return;
};



_.each(lib, (value, key) => {
  exports[key] = value;
});

