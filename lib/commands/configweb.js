
/**
 *
 */
const sg                      = require('sgsg');
const _                       = sg._;
const raLib                   = sg.include('run-anywhere') || require('run-anywhere');
const path                    = require('path');
const touch                   = require('touch');
const tempy                   = require('tempy');
const fs                      = sg.extlibs.fsExtra;
const sh                      = sg.extlibs.shelljs;
const helpers                 = require('../../admin/scripts/frontdoor');

const argvGet                 = sg.argvGet;
const argvExtract             = sg.argvExtract;
const setOnn                  = sg.setOnn;
const deref                   = sg.deref;

const blueCoatIps = [
  '8.28.16.0/24',
  '103.246.38.0/24',
  '199.91.135.0/24',
  '199.116.169.0/24',
  '199.19.248.0/24',
  '199.19.249.0/24',
  '199.19.250.0/24',
  '199.19.251.0/24',
  '199.19.252.0/24',
  '199.19.253.0/24',
  '199.19.254.0/24',
  '199.19.255.0/24'
];

var lib = {cmds:{}};

/**
 *  Makes configuration changes on the instance to support the request.
 */
lib.cmds['server-config'] = function(req, res, url, restOfPathParts) {

  var   all   = sg.extend(url.query || {});

  return sg.getBody(req, function(err, bodyJson) {
    if (sg.ok(err, bodyJson)) {
      all = sg._extend(all, bodyJson || {});
    }

    return lib.saveServerConfig(all, {}, function(err, result) {
      if (!sg.ok(err, result))    { return sg._400(req, res, err); }

      return sg._200(req, res, result);
    });
  });
};

lib.saveServerConfig = function() {
  var   u               = sg.prepUsage();

  var ra = raLib.adapt(arguments, (argv, context, callback) => {
    const buildServerConfig   = ra.wrap(lib.buildServerConfig);

    const fqdn        = argvGet(argv, u('fqdn',  '=fqdn', 'The fqdn.'));

    if (!fqdn)        { return u.sage('fqdn', 'Need fqdn.', callback); }

    const filename    = path.join('/etc/nginx/sites-enabled', fqdn+'.conf');

    return sg.__run2({}, callback, [function(result, next, last, abort) {
      return buildServerConfig(argv, function(err, config) {
        if (!sg.ok(err, config))  { return abort('saveServerConfig.buildServerConfig'); }

        result.config = config;
        return next();
      });

    }, function(result, next, last, abort) {
      const tmpFilename = tempy.file({extension: 'conf'});

      const config = sg.extract(result, 'config');
      return fs.writeFile(tmpFilename, config, function(err) {
        if (!sg.ok(err)) { return abort(); }

        if (helpers.su_cp('sudo', tmpFilename, filename)) {
          helpers.su_chmod('sudo', '644', filename);
          helpers.su_chown('sudo', 'root', filename);
        }

        return next();
      });

    }], function abort(err, msg) {
      if (msg)  { return sg.die(err, callback, msg); }
      return callback(err);
    });
  });

};

/**
 *  Makes configuration changes on the instance to support the request.
 */
lib.cmds['root-config'] = function(req, res, url, restOfPathParts) {

  var   all   = sg.extend(url.query || {});

  return sg.getBody(req, function(err, bodyJson) {
    if (sg.ok(err, bodyJson)) {
      all = sg._extend(all, bodyJson || {});
    }

    return lib.saveRootConfig(all, {}, function(err, result) {
      if (!sg.ok(err, result))    { return sg._400(req, res, err); }

      return sg._200(req, res, result);
    });
  });
};

lib.saveRootConfig = function() {
  var   u               = sg.prepUsage();

  var ra = raLib.adapt(arguments, (argv, context, callback) => {
    const buildRootConfig   = ra.wrap(lib.buildRootConfig);

    const filename    = argvGet(argv, 'filename,file')    || '/etc/nginx/nginx.conf';

    return sg.__run2({}, callback, [function(result, next, last, abort) {
      return buildRootConfig(argv, function(err, config) {
        if (!sg.ok(err, config))  { return abort('saveRootConfig.buildRootConfig'); }

        result.config = config;
        return next();
      });

    }, function(result, next, last, abort) {
      const tmpFilename = tempy.file({extension: 'conf'});

      const config = sg.extract(result, 'config');
      return fs.writeFile(tmpFilename, config, function(err) {
        if (!sg.ok(err)) { return abort(); }

        if (helpers.su_cp('sudo', tmpFilename, filename)) {
          helpers.su_chmod('sudo', '644', filename);
          helpers.su_chown('sudo', 'root', filename);
        }

        return next();
      });

    }], function abort(err, msg) {
      if (msg)  { return sg.die(err, callback, msg); }
      return callback(err);
    });
  });

};

lib.buildRootConfig = function() {
  var   u               = sg.prepUsage();

  var ra = raLib.adapt(arguments, (argv, context, callback) => {

    const numWorkers          = 8;
    const numConns            = 128;
    const bodySize            = '25M';
    const socketIo            = false;
    const denyIps             = blueCoatIps.concat(argv.denyIps || []);

    var   result = [];

    result.push(`
# vim: filetype=nginx:
user ${process.env.USER} staff;
worker_processes ${numWorkers};

events {
  worker_connections ${numConns};
}`);

    result.push(`
http {
  default_type            application/octet-stream;
  client_body_temp_path   /var/tmp/nginx/client_body_temp;
  client_max_body_size    ${bodySize};`);

    result.push(`
  # Go away blue-coat`);

    _.each(denyIps, ip => {
      result.push(`  deny ${ip};`);
    });

    result.push(`
  log_format main '$remote_addr - $remote_user [$time_local] "$request" $status $body_bytes_sent $request_time $host "$http_referer" "$http_user_agent" "$http_x_forwarded_for"';
  log_format sock '$remote_addr - "$request" $status $body_bytes_sent $host';`);

    if (socketIo) {
      // TODO: fix addresses
      result.push(`
  upstream console_socketios {
    ip_hash;

    server 10.11.21.200:54321 ;
    server 10.11.0.10:54321 ;
    server 10.11.21.100:54321 ;
  }`);
    }

    result.push(`
  map $http_upgrade $connection_upgrade {
    default upgrade;
    "" close;
  }`);

    const defServerConfig = sg._extend({
      fqdn    : 'localdef'
    }, argv);

    return lib.buildServerConfig(defServerConfig, context, function(err, serverConfig) {
      if (sg.ok(err, serverConfig)) {
        result.push(serverConfig);
      }

    result.push(`
  include sites-enabled/*;
}`);
      return callback(null, result.join('\n'));
    });
  });
};




lib.buildServerConfig = function() {
  var   u               = sg.prepUsage();

  var ra = raLib.adapt(arguments, (argv, context, callback) => {

    const fqdn                = argvGet(argv, 'fqdn')                       || 'hq67.mobilewebassist.net';
    const fqdnParts           = fqdn.split('.');
    const domainName          = _.last(fqdnParts, 2).join('.');
    const siteName            = _.first(_.last(fqdnParts, 2));
    const fileFqdn            = fqdn.replace(/[^a-z0-9]+/gi, '-');

    const wwwroot             = path.join(process.env.HOME, 'www', fileFqdn, 'webroot');
    const socketIo            = false;
    const revProxyTimeout     = 5000;
    const logdir              = argvGet(argv, 'logdir')                     || '/var/log/nginx';
    const logfile             = path.join(logdir, fileFqdn+'.log');
    const webtierRouter       = argvGet(argv, 'webrouter')                  || 'http://127.0.0.1:5776';
    const isDefault           = (argvGet(argv, 'default') && 'default')     || "";

    const useHttp             = argvGet(argv, 'http');
    const useHttps            = argvGet(argv, 'https');
    const certfile            = argvGet(argv, 'certfile')                   || path.join('/etc/nginx/certs', fqdn+'.crt');
    const keyfile             = argvGet(argv, 'keyfile')                    || path.join('/etc/nginx/certs', fqdn+'.key');

    // ssl_client_certificate /etc/nginx/certs/mobilewebassist_root_client_ca.crt
    const requireClientCerts  = argvGet(argv, 'client-certs,client');
    const clientCert          = requireClientCerts                    && (argvGet(argv, 'client-cert,client')   || path.join('/etc/nginx/certs', siteName+'_root_client_ca.crt'));

    var   configJson_          = {};

    setOnn(configJson_, 'fqdn',                  fqdn);
    setOnn(configJson_, 'wwwroot',               wwwroot);
    setOnn(configJson_, 'revProxyTineout',       revProxyTimeout);
    setOnn(configJson_, 'logfile',               logfile);
    setOnn(configJson_, 'webtierRouter',         webtierRouter);
    setOnn(configJson_, 'isDefault',             isDefault);
    setOnn(configJson_, 'useHttp',               useHttp);
    setOnn(configJson_, 'useHttps',              useHttps);
    setOnn(configJson_, 'certfile',              certfile);
    setOnn(configJson_, 'keyfile',               keyfile);
    setOnn(configJson_, 'requireClientCerts',    requireClientCerts);
    setOnn(configJson_, 'clientCert',            clientCert);

    const configJson = JSON.stringify(configJson_);

    var   result = [];

    result.push(`
  server {
    server_name ${fqdn};
    root ${wwwroot};
    access_log ${logfile} main;`);

    sh.mkdir('-p', wwwroot);
    //sh.mkdir('-p', logdir);

    if (useHttp) {
      result.push(`
    listen 80 ${isDefault};`);
    }

    if (useHttps) {
      // TODO: Get (or generate) the certs

      result.push(`
    listen 443 ssl ${isDefault};
    ssl_certificate ${certfile};
    ssl_certificate_key ${keyfile};
    ssl_protocols TLSv1 TLSv1.1 TLSv1.2;
    ssl_ciphers HIGH:!aNULL:!MD5;`);
    }

    if (requireClientCerts) {
      // TODO: Get (or generate) the certs

      result.push(`
    # Require client certificate
    ssl_client_certificate ${clientCert};
    ssl_verify_client optional;`);
    }

    if (socketIo) {
      result.push(`
    location ~* ^/socket.io.* {
      access_log /var/log/nginx/sock.log sock;
      proxy_http_version 1.1;
      proxy_pass http://console_socketios;
    }`);
    }

    // TODO: include extra routes file

    result.push(`
    location /nginx_status {
      stub_status on;
      access_log off;
      allow 127.0.0.1;
      allow 10.0.0.0/8;
      deny all;
    }`);

    result.push(`
    include /etc/nginx/rpxi/reverse-targets.conf;`);

    result.push(`
    location / {
      try_files maintenance.html $uri $uri/index.html $uri.html @router;
    }`);

    result.push(`
    location @router {
      internal;

      proxy_connect_timeout                 ${revProxyTimeout};
      proxy_send_timeout                    ${revProxyTimeout};
      proxy_read_timeout                    ${revProxyTimeout};
      send_timeout                          ${revProxyTimeout};
      proxy_redirect                        off;`);

    if (requireClientCerts) {
      result.push(`
      proxy_set_header X-Client-Verify      $ssl_client_verify;
      proxy_set_header X-Client-I-Dn        $ssl_client_i_dn;
      proxy_set_header X-Client-S-Dn        $ssl_client_s_dn;
      #proxy_set_header X-Client-V-End       $ssl_client_v_end;
      proxy_set_header X-Client-Serial      $ssl_client_serial;`);
    }

      result.push(`
      proxy_set_header X-Real-IP            $remote_addr;
      proxy_set_header X-Forwarded-For      $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto    $scheme;
      proxy_set_header Host                 $http_host;
      proxy_set_header X-NginX-Proxy        true;
      proxy_set_header Connection           "";

      proxy_http_version                    1.1;
      proxy_pass                            ${webtierRouter};
    }`);

      result.push(`
      # CONFIG_JSON ${configJson}`);

      result.push(`
  }`);

      return callback(null, result.join('\n'));
  });
};


_.each(lib, (value, key) => {
  exports[key] = value;
});

