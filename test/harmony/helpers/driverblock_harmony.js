/*jshint  esnext: true*/

"use strict";

var wd = require('yiewd')
  , _ = require("underscore")
  , monocle = require('monocle-js')
  , run = monocle.run
  , o_O = monocle.o_O
  , path = require("path")
  , defaultHost = '127.0.0.1'
  , defaultPort = process.env.APPIUM_PORT || 4723
  , defaultCaps = {
    browserName: ''
  , device: 'iPhone Simulator'
  , platform: 'Mac'
  , version: '6.0'
    //, newCommandTimeout: 60
  };

var driverBlock = function (tests, host, port, caps, extraCaps) {
  host = (typeof host === "undefined" || host === null) ? _.clone(defaultHost) : host;
  port = (typeof port === "undefined" || port === null) ? _.clone(defaultPort) : port;
  caps = (typeof caps === "undefined" || caps === null) ? _.clone(defaultCaps) : caps;
  caps = _.extend(caps, typeof extraCaps === "undefined" ? {} : extraCaps);
  var driverHolder = {driver: null, sessionId: null};
  var expectConnError = extraCaps && extraCaps.expectConnError;

  beforeEach(function (done) {
    driverHolder.driver = wd.remote(host, port);
    _.each(['Name', 'TagName', 'XPath', 'Css', 'Id'], function (strat) {
      driverHolder.driver['by' + strat] = driverHolder.driver['elementBy' + strat];
      driverHolder.driver['by' + strat + 's'] = driverHolder.driver['elementsBy' + strat];
    });
    run(function* () {
      try {
        driverHolder.sessionId = yield driverHolder.driver.init(caps);
      } catch (err) {
        if (expectConnError) {
          driverHolder.connError = err;
          return done();
        }
      }
      yield driverHolder.driver.setImplicitWaitTimeout(5000);
      done();
    });
  });

  afterEach(function (done) {
    run(function* () {
      try {
        yield driverHolder.driver.quit();
      } catch (err) {
        if (err && err.status && err.status.code !== 6) {
          throw err;
        }
      }
      done();
    });
  });

  tests(driverHolder);
};

var describeWithDriver = function (desc, tests, host, port, caps, extraCaps, timeout, onlyify) {
  var descFn;
  if (onlyify) {
    descFn = describe.only;
  } else {
    descFn = describe;
  }
  descFn(desc, function () {
    if (typeof timeout !== "undefined") {
      this.timeout(timeout);
    }
    driverBlock(tests, host, port, caps, extraCaps, onlyify);
  });
};

var describeForSafari = function () {
  var fn = function (desc, tests, host, port, extraCaps, onlyify) {
    var caps = {
      browserName: 'Safari'
    , app: 'safari'
    , device: 'iPhone Simulator'
    , platform: 'Mac'
    , version: '6.1'
    };
    return describeWithDriver(desc, tests, host, port, caps, extraCaps, undefined, onlyify);
  };
  fn.only = function () {
    var a = arguments;
    return fn(a[0], a[1], a[2], a[3], a[4], true);
  };
  return fn;
};
describeForSafari.only = function () {
  return describeForSafari(true);
};

var describeForChrome = function () {
  var fn = function (desc, tests, host, port, extraCaps, onlyify) {
    var caps = {
      app: 'chrome'
    , device: 'Android'
    };
    return describeWithDriver(desc, tests, host, port, caps, extraCaps, undefined, onlyify);
  };
  fn.only = function () {
    var a = arguments;
    return fn(a[0], a[1], a[2], a[3], a[4], true);
  };
  return fn;
};
describeForChrome.only = function () {
  return describeForChrome(true);
};

var describeForApp = function (app, device, appPackage, appActivity, appWaitActivity) {
  if (typeof device === "undefined") {
    device = "ios";
  }
  var browserName, appPath, realDevice;
  if (device === "ios") {
    realDevice = "iPhone Simulator";
    browserName = "iOS";
  } else if (device === "android") {
    browserName = realDevice = "Android";
  } else if (device === "selendroid") {
    browserName = realDevice = "Selendroid";
  } else if (device === "firefox" || device === "firefoxos") {
    browserName = realDevice = "Firefox";
  }
  if (/\//.exec(app) || /\./.exec(app)) {
    appPath = app;
  } else {
    if (device === "ios") {
      appPath = path.resolve(__dirname, "../../../sample-code/apps/" + app + "/build/Release-iphonesimulator/" + app + ".app");
    } else if (device === "android" || device === "selendroid") {
      appPath = path.resolve(__dirname, "../../../sample-code/apps/" + app + "/bin/" + app + "-debug.apk");
    } else {
      appPath = app;
    }
  }

  return function (desc, tests, host, port, caps, extraCaps) {
    if (typeof extraCaps === "undefined") {
      extraCaps = {};
    }
    var newExtraCaps = {
      app: appPath,
      browserName: browserName,
      device: realDevice
    };
    if (typeof appPackage !== "undefined") {
      newExtraCaps['app-package'] = appPackage;
      newExtraCaps['app-activity'] = appActivity;
      if (typeof appWaitActivity !== "undefined") {
        newExtraCaps['app-wait-activity'] = appWaitActivity;
      }
    }
    extraCaps = _.extend(extraCaps, newExtraCaps);
    return describeWithDriver(desc, tests, host, port, caps, extraCaps);
  };
};

var describeForSauce = function (appUrl, device) {
  return function (desc, tests, extraCaps, host, port) {
    device = device || 'iPhone Simulator';
    host = host || 'ondemand.saucelabs.com';
    port = port || 80;
    if (typeof process.env.SAUCE_USERNAME === "undefined" || typeof process.env.SAUCE_ACCESS_KEY === "undefined") {
      throw new Error("Need to set SAUCE_USERNAME and SAUCE_ACCESS_KEY");
    }
    host = process.env.SAUCE_USERNAME + ':' + process.env.SAUCE_ACCESS_KEY +
          '@' + host;
    var caps = {
      device: device
    , browserName: ""
    , app: appUrl
    , version: ""
    };
    if (device.toLowerCase().indexOf('android') !== -1) {
      caps.platform = "LINUX";
      caps.version = "4.2";
    } else {
      caps.platform = "Mac 10.8";
    }

    return describeWithDriver(desc, tests, host, port, caps, extraCaps, 500000);
  };
};

var driverIt = function (desc, gen) {
  gen = o_O(gen);
  it(desc, function (done) {
    run(function* () {
      try {
        yield gen();
        done();
      } catch (e) {
        done(e);
      }
    });
  });
};

module.exports.block = driverBlock;
module.exports.describe = describeWithDriver;
module.exports.describeForApp = describeForApp;
module.exports.describeForSauce = describeForSauce;
module.exports.describeForSafari = describeForSafari;
module.exports.describeForChrome = describeForChrome;
module.exports.it = driverIt;

