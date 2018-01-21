
/**
 *
 *
 * var hpNetCidrs          = ['15.0.0.0/10', '15.64.0.0/11', '15.96.0.0/13', '66.27.48.0/24'];
 *
 */
const sg                      = require('sgsg');
const _                       = sg._;
const raLib                   = sg.include('run-anywhere') || require('run-anywhere');
const AWS                     = require('aws-sdk');

const argvGet                 = sg.argvGet;
const argvExtract             = sg.argvExtract;
const setOnn                  = sg.setOnn;
const deref                   = sg.deref;

const hpNetCidrs              = ['15.0.0.0/10', '15.64.0.0/11', '15.96.0.0/13', '66.27.48.0/24'];

const ec2                     = new AWS.EC2({region: 'us-east-1'});

var lib = {};

lib.createStacks = function() {
  var   u               = sg.prepUsage();

  var ra = raLib.adapt(arguments, (argv, context, callback) => {
    //const baz           = ra.wrap(lib.baz);
    //const bar           = argvGet(argv, u('bar',  '=bar', 'The bar.'));

    const stackName   = argvGet(argv, u('stack', '=jelly-doughnuts', 'The name of the project stack.'));
    const region      = argvGet(argv, 'region') || 'us-east-1';
    const classB      = argvGet(argv, 'class-b,b');
    const classBt     = argvGet(argv, 'class-bt,bt,class-b-test');
    var   sshCidrs    = (argvGet(argv, 'ssh-cidrs,ssh') || '').split(',');
    var   numBitss    = argvGet(argv, 'bits'         ) || '22,20,20';
    const az          = letter => `${region}${letter}`;

    if (!stackName)           { return u.sage('stackName', 'Need a stack name.', callback); }

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

      const vpcRef        = ref("VPC");
      const igwRef        = ref("InternetGateway");
      const vpcGateway    = 'VpcGateway';

      setOnnBoth("VPC.Type", "AWS::EC2::VPC");
      setOnnBoth("VPC.Properties", {EnableDnsSupport: true, EnableDnsHostnames: true});
      setOnnBoth(`VPC.Properties.CidrBlock`, toCidr(devSubnetIp, 16));

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


      routeTables.push(prttblRef);

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

          setOnn(devOutputs, `Subnet${LETTER}PublicNatIp.Value`,  natEipRef);
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

      _.each('a,b,d,e'.split(','), function(letter) {
        subnetOnnEach(letter, 'App', {useNat: true});
      });

      _.each('a,b,d,e'.split(','), function(letter) {
        subnetOnnEach(letter, 'Lambda');
      });

      // TODO: VPC Peering
			//     "vpc21And11PeeringConnection": {
      //       "Type": "AWS::EC2::VPCPeeringConnection",
      //       "Properties": {
      //         "VpcId": {
      //           "Ref": "VPC"
      //         },
      //         "PeerVpcId": "vpc-01f88567"
      //       }
      //     },

      const addSgRule = function(which_, sgName, rule) {
        _.each(mkArray(which_), which => {
          sg.setOnna(which, `${sgName}.Properties.SecurityGroupIngress`, rule);
        });
      };

      // ---------- wide sg ----------
      itemOnnBoth('sgWide', 'SecurityGroup', {VpcId: vpcRef, GroupDescription: 'For wide use inside vpc'});

      addSgRule([dev, prod], 'sgWide', sgRule('tcp', 22, 22, '10.0.0.0/8'));
      addSgRule([dev, prod], 'sgWide', sgRule(-1,    -1, -1, '10.0.0.0/8'));

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

lib.baz = function(argv, context, callback) {
  return callback();
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


