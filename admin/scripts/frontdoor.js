
/**
 *
 */
const sg                      = require('sgsg');
const _                       = sg._;
const util                    = require('util');
const child_process           = require('child_process');
const path                    = require('path');
const http                    = require('http');
const urlLib                  = require('url');
const formidable              = require('formidable');
const child_process           = require('child_process');
const fs                      = sg.extlibs.fs;
const sh                      = sg.extlibs.shelljs;
const chalk                   = sg.extlibs.chalk;

sg.requireShellJsGlobal();

const ARGV                    = sg.ARGV();
const argvGet                 = sg.argvGet;
const argvExtract             = sg.argvExtract;
const setOnn                  = sg.setOnn;
const deref                   = sg.deref;
const spawn                   = child_process.spawn;
const exec                    = child_process.exec;
const execEz                  = util.promisify(sg.execEz);

const uploadDir               = path.join('/tmp', 'frontdoor', 'upload');
const zzPackagesDir           = path.join(process.env.HOME, 'zz_packages');

var   g_execLabels = {stdout:'stdout', stderr:'stderr'};
var   zzPackages;

chalk.enabled = true;
chalk.level   = 2;

// We build 2 objects to export like we usually do for `lib` -- adding `cmds`
//   This is so that only `cmds` are avilable via the HTTP path.
var lib   = {};
var cmds  = {};

const main = function() {

  if (!ARGV.port) { console.error('Need --port='); process.exit(2); }
  if (!ARGV.ip)   { console.error('Need --ip='); process.exit(2); }

  const server = http.createServer((req, res) => {

    // Long held connections
    req.setTimeout(0);
    res.setTimeout(0);

    const url       = urlLib.parse(req.url, true);
    var   pathParts = _.rest(url.pathname.split('/'));

    const sudo      = consumeIfEq(pathParts, 'sudo');
    const [ a, b ]  = pathParts;

    setOnn(url, 'query.sudo', sudo);

    if (a === 'exit' || a === 'close') {
      sg._200(req, res, {closing:true});
      setTimeout(function() { server.close(); }, 100);
      return;
    }

    if (cmds[a] && _.isFunction(cmds[a][b])) {
      return cmds[a][b](req, res, url, _.rest(pathParts, 2));

    } else if (_.isFunction(cmds[a])) {
      return cmds[a](req, res, url, _.rest(pathParts));
    }

    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain');
    res.end('Not Found\n');
  });

  server.listen(ARGV.port, ARGV.ip, () => {
    console.log(`Server running at http://${ARGV.ip}:${ARGV.port}/`);
  });

};

const handleUpload = lib.handleUpload = function(req, res, callback) {

  var   form    = new formidable.IncomingForm();
  var   result  = {};

  form.keepExtensions = true;
  form.uploadDir      = uploadDir;

  // ---------- On:progress ----------
  form.on('progress', (recd, expected) => {
    console.log('Info:progress', {recd, expected});
  });

  // ---------- On:file ----------
  form.on('file', (name, file) => {
    console.log('Info:file', {name, size: file.size, origName: file.name});
  });

  // ---------- parse ----------
  form.parse(req, (err, fields_, files) => {
    // fs.unlink, fs.rmdir

    var fields, body;
    if (sg.ok(err, fields_, files)) {
      //console.log(`uploaded`, fields_, _.map(files,(f,k) => {return sg.kv(k,_.pick(f, 'name','path','size')); }));

      result.files    = sg.deepCopy(files);
      result.fields   = sg.deepCopy(fields_);
    }

  });

  // ---------- On:end ----------
  form.on('end', () => {
    return callback(null, result);
  });

  // ---------- On:error ----------
  form.on('error', (err) => {
    console.error('Error', err);
  });

  // ---------- On:aborted ----------
  form.on('aborted', () => {
    console.log('Info:aborted');
  });
};

cmds.run   = {};
cmds.build = {};

cmds.put = function(req, res, url, restOfPath_) {
  var restOfPath = _.toArray(restOfPath_);

  if (_.first(restOfPath) === 'home') {
    restOfPath = [...process.env.HOME, ..._.rest(restOfPath)];
  }

  const dirpath = path.join('', ...restOfPath);
  const sudo    = url.query.sudo;
  const mode    = url.query.mode  || url.query.chmod;
  const own     = url.query.own   || url.query.chown;

  return handleUpload(req, res, function(err, uploadResult) {
    if (sg.ok(err, uploadResult)) {
      _.each(uploadResult.files, function(file, fieldName) {
        const dest = path.join(dirpath, fieldName);

        su_cp(sudo, file.path, dest);

        if (mode) {
          su_chmod(sudo, mode, dest);
        }

        if (own) {
          su_chown(sudo, own, dest);
        }
      });
    }
  });
};

const execSync = function(command, options) {
  console.log('exec-ing: '+command);

  if (options) {
    return child_process.execSync(command, options);
  }

  return child_process.execSync(command);
};

lib.su_chown = function(sudo, mode, dest) {

  if (!sudo) {
    chown(mode, dest);

  } else {

    /* otherwise */
    try {
      const stdout = execSync(`/usr/bin/sudo chown '${mode}' '${dest}'`);

      if (stdout) {
        console.log(stdout);
      }
    } catch(error) {
      console.error(error);
      return;
    }
  }
};

lib.su_chmod = function(sudo, mode, dest) {

  if (!sudo) {
    chmod(mode, dest);

  } else {

    /* otherwise */
    try {
      const stdout = execSync(`/usr/bin/sudo chmod '${mode}' '${dest}'`);

      if (stdout) {
        console.log(stdout);
      }
    } catch(error) {
      console.error(error);
      return;
    }
  }
};

lib.su_cp = function(sudo, src, dest) {

  if (!sudo) {
    cp(src, dest);

  } else {

    /* otherwise */
    try {
      const stdout = execSync(`/usr/bin/sudo cp '${src}' '${dest}'`);

      if (stdout) {
        console.log(stdout);
      }
    } catch(error) {
      console.error(error);
      return;
    }
  }
};

cmds.build.bash = cmds.build.sh = cmds.run.bash = cmds.run.sh = function(req, res, url, restOfPath) {

  var   result = {exits:[]};

  const stdoutLabel = url.query.stdoutLabel || url.query.stdout || url.query.label || g_execLabels.stdout;
  const stderrLabel = url.query.stderrLabel || url.query.stderr || url.query.label || g_execLabels.stderr;

  var   sectionLabel = '';

  const evalLine = function(line, isLast) {
    const m = line.match(/~~~annsect~~~ [(][(](.*)[)][)] [(][(](.*)[)][)]/i);
    if (m) {
      sectionLabel = m[2];
      return "---------- "+m[1]+" ----------";
    }
    return line;
  };

  const toStdout = function(line_, isLast) {
    if (isLast && line_.length === 0) { return; }
    const line = evalLine(line_, isLast);
    process.stdout.write(`${tpad(`${stdoutLabel}.${sectionLabel}`, 28)}: ${line}\n`);
  };

  const toStderr = function(line_, isLast) {
    if (isLast && line_.length === 0) { return; }
    const line = evalLine(line_, isLast);
    process.stderr.write(`${tpad(`${stderrLabel}.${sectionLabel}`, 28)}: ${chalk.red(line)}\n`);
  };

  return handleUpload(req, res, function(err, uploadResult) {
    if (sg.ok(err, uploadResult)) {

      var   execOptions = {async:true, timeout:0, shell: '/bin/bash'};

      if (url.cwd) {
        execOptions.cwd = url.cwd;
      }

      var scriptsToRun = [];
      _.each(uploadResult.files, function(file, fieldName) {
        if (test('-f', file.path)) {
          chmod('u+x', file.path);
          scriptsToRun.push(file.path);
        }
      });

      // Now, run them
      const spawnOptions = {
        cwd:  process.env.HOME,
        env:  process.env
      };

      var index = 0;
      return sg.__each(scriptsToRun, function(path, next) {
        const runIndex    = index;
        var   runResult   = {outlen:0, errlen:0, index, path};
        var   child       = child_process.spawn(path, [], spawnOptions);

        var stdoutRemainder = '';
        child.stdout.on('data', function(chunk) {
          var lines = (stdoutRemainder + chunk).split('\n');
          stdoutRemainder = lines.pop();

          runResult.outlen += chunk.length;
          _.each(lines, line => { toStdout(line); });
        });

        var stderrRemainder = '';
        child.stderr.on('data', function(chunk) {
          var lines = (stderrRemainder + chunk).split('\n');
          stderrRemainder = lines.pop();

          runResult.errlen += chunk.length;
          _.each(lines, line => { toStderr(line); });
        });

        child.on('close', function(code) {

          toStdout(stdoutRemainder, true);
          toStderr(stderrRemainder, true);

          _.extend(runResult, {code});
          result.exits[runIndex] = runResult;
          return next();
        });

        index += 1;

      }, function done() {

        return sg._200(req, res, result);
      });
    }

    /* otherwise */
    return sg._400(req, res);
  });
};



zzPackages = cmds.zzPackages = function(pathname) {
  return path.join(zzPackagesDir, pathname);
};


lib.cmds = cmds;
_.each(lib, (value, key) => {
  exports[key] = value;
});

fs.mkdirpSync(uploadDir);

if (__filename === process.argv[1]) {
  main();
}

// Truncate and pad
function tpad(str, len) {
  return sg.lpad(str.substr(0,len), len);
}

function consumeIfEq(arr, value) {
  if (arr.length === 0) { return; }

  if (arr[0] === value) {
    arr.shift();
    return value;
  }

  return;
}


