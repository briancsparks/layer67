
/**
 *
 *
 * var hpNetCidrs          = ['15.0.0.0/10', '15.64.0.0/11', '15.96.0.0/13', '66.27.48.0/24'];
 *
 * TODO: Peering
 *
 */
const sg                      = require('sgsg');
const _                       = sg._;
const raLib                   = sg.include('run-anywhere') || require('run-anywhere');
const AWS                     = require('aws-sdk');
const awsService              = require('../aws-creds').awsService;
const fs                      = sg.extlibs.fsExtra;
const util                    = require('util');
const tempy                   = require('tempy');

const argvGet                 = sg.argvGet;
const argvExtract             = sg.argvExtract;
const setOnn                  = sg.setOnn;
const deref                   = sg.deref;

const hpNetCidrs              = ['15.0.0.0/10', '15.64.0.0/11', '15.96.0.0/13', '66.27.48.0/24'];
const accounts                = sg.parseOn2Chars(process.env.JSAWS_AWS_ACCTS, ',', ':')

const ec2                     = new AWS.EC2({region: 'us-east-1'});

var lib = {};

const sete = function(next, last, abort) {
  const eabort = function(callback) {
    return function() {
      return callback.apply(this, arguments);
    };
  };

  const enext = function(callback) {
    return function() {
      return callback.apply(this, arguments);
    };
  };

  const enag = function(callback) {
    return function() {
      return callback.apply(this, arguments);
    };
  };

  return {eabort, enext, enag};
};

lib.createStacks = function() {
  var   u               = sg.prepUsage();

  var ra = raLib.adapt(arguments, (argv, context, callback) => {
    const createTempl = ra.wrap(lib.createStackTemplates);

    const stackName   = argvGet(argv, u('stack', '=jelly-doughnuts', 'The name of the project stack.'));
    const classB      = argvGet(argv, u('class-b,b', '=12', 'class-b for cidr of prod vpc'));
    const classBt     = argvGet(argv, u('class-bt,bt,class-b-test', '=11', 'class-b for cidr of dev vpc'));
    const dryRun      = argvGet(argv, u('dry-run', '', 'Do not invoke AWS API'));

    if (!stackName)           { return u.sage('stackName', 'Need a stack name.', callback); }
    if (!classB)              { return u.sage('classB', 'Need class-b for cidr of prod vpc.', callback); }
    if (!classBt)             { return u.sage('classBt', 'Need class-b for cidr of dev vpc.', callback); }

    var devTemplate, prodTemplate;

    var   startingDevVpcs   = {};
    var   startingProdVpcs  = {};
    const StackName         = stackName;
    return sg.__run2({}, callback, [function(result, next, last, abort) {
      const { eabort, enext, enag } = sete(next, last, abort);

      return sg.__runll([function(next) {

        return awsService('EC2', 'dev').describeVpcs({}, function(err, data) {
          startingDevVpcs = _.pluck(data.Vpcs, 'VpcId');
          return next();
        });

      }, function(next) {
        return awsService('EC2', 'dev').describeVpcs({}, enext(function(err, data) {
          startingDevVpcs = _.pluck(data.Vpcs, 'VpcId');
          return next();
        }));

      }, function(next) {
        return awsService('EC2', 'prod').describeVpcs({}, function(err, data) {
          startingProdVpcs = _.pluck(data.Vpcs, 'VpcId');
          return next();
        });

      }, function(next) {

        return createTempl(argv, function(err, result) {
          if (!sg.ok(err, result)) { return abort('createStacks.createTempl'); }

          devTemplate  = result.dev;
          prodTemplate = result.prod;

          return next();
        });
      }], function() {
        return next();
      });

    }, function(result, next, last, abort) {
      const { eabort, enext, enag } = sete(next, last, abort);

      const templates = [{template: devTemplate, acctName: 'dev'}, {template: prodTemplate, acctName: 'prod'}];
      //const templates = [{template: devTemplate, acctName: 'dev'}];

      return sg.__eachll(templates, function(item, next) {
        const template    = item.template;
        const acctName    = item.acctName;

        const cf          = awsService('CloudFormation', acctName);
        var   tmpFilename = tempy.file({extension: 'json'});

        tmpFilename = '/tmp/'+acctName+'.json';

        console.error('template for '+acctName+' is at: '+tmpFilename, 'creating '+sg.numKeys(template.Resources)+' resources');
        return fs.writeFile(tmpFilename, JSON.stringify(template, null, 2), function(err) {
          if (!sg.ok(err))  { console.error('failed to write JSON'); return next(); }

          /* otherwise */
          var   params = sg._extend({StackName, DisableRollback: true}, {});

          if (dryRun) {
            inspect('Dry run of createStack:', params);
            return next();
          }

          params.TemplateBody = JSON.stringify(template);

          return cf.createStack(params, function(err, data) {

            // ---------- Poll until the stack is up ----------

            var inProgress, created, complete;
            return sg.until(function(again, last, count, elapsed) {
              if (count > 700) { return last(); }

              return sg.__runll([function(next) {
                return cf.listStackResources({StackName}, function(err, data) {
                  if (sg.ok(err, data)) {
                    const resources = _.map(data.StackResourceSummaries, resource => _.pick(resource, 'LogicalResourceId', 'ResourceStatus', 'ResourceStatusReason'));

                    // You can get the result of the _.pluck() to see what is still being built
                    inProgress = sg.numKeys(      _.pluck(_.filter(resources, resource => resource.ResourceStatus === 'CREATE_IN_PROGRESS'), 'LogicalResourceId'));
                    created    = sg.numKeys(      _.pluck(_.filter(resources, resource => resource.ResourceStatus === 'CREATE_COMPLETE'), 'LogicalResourceId'));

                    const statuses = _.groupBy(resources, 'ResourceStatus');
                    inspect('statuses', statuses);
                  }

                  return next();
                });

              }, function(next) {
                return cf.describeStacks({StackName}, function(err, data) {

                  complete = sg.reduce(data.Stacks, true, function(m, stack) {
                    return m && (stack.StackStatus === 'CREATE_COMPLETE')
                  });

                  return next();
                });

              }], function() {
                console.error(`Complete ${acctName} (${created}/${inProgress+created})? ${complete}`);

                if (complete) { return last(); }

                /* otherwise */
                return again(2500);
              });

            // Completion for the until() that waits for the stack to be created
            }, function done() {
              return next();
            });
          });
        });

      // Completion for when the __eachll finishes each template
      }, function() {

        if (argv.skip_2) {
          return last(null, result);
        }

        // ---------- Now, peer the VPCs ----------
console.error('noooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooo');
process.exit(2);

        var devVpc, prodVpc, newlyCreatedPcx;

        return sg.__run([function(next) {
          return awsService('EC2', 'dev').describeVpcs({}, function(devErr, devData) {
            return awsService('EC2', 'prod').describeVpcs({}, function(prodErr, prodData) {

              if (sg.ok(devErr,  devData))  { devVpc  = _.difference(_.pluck(devData.Vpcs,  'VpcId'), startingDevVpcs)[0]; }
              if (sg.ok(prodErr, prodData)) { prodVpc = _.difference(_.pluck(prodData.Vpcs, 'VpcId'), startingProdVpcs)[0]; }

//              const endingDevVpcs  = _.pluck(devData.Vpcs,  'VpcId');
//              const endingProdVpcs = _.pluck(prodData.Vpcs, 'VpcId');
//
//              result.newDevVpc     = _.difference(endingDevVpcs,  startingDevVpcs);
//              result.newProdVpc    = _.difference(endingProdVpcs, startingProdVpcs);

              inspect('Created Vpcs:', {prod: prodVpc, dev: devVpc});

              return next();
            });
          });

//        }, function(next) {
//          return awsService('EC2', 'dev').describeRouteTables({}, function(err, data) {
//            if (sg.ok(err, data)) { devRouteTables = data; }
//            return next();
//          });
//
//        }, function(next) {
//          return awsService('EC2', 'prod').describeRouteTables({}, function(err, data) {
//            if (sg.ok(err, data)) { prodRouteTables = data; }
//            return next();
//          });

        }, function(next) {

          const peeringStackName    = `${StackName}Peering`;

          var   args = {
            acct      : 'dev',
            vpc       : devVpc,
            owner2    : accounts.pub,
            vpc2      : prodVpc,
            cidr2     : `10.${classB}.0.0/16`,
            stack     : peeringStackName
          };

          const cf                  = awsService('CloudFormation', args.acct);
          const ec2                 = awsService('EC2', args.acct);

          return ec2.describeVpcPeeringConnections({}, function(err, data) {
//inspect('peering', err, data);
            startingPcxs = _.pluck(data.VpcPeeringConnections, 'VpcPeeringConnectionId');
//inspect('starting pcxs', startingPcxs);

            return sg.__run([function(next) {
              const params = {
                PeerOwnerId   : args.owner2,
                PeerRegion    : 'us-east-1',
                PeerVpcId     : args.vpc2,
                VpcId         : args.vpc
              };

              return ec2.createVpcPeeringConnection(params, function(err, data) {
                if (!sg.ok(err, data))  { return abort(err, 'failed to ec2.createVpcPeeringConnection'); }

                return ec2.describeVpcPeeringConnections({}, function(err, data) {
                  if (!sg.ok(err, data))  { return abort(err, 'failed to find new peering connection'); }

                  newlyCreatedPcx = _.difference(_.pluck(data.VpcPeeringConnections, 'VpcPeeringConnectionId'), startingPcxs)[0];
                  args.pcx        = newlyCreatedPcx;
                  inspect('Newly found pcx: '+newlyCreatedPcx);

                  return awsService('EC2', 'prod').acceptVpcPeeringConnection({VpcPeeringConnectionId: newlyCreatedPcx}, function(err, data) {
                    if (!sg.ok(err, data))  { return abort(err, 'failed to ec2.acceptVpcPeeringConnection'); }

                    return next();
                  });
                });
              });

            }, function(next) {
              return lib.createPeeringTemplate(args, context, function(err, template) {
  inspect('peering template1', args, err, sg.inspect(template));
                if (!sg.ok(err, template))    { return abort(err, 'createStack.createPeeringTemplate'); }

                const tmpFilename = tempy.file({extension: 'json'});

                console.error('template for '+args.acct+' is at: '+tmpFilename, 'creating '+sg.numKeys(template.Resources)+' resources');
                return fs.writeFile(tmpFilename, JSON.stringify(template.template, null, 2), function(err) {
//inspect('write', err);
                  return cf.createStack({StackName: peeringStackName, TemplateBody : JSON.stringify(template.template), DisableRollback: true}, function(err, data) {
//inspect('crstack'. peeringStackName, template.template, err, data);
                    return lib.waitForCf({StackName: peeringStackName, acct: args.acct}, context, function(err, result) {
//inspect('waited', args.acct, err, result);
                      if (!sg.ok(err, result))  { return abort(err, 'fail creating first vpc peering.'); }

//                      return ec2.describeVpcPeeringConnections({}, function(err, data) {
//  inspect('desvpc', err, data);
//                        newlyCreatedPcx = _.difference(_.pluck(data.VpcPeeringConnections, 'VpcPeeringConnectionId'), startingPcxs);
//                        console.error('Newly found pcx: '+newlyCreatedPcx);
                        return next();
//                      });
                    });
                  });
                });
              });
              return next();
            }], function done() {
              return next();
            });
          });

        }, function(next) {
          return next();

        }, function(next) {

          const peeringStackName    = `${StackName}Peering`;

          const args = {
            acct      : 'prod',
            vpc       : prodVpc,
            owner2    : accounts.dev,
            vpc2      : devVpc,
            cidr2     : `10.${classBt}.0.0/16`,
            pcx       : newlyCreatedPcx,
            StackName : peeringStackName
          };

          const cf                  = awsService('CloudFormation', args.acct);

          return lib.createPeeringTemplate(args, context, function(err, template) {
            if (!sg.ok(err, template))    { return abort(err, 'createStack.createPeeringTemplate'); }
            inspect('----2nd peering: ', template, {depth:null, colors:true});

            return cf.createStack({StackName: peeringStackName, TemplateBody : JSON.stringify(template.template), DisableRollback: true}, function(err, data) {
              return lib.waitForCf({StackName: peeringStackName, acct: args.acct}, context, function(err, result) {
                if (!sg.ok(err, result))  { return abort(err, 'fail creating second vpc peering.'); }

                return next();
              });
            });
          });

        }], function done() {
          return next();
        });

      });

    }], function abort(err, msg) {
      if (msg)  { return sg.die(err, callback, msg); }
      return callback(err);
    });
  });
};

lib.waitForCf = function(argv, context, callback) {

  const StackName           = argvGet(argv, 'stack-name');
  const cf                  = awsService('CloudFormation', argv.acct);

  var   result = {};

  var inProgress, created, complete;
  return sg.until(function(again, last, count, elapsed) {
    if (count > 700) { return last(); }

    return sg.__run([function(next) {
//console.error('-------------------------------------------------------');
      return cf.listStackResources({StackName}, function(err, data) {
//inspect('desev', StackName, err, data);

        if (sg.ok(err, data)) {
          const resources = _.map(data.StackResourceSummaries, resource => _.pick(resource, 'LogicalResourceId', 'ResourceStatus', 'ResourceStatusReason'));
//inspect('resources', resources);

          // You can get the result of the _.pluck() to see what is still being built
          inProgress = sg.numKeys(      _.pluck(_.filter(resources, resource => resource.ResourceStatus === 'CREATE_IN_PROGRESS'), 'LogicalResourceId'));
          created    = sg.numKeys(      _.pluck(_.filter(resources, resource => resource.ResourceStatus === 'CREATE_COMPLETE'), 'LogicalResourceId'));

          const statuses = _.groupBy(resources, 'ResourceStatus');
//inspect('statuses', statuses);
        }

        return next();
      });

    }, function(next) {
      return cf.describeStacks({StackName}, function(err, data) {
//inspect('desev-stacks', StackName, err, data);

        if (sg.ok(err, data)) {
          complete = sg.reduce(data.Stacks, null, function(m, stack) {
            return (stack.StackStatus === 'CREATE_COMPLETE') ? true : (stack.StackStatus === 'CREATE_FAILED') ? false : m;
            //return m && ((stack.StackStatus === 'CREATE_COMPLETE') || (stack.StackStatus === 'CREATE_FAILED'))
          });
        }

        return next();
      });

    }], function() {
      console.error(`Complete ${argv.acct} (${created}/${inProgress+created})? ${complete}`);

      if (sg.isnt(complete)) { return again(2500); }

      /* otherwise */
      result.ok = complete;
      return last();
    });

  // Completion for the until() that waits for the stack to be created
  }, function done() {
    if (result.ok)  { return callback(null, result); }

    return callback(result);
  });
};

lib.createPeeringTemplate = function() {
  var   u               = sg.prepUsage();

  var ra = raLib.adapt(arguments, (argv, context, callback) => {

    const acctName              = argvGet(argv, u('acct',             '=83683',          'The account name.'));
    const stackName             = argvGet(argv, u('stack',            '=stackname',      'The stack name.'));
    const vpcId                 = argvGet(argv, u('vpc-id,vpc',       '=[vpc-12345678]', 'The VPC.'));
//    const cidrBlock             = argvGet(argv, u('cidr',             '=[10.3.0.0/0]',   'The cidr block.'))
    const otherOwnerId          = argvGet(argv, u('owner-id2,owner2', '=[2222222]',      'The other account.'));
    const otherVpcId            = argvGet(argv, u('vpc-id2,vpc2',     '=[vpc-87654321]', 'The other VPC.'));
    const otherCidrBlock        = argvGet(argv, u('cidr2',            '=[10.4.0.0/0]',   'The other cidr block.'));
    const pcx                   = argvGet(argv, u('pcx',              '=pcx-4321',       'The peering connection.'));

inspect('Building peering template', acctName, vpcId, otherVpcId, otherOwnerId, otherCidrBlock, pcx);
    var template = {};

    return sg.__run2({template}, callback, [function(result, next, last, abort) {

//      // If the pcx does not exist yet, create it
//      if (!pcx) {
//        setOnn(template,  `vpcPeering.Type`,                       "AWS::EC2::VPCPeeringConnection");
//        setOnn(template,  `vpcPeering.Properties.VpcId`,           vpcId);
//        setOnn(template,  `vpcPeering.Properties.PeerVpcId`,       otherVpcId);
//        setOnn(template,  `vpcPeering.Properties.PeerOwnerId`,     otherOwnerId);
//      }

      return next();

    }, function(result, next, last, abort) {
      return awsService('EC2', acctName).describeRouteTables({}, function(err, tables) {
//inspect('descrt', acctName, err /*, tables*/);
        if (!sg.ok(err, tables))      { return abort(err, `createPeeringTemplates.describeRouteTables-${acctName}`); }

        var i = 1;
        _.each(tables.RouteTables, table => {
//inspect('dddd', table, vpcId, otherCidrBlock, pcx);
          if (table.VpcId !== vpcId) { return; }   // Not ours

          setOnn(template, `PeerRoute${i}.Type`, "AWS::EC2::Route");

          setOnn(template, `PeerRoute${i}.Properties.RouteTableId`,           table.RouteTableId);
          setOnn(template, `PeerRoute${i}.Properties.DestinationCidrBlock`,   otherCidrBlock);
          setOnn(template, `PeerRoute${i}.Properties.VpcPeeringConnectionId`, pcx);

          i += 1;
        });

        return next();
      });

    }, function(result, next, last, abort) {
      const template   = sg.extract(result, 'template');

      result.template = {
        AWSTemplateFormatVersion: '2010-09-09',
        Description: `layer67 cf ${acctName} template for ${stackName}`,
        Mappings: {},
        Parameters: {},
        Resources: template,
        Outputs: {}
      };
      return next();

    }], function abort(err, message) {
      if (message) { return sg.die(err, callback, message); }
      return callback(err);
    });
  });
};

lib.createStackTemplates = function() {
  var   u               = sg.prepUsage();

  var ra = raLib.adapt(arguments, (argv, context, callback) => {
    //const baz           = ra.wrap(lib.baz);
    //const bar           = argvGet(argv, u('bar',  '=bar', 'The bar.'));

    const quick       = argvGet(argv, 'quick');
    const stackName   = argvGet(argv, u('stack', '=jelly-doughnuts', 'The name of the project stack.'));
    const region      = argvGet(argv, 'region') || 'us-east-1';
    const classB      = argvGet(argv, 'class-b,b');
    const classBt     = argvGet(argv, 'class-bt,bt,class-b-test');
    var   sshCidrs    = (argvGet(argv, 'ssh-cidrs,ssh') || '').split(',');
    var   numBitss    = argvGet(argv, 'bits'         ) || '22,20,20';
    const az          = letter => `${region}${letter}`;

    if (!stackName)           { return u.sage('stackName', 'Need a stack name.', callback); }

    if (quick) {
      console.error('--quick mode!!!! -- Stacks will not work.');
    }

    var dev           = {}, devOutputs  = {};
    var prod          = {}, prodOutputs = {};
    var routeTables   = [];
    var gateways      = {};
    var debug         = {};

    sshCidrs  = ['15.0.0.0/10', '15.64.0.0/11', '15.96.0.0/13', '66.27.48.0/24'];

    numBitss = numBitss.split(',');
    const getNumBits = function(type) {
      if (type === 'Public')  { return numBitss[0]; }
      if (type === 'App')     { return numBitss[1] || _.last(numBitss); }
      if (type === 'Lambda')  { return numBitss[2] || _.last(numBitss); }
    };

    const setOnnBoth = function(a, b) {
      setOnn(dev,  a, sg.deepCopy(b));
      setOnn(prod, a, sg.deepCopy(b));
    };

    const itemOnnBoth = function(name, awsType, props) {
      setOnnBoth(`${name}.Type`,        `AWS::EC2::${awsType}`);
      setOnnBoth(`${name}.Properties`,  props);
      return ref(name);
    };

    var   devSubnetIp     = `10.${classBt}.0.0`;
    var   prodSubnetIp    = `10.${classB}.0.0`;

    return sg.__run2({dev, prod, debug}, callback, [function(result, next, last, abort) {

      //================================================================================
      // The VPC and top-level stuff
      //================================================================================

      const vpcRef        = ref("VPC");
      const igwRef        = ref("InternetGateway");
      const vpcGateway    = 'VpcGateway';

      setOnnBoth("VPC.Type", "AWS::EC2::VPC");
      setOnnBoth("VPC.Properties", {EnableDnsSupport: true, EnableDnsHostnames: true});
          setOnn(dev,  `VPC.Properties.CidrBlock`, toCidr(devSubnetIp,  16));
          setOnn(prod, `VPC.Properties.CidrBlock`, toCidr(prodSubnetIp, 16));

      setOnnBoth("InternetGateway.Type", "AWS::EC2::InternetGateway");
      setOnnBoth("InternetGateway.Properties", {});

      const gwRef     = itemOnnBoth(vpcGateway,         "VPCGatewayAttachment", {VpcId: vpcRef, InternetGatewayId: igwRef});
      const prttblRef = itemOnnBoth("PublicRouteTable", "RouteTable",           {VpcId: vpcRef});
      const prtRef    = itemOnnBoth("PublicRoute",      "Route",                {RouteTableId: prttblRef, GatewayId: igwRef});
                         setOnnBoth("PublicRoute.Properties.DestinationCidrBlock",         '0.0.0.0/0');

      devOutputs = {
        VPC: {
          Value: vpcRef,
          Description: "The VPC Id"
        },
        VpcCidrBlock: {
          Value: getAtt(vpcRef, 'CidrBlock'),
          Description: "The VPC CIDR block"
        }
      };

      prodOutputs = {
        VPC: {
          Value: vpcRef,
          Description: "The VPC Id"
        },
        VpcCidrBlock: {
          Value: getAtt(vpcRef, 'CidrBlock'),
          Description: "The VPC CIDR block"
        }
      };


      routeTables.push(prttblRef);

      //================================================================================
      // Subnets
      //================================================================================

      const subnetOnnEach = function(letter, type, options_) {

        const options     = options_ || {};
        const LETTER      = `${letter.toUpperCase()}${letter}`;
        const numBits     = getNumBits(type);
        var   publicIp    = false;
        var   rttblRef;
        var   gatewayRef;

        if (type === 'Public') {
          publicIp  = true;
          rttblRef  = prttblRef;
        }

        // ---------- The Subnet ----------
        const subnetRef   = itemOnnBoth(`Subnet${LETTER}${type}`,  "Subnet",                              {VpcId: vpcRef});
                             setOnnBoth(`Subnet${LETTER}${type}.Properties.MapPublicIpOnLaunch`,          publicIp);
                             setOnnBoth(`Subnet${LETTER}${type}.Properties.AvailabilityZone`,             az(letter));

        if (type === 'Public') {

          // Fix the class-c
          setOnn(dev,  [`Subnet${LETTER}${type}`, 'Properties', 'CidrBlock'],           toCidr(devSubnetIp, numBits));
          setOnn(prod, [`Subnet${LETTER}${type}`, 'Properties', 'CidrBlock'],           toCidr(prodSubnetIp, numBits));

          devSubnetIp  = nextCidrStart(devSubnetIp,  numBits);
          prodSubnetIp = nextCidrStart(prodSubnetIp, numBits);
        }

        if (options.useNat) {
          const natEipRef   = itemOnnBoth(`Subnet${LETTER}PublicNatEip`,              'EIP',        {Domain: 'vpc'});
                               setOnnBoth(`Subnet${LETTER}PublicNatEip.DependsOn`,                  vpcGateway);
          gatewayRef        = itemOnnBoth(`Subnet${LETTER}PublicNatGateway`,          'NatGateway', {SubnetId: subnetRef, AllocationId: getAtt(natEipRef, 'AllocationId')});

          gateways[`Subnet${LETTER}PublicNatGateway`] = gatewayRef;

          setOnn(devOutputs,  `Subnet${LETTER}PublicNatIp.Value`,  natEipRef);
          setOnn(prodOutputs, `Subnet${LETTER}PublicNatIp.Value`,  natEipRef);
        }

        if (type !== 'Public') {
          rttblRef          = itemOnnBoth(`Subnet${LETTER}${type}RouteTable`,               "RouteTable",   {VpcId: vpcRef});
                              itemOnnBoth(`Subnet${LETTER}${type}PublicRoute`,              "Route",        {RouteTableId: rttblRef, DestinationCidrBlock: '0.0.0.0/0'});
                               setOnnBoth(`Subnet${LETTER}${type}PublicRoute.Properties.NatGatewayId`,      gateways[`Subnet${LETTER}PublicNatGateway`]);

                              setOnn(dev ,`Subnet${LETTER}${type}.Properties.CidrBlock`,                    toCidr(devSubnetIp, numBits));
                              setOnn(prod,`Subnet${LETTER}${type}.Properties.CidrBlock`,                    toCidr(prodSubnetIp, numBits));

          devSubnetIp  = nextCidrStart(devSubnetIp,  numBits);
          prodSubnetIp = nextCidrStart(prodSubnetIp, numBits);

          routeTables.push(rttblRef);
        }

        itemOnnBoth(`Subnet${LETTER}${type}RouteTableAssociation`, "SubnetRouteTableAssociation", {SubnetId: subnetRef, RouteTableId: rttblRef});

        return subnetRef;
      };

      _.each('a,b,d,e'.split(','), function(letter) {
        subnetOnnEach(letter, 'Public');
      });

      if (!quick) {
        _.each('a,b,d,e'.split(','), function(letter) {
          subnetOnnEach(letter, 'App', {useNat: true});
        });

        _.each('a,b,d,e'.split(','), function(letter) {
          subnetOnnEach(letter, 'Lambda');
        });
      }

      //================================================================================
      // Security Groups
      //================================================================================

      const addSgRule = function(which_, sgName, rule) {
        _.each(mkArray(which_), which => {
          sg.setOnna(which, `${sgName}.Properties.SecurityGroupIngress`, rule);
        });
      };

      // ---------- wide sg ----------
      itemOnnBoth('sgWide', 'SecurityGroup', {VpcId: vpcRef, GroupDescription: 'For wide use inside vpc'});

      addSgRule([dev, prod], 'sgWide', sgRule('tcp', 22, 22, '10.0.0.0/8'));
      addSgRule([dev, prod], 'sgWide', sgRule(-1,    -1, -1, '10.0.0.0/8'));

      if (!quick) {
        // ---------- util sg ----------
        itemOnnBoth('sgUtil', 'SecurityGroup', {VpcId: vpcRef, GroupDescription: 'For the utility servers'});

        addSgRule([dev, prod], 'sgUtil', sgRule('tcp', 22,    22,    '10.0.0.0/8'));
        addSgRule([dev, prod], 'sgUtil', sgRule('tcp', 27017, 27017, '10.0.0.0/8'));
        addSgRule([dev, prod], 'sgUtil', sgRule('tcp', 6379,  6379,  '10.0.0.0/8'));

        // ---------- web sg ----------
        itemOnnBoth('sgWeb', 'SecurityGroup', {VpcId: vpcRef, GroupDescription: 'For the webtier'});

        addSgRule([dev, prod], 'sgWeb', sgRule('tcp', 80,  80,  '0.0.0.0/0'));
        addSgRule([dev, prod], 'sgWeb', sgRule('tcp', 443, 443, '0.0.0.0/0'));

        _.each(sshCidrs, cidr => {
          addSgRule([dev, prod], 'sgWeb', sgRule('tcp', 22, 22, cidr));
        });

        // TODO: Add app-tier
      }

      //================================================================================
      // DynamoDB
      //================================================================================

      const addDynamo = function(which, name, read, write, keys) {

        const longKey = `${stackName}${name}`
        var   db      = {
          Type : "AWS::DynamoDB::Table",
          Properties : {
            TableName : `${name}`,
            AttributeDefinitions : [ ],
            KeySchema : [ ],
            ProvisionedThroughput : {
                ReadCapacityUnits   : read,
                WriteCapacityUnits  : write,
            },
            StreamSpecification : {
                StreamViewType  : 'NEW_AND_OLD_IMAGES'
            }
          }
        };

        _.each(keys, (kv, key) => {

          if (key === 'hash') {
            sg.setOnna(db, `Properties.AttributeDefinitions`, {AttributeName: 'id',   AttributeType: kv.id});
            sg.setOnna(db,            'Properties.KeySchema', {AttributeName: 'id',   KeyType: 'HASH'});
          }

          if (key == 'range') {
            sg.setOnna(db, 'Properties.AttributeDefinitions', {AttributeName: 'type', AttributeType: 'S'});
            sg.setOnna(db,            'Properties.KeySchema', {AttributeName: 'type', KeyType: 'RANGE'});
          }

        });

        setOnn(which, longKey, sg.deepCopy(db));
      }

      if (!quick) {
        addDynamo(dev, 'clusterDb', 2, 2, {hash:{id:'S'}, range:{type:'S'}});     // The string used as a label for AWS (ImageId, InstanceId, etc.)
        addDynamo(dev, 'adminsDb',  1, 1, {hash:{id:'S'}});                       // email
      }

      //================================================================================
      // VPC Endpoints
      //================================================================================

      if (!quick) {
        // ---------- VPC endpoint ----------
        return ec2.describeVpcEndpointServices({}, function(err, data) {

          if (sg.ok(err, data)) {
            const serviceDetails = _.indexBy(data.ServiceDetails, 'ServiceName');

            _.each('s3,dynamodb,kinesis-streams,elasticloadbalancing,ec2'.split(','), serviceName_ => {
              const endpoint      = `com.amazonaws.us-east-1.${serviceName_}`;
              const serviceName   = serviceName_.replace(/[^a-z0-9]+/i, '');

              if (serviceDetails[endpoint] && serviceDetails[endpoint].VpcEndpointPolicySupported) {

                itemOnnBoth(`${serviceName}Endpoint`, 'VPCEndpoint', {VpcId: vpcRef, ServiceName: endpoint});
                _.each(routeTables, table => {
                  sg.setOnna(dev,  `${serviceName}Endpoint.Properties.RouteTableIds`, sg.deepCopy(table));
                  sg.setOnna(prod, `${serviceName}Endpoint.Properties.RouteTableIds`, sg.deepCopy(table));
                });
              }
            });
          }
          return next();
        });
      }

      return next();

    }, function(result, next, last, abort) {
      const dev   = sg.extract(result, 'dev');
      const prod  = sg.extract(result, 'prod');

      result.dev = {
        AWSTemplateFormatVersion: '2010-09-09',
        Description: `layer67 cf dev template for ${stackName}`,
        Mappings: {},
        Parameters: {},
        Resources: dev,
        Outputs: devOutputs
      };

      result.prod = {
        AWSTemplateFormatVersion: '2010-09-09',
        Description: `layer67 cf prod template for ${stackName}`,
        Mappings: {},
        Parameters: {},
        Resources: prod,
        Outputs: prodOutputs
      };

      result.devKeys = sg.numKeys(dev);
      result.prodKeys = sg.numKeys(prod);

      result.devlen = JSON.stringify(dev).length;
      result.prodlen = JSON.stringify(prod).length;

      //result.devkeys = _.keys(dev);
      //result.prodkeys = _.keys(prod);

      result.chk = result.devlen - result.prodlen;

      return callback(null, result);

    }], function abort(err, msg) {
      if (msg)  { return sg.die(err, callback, msg); }
      return callback(err);
    });
  });
};

_.each(lib, (value, key) => {
  exports[key] = value;
});

function ref(x) {
  return {Ref:x};
}

function getAtt(ref, key) {
  return {'Fn::GetAtt':[ref.Ref, key]};
}

function sgRule(protocol, from, to, cidr) {
  return {IpProtocol: protocol, FromPort: from, ToPort: to, CidrIp: cidr};
}

function mkArray(x) {
  if (_.isArray(x)) { return x; }
  return [x];
}


function nextCidrStart(ip, newNumBits) {
  const cidrBlock = `${ip}/${newNumBits}`;

  var lastForOld  = sg.ipNumber(sg.lastIpInCidrBlock(cidrBlock));
  var lastForNew  = sg.ipNumber(sg.lastIpInCidrBlock(cidrBlock.replace(/\/[0-9]+$/g, '/'+newNumBits)));
  var firstOfNext = Math.max(lastForOld, lastForNew) + 1;

  return sg.dottedIp(firstOfNext);
};

function toCidr(ip, bits) {
  var cidrTry1 = `${ip}/${bits}`;
  return `${sg.firstIpInCidrBlock(cidrTry1)}/${bits}`;
}

function inspect(...argv) {
  _.each(argv, arg => {
    console.error(util.inspect(arg, {depth: null, colors:true}));
  });
}


