/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { FxAccounts } = ChromeUtils.import(
  "resource://gre/modules/FxAccounts.jsm"
);
const { FxAccountsClient } = ChromeUtils.import(
  "resource://gre/modules/FxAccountsClient.jsm"
);
const {
  ERRNO_DEVICE_SESSION_CONFLICT,
  ERRNO_TOO_MANY_CLIENT_REQUESTS,
  ERRNO_UNKNOWN_DEVICE,
} = ChromeUtils.import("resource://gre/modules/FxAccountsCommon.js");
var { AccountState } = ChromeUtils.import(
  "resource://gre/modules/FxAccounts.jsm",
  null
);

initTestLogging("Trace");

var log = Log.repository.getLogger("Services.FxAccounts.test");
log.level = Log.Level.Debug;

const BOGUS_PUBLICKEY =
  "BBXOKjUb84pzws1wionFpfCBjDuCh4-s_1b52WA46K5wYL2gCWEOmFKWn_NkS5nmJwTBuO8qxxdjAIDtNeklvQc";
const BOGUS_AUTHKEY = "GSsIiaD2Mr83iPqwFNK4rw";

Services.prefs.setCharPref("identity.fxaccounts.loglevel", "Trace");
Log.repository.getLogger("FirefoxAccounts").level = Log.Level.Trace;

const DEVICE_REGISTRATION_VERSION = 42;

function MockStorageManager() {}

MockStorageManager.prototype = {
  initialize(accountData) {
    this.accountData = accountData;
  },

  finalize() {
    return Promise.resolve();
  },

  getAccountData() {
    return Promise.resolve(this.accountData);
  },

  updateAccountData(updatedFields) {
    for (let [name, value] of Object.entries(updatedFields)) {
      if (value == null) {
        delete this.accountData[name];
      } else {
        this.accountData[name] = value;
      }
    }
    return Promise.resolve();
  },

  deleteAccountData() {
    this.accountData = null;
    return Promise.resolve();
  },
};

function MockFxAccountsClient(device) {
  this._email = "nobody@example.com";
  this._verified = false;
  this._deletedOnServer = false; // for testing accountStatus

  // mock calls up to the auth server to determine whether the
  // user account has been verified
  this.recoveryEmailStatus = function(sessionToken) {
    // simulate a call to /recovery_email/status
    return Promise.resolve({
      email: this._email,
      verified: this._verified,
    });
  };

  this.accountStatus = function(uid) {
    return Promise.resolve(!!uid && !this._deletedOnServer);
  };

  const {
    id: deviceId,
    name: deviceName,
    type: deviceType,
    sessionToken,
  } = device;

  this.registerDevice = (st, name, type) =>
    Promise.resolve({ id: deviceId, name });
  this.updateDevice = (st, id, name) => Promise.resolve({ id, name });
  this.signOut = () => Promise.resolve({});
  this.getDeviceList = st =>
    Promise.resolve([
      {
        id: deviceId,
        name: deviceName,
        type: deviceType,
        isCurrentDevice: st === sessionToken,
      },
    ]);

  FxAccountsClient.apply(this);
}
MockFxAccountsClient.prototype = {
  __proto__: FxAccountsClient.prototype,
};

async function MockFxAccounts(credentials, device = {}) {
  let fxa = new FxAccounts({
    newAccountState(creds) {
      // we use a real accountState but mocked storage.
      let storage = new MockStorageManager();
      storage.initialize(creds);
      return new AccountState(storage);
    },
    async availableCommands() {
      return {};
    },
    fxAccountsClient: new MockFxAccountsClient(device),
    fxaPushService: {
      registerPushEndpoint() {
        return new Promise(resolve => {
          resolve({
            endpoint: "http://mochi.test:8888",
            getKey(type) {
              return ChromeUtils.base64URLDecode(
                type === "auth" ? BOGUS_AUTHKEY : BOGUS_PUBLICKEY,
                { padding: "ignore" }
              );
            },
          });
        });
      },
      unsubscribe() {
        return Promise.resolve();
      },
    },
    DEVICE_REGISTRATION_VERSION,
  });
  await fxa._internal.setSignedInUser(credentials);
  Services.prefs.setStringPref(
    "identity.fxaccounts.account.device.name",
    device.name || "mock device name"
  );
  return fxa;
}

function updateUserAccountData(fxa, data) {
  return fxa._internal.updateUserAccountData(data);
}

add_task(async function test_updateDeviceRegistration_with_new_device() {
  const deviceName = "foo";
  const deviceType = "bar";

  const credentials = getTestUser("baz");
  const fxa = await MockFxAccounts(credentials, { name: deviceName });
  // Remove the current device registration (setSignedInUser does one!).
  await updateUserAccountData(fxa, { uid: credentials.uid, device: null });

  const spy = {
    registerDevice: { count: 0, args: [] },
    updateDevice: { count: 0, args: [] },
    getDeviceList: { count: 0, args: [] },
  };
  const client = fxa._internal.fxAccountsClient;
  client.registerDevice = function() {
    spy.registerDevice.count += 1;
    spy.registerDevice.args.push(arguments);
    return Promise.resolve({
      id: "newly-generated device id",
      createdAt: Date.now(),
      name: deviceName,
      type: deviceType,
    });
  };
  client.updateDevice = function() {
    spy.updateDevice.count += 1;
    spy.updateDevice.args.push(arguments);
    return Promise.resolve({});
  };
  client.getDeviceList = function() {
    spy.getDeviceList.count += 1;
    spy.getDeviceList.args.push(arguments);
    return Promise.resolve([]);
  };

  await fxa.updateDeviceRegistration();

  Assert.equal(spy.updateDevice.count, 0);
  Assert.equal(spy.getDeviceList.count, 0);
  Assert.equal(spy.registerDevice.count, 1);
  Assert.equal(spy.registerDevice.args[0].length, 4);
  Assert.equal(spy.registerDevice.args[0][0], credentials.sessionToken);
  Assert.equal(spy.registerDevice.args[0][1], deviceName);
  Assert.equal(spy.registerDevice.args[0][2], "desktop");
  Assert.equal(
    spy.registerDevice.args[0][3].pushCallback,
    "http://mochi.test:8888"
  );
  Assert.equal(spy.registerDevice.args[0][3].pushPublicKey, BOGUS_PUBLICKEY);
  Assert.equal(spy.registerDevice.args[0][3].pushAuthKey, BOGUS_AUTHKEY);

  const state = fxa._internal.currentAccountState;
  const data = await state.getUserAccountData();

  Assert.equal(data.device.id, "newly-generated device id");
  Assert.equal(data.device.registrationVersion, DEVICE_REGISTRATION_VERSION);
});

add_task(async function test_updateDeviceRegistration_with_existing_device() {
  const deviceId = "my device id";
  const deviceName = "phil's device";

  const credentials = getTestUser("pb");
  const fxa = await MockFxAccounts(credentials, { name: deviceName });
  await updateUserAccountData(fxa, {
    uid: credentials.uid,
    device: {
      id: deviceId,
      registeredCommandsKeys: [],
      registrationVersion: 1, // < 42
    },
  });

  const spy = {
    registerDevice: { count: 0, args: [] },
    updateDevice: { count: 0, args: [] },
    getDeviceList: { count: 0, args: [] },
  };
  const client = fxa._internal.fxAccountsClient;
  client.registerDevice = function() {
    spy.registerDevice.count += 1;
    spy.registerDevice.args.push(arguments);
    return Promise.resolve({});
  };
  client.updateDevice = function() {
    spy.updateDevice.count += 1;
    spy.updateDevice.args.push(arguments);
    return Promise.resolve({
      id: deviceId,
      name: deviceName,
    });
  };
  client.getDeviceList = function() {
    spy.getDeviceList.count += 1;
    spy.getDeviceList.args.push(arguments);
    return Promise.resolve([]);
  };
  await fxa.updateDeviceRegistration();

  Assert.equal(spy.registerDevice.count, 0);
  Assert.equal(spy.getDeviceList.count, 0);
  Assert.equal(spy.updateDevice.count, 1);
  Assert.equal(spy.updateDevice.args[0].length, 4);
  Assert.equal(spy.updateDevice.args[0][0], credentials.sessionToken);
  Assert.equal(spy.updateDevice.args[0][1], deviceId);
  Assert.equal(spy.updateDevice.args[0][2], deviceName);
  Assert.equal(
    spy.updateDevice.args[0][3].pushCallback,
    "http://mochi.test:8888"
  );
  Assert.equal(spy.updateDevice.args[0][3].pushPublicKey, BOGUS_PUBLICKEY);
  Assert.equal(spy.updateDevice.args[0][3].pushAuthKey, BOGUS_AUTHKEY);

  const state = fxa._internal.currentAccountState;
  const data = await state.getUserAccountData();

  Assert.equal(data.device.id, deviceId);
  Assert.equal(data.device.registrationVersion, DEVICE_REGISTRATION_VERSION);
});

add_task(
  async function test_updateDeviceRegistration_with_unknown_device_error() {
    const deviceName = "foo";
    const deviceType = "bar";
    const currentDeviceId = "my device id";

    const credentials = getTestUser("baz");
    const fxa = await MockFxAccounts(credentials, { name: deviceName });
    await updateUserAccountData(fxa, {
      uid: credentials.uid,
      device: {
        id: currentDeviceId,
        registeredCommandsKeys: [],
        registrationVersion: 1, // < 42
      },
    });

    const spy = {
      registerDevice: { count: 0, args: [] },
      updateDevice: { count: 0, args: [] },
      getDeviceList: { count: 0, args: [] },
    };
    const client = fxa._internal.fxAccountsClient;
    client.registerDevice = function() {
      spy.registerDevice.count += 1;
      spy.registerDevice.args.push(arguments);
      return Promise.resolve({
        id: "a different newly-generated device id",
        createdAt: Date.now(),
        name: deviceName,
        type: deviceType,
      });
    };
    client.updateDevice = function() {
      spy.updateDevice.count += 1;
      spy.updateDevice.args.push(arguments);
      return Promise.reject({
        code: 400,
        errno: ERRNO_UNKNOWN_DEVICE,
      });
    };
    client.getDeviceList = function() {
      spy.getDeviceList.count += 1;
      spy.getDeviceList.args.push(arguments);
      return Promise.resolve([]);
    };

    await fxa.updateDeviceRegistration();

    Assert.equal(spy.getDeviceList.count, 0);
    Assert.equal(spy.registerDevice.count, 0);
    Assert.equal(spy.updateDevice.count, 1);
    Assert.equal(spy.updateDevice.args[0].length, 4);
    Assert.equal(spy.updateDevice.args[0][0], credentials.sessionToken);
    Assert.equal(spy.updateDevice.args[0][1], currentDeviceId);
    Assert.equal(spy.updateDevice.args[0][2], deviceName);
    Assert.equal(
      spy.updateDevice.args[0][3].pushCallback,
      "http://mochi.test:8888"
    );
    Assert.equal(spy.updateDevice.args[0][3].pushPublicKey, BOGUS_PUBLICKEY);
    Assert.equal(spy.updateDevice.args[0][3].pushAuthKey, BOGUS_AUTHKEY);

    const state = fxa._internal.currentAccountState;
    const data = await state.getUserAccountData();

    Assert.equal(null, data.device);
  }
);

add_task(
  async function test_updateDeviceRegistration_with_device_session_conflict_error() {
    const deviceName = "foo";
    const deviceType = "bar";
    const currentDeviceId = "my device id";
    const conflictingDeviceId = "conflicting device id";

    const credentials = getTestUser("baz");
    const fxa = await MockFxAccounts(credentials, { name: deviceName });
    await updateUserAccountData(fxa, {
      uid: credentials.uid,
      device: {
        id: currentDeviceId,
        registeredCommandsKeys: [],
        registrationVersion: 1, // < 42
      },
    });

    const spy = {
      registerDevice: { count: 0, args: [] },
      updateDevice: { count: 0, args: [], times: [] },
      getDeviceList: { count: 0, args: [] },
    };
    const client = fxa._internal.fxAccountsClient;
    client.registerDevice = function() {
      spy.registerDevice.count += 1;
      spy.registerDevice.args.push(arguments);
      return Promise.resolve({});
    };
    client.updateDevice = function() {
      spy.updateDevice.count += 1;
      spy.updateDevice.args.push(arguments);
      spy.updateDevice.time = Date.now();
      if (spy.updateDevice.count === 1) {
        return Promise.reject({
          code: 400,
          errno: ERRNO_DEVICE_SESSION_CONFLICT,
        });
      }
      return Promise.resolve({
        id: conflictingDeviceId,
        name: deviceName,
      });
    };
    client.getDeviceList = function() {
      spy.getDeviceList.count += 1;
      spy.getDeviceList.args.push(arguments);
      spy.getDeviceList.time = Date.now();
      return Promise.resolve([
        {
          id: "ignore",
          name: "ignore",
          type: "ignore",
          isCurrentDevice: false,
        },
        {
          id: conflictingDeviceId,
          name: deviceName,
          type: deviceType,
          isCurrentDevice: true,
        },
      ]);
    };

    await fxa.updateDeviceRegistration();

    Assert.equal(spy.registerDevice.count, 0);
    Assert.equal(spy.updateDevice.count, 1);
    Assert.equal(spy.updateDevice.args[0].length, 4);
    Assert.equal(spy.updateDevice.args[0][0], credentials.sessionToken);
    Assert.equal(spy.updateDevice.args[0][1], currentDeviceId);
    Assert.equal(spy.updateDevice.args[0][2], deviceName);
    Assert.equal(
      spy.updateDevice.args[0][3].pushCallback,
      "http://mochi.test:8888"
    );
    Assert.equal(spy.updateDevice.args[0][3].pushPublicKey, BOGUS_PUBLICKEY);
    Assert.equal(spy.updateDevice.args[0][3].pushAuthKey, BOGUS_AUTHKEY);
    Assert.equal(spy.getDeviceList.count, 1);
    Assert.equal(spy.getDeviceList.args[0].length, 1);
    Assert.equal(spy.getDeviceList.args[0][0], credentials.sessionToken);
    Assert.ok(spy.getDeviceList.time >= spy.updateDevice.time);

    const state = fxa._internal.currentAccountState;
    const data = await state.getUserAccountData();

    Assert.equal(data.device.id, conflictingDeviceId);
    Assert.equal(data.device.registrationVersion, null);
  }
);

add_task(
  async function test_updateDeviceRegistration_with_unrecoverable_error() {
    const deviceName = "foo";

    const credentials = getTestUser("baz");
    const fxa = await MockFxAccounts(credentials, { name: deviceName });
    await updateUserAccountData(fxa, { uid: credentials.uid, device: null });

    const spy = {
      registerDevice: { count: 0, args: [] },
      updateDevice: { count: 0, args: [] },
      getDeviceList: { count: 0, args: [] },
    };
    const client = fxa._internal.fxAccountsClient;
    client.registerDevice = function() {
      spy.registerDevice.count += 1;
      spy.registerDevice.args.push(arguments);
      return Promise.reject({
        code: 400,
        errno: ERRNO_TOO_MANY_CLIENT_REQUESTS,
      });
    };
    client.updateDevice = function() {
      spy.updateDevice.count += 1;
      spy.updateDevice.args.push(arguments);
      return Promise.resolve({});
    };
    client.getDeviceList = function() {
      spy.getDeviceList.count += 1;
      spy.getDeviceList.args.push(arguments);
      return Promise.resolve([]);
    };

    await fxa.updateDeviceRegistration();

    Assert.equal(spy.getDeviceList.count, 0);
    Assert.equal(spy.updateDevice.count, 0);
    Assert.equal(spy.registerDevice.count, 1);
    Assert.equal(spy.registerDevice.args[0].length, 4);

    const state = fxa._internal.currentAccountState;
    const data = await state.getUserAccountData();

    Assert.equal(null, data.device);
  }
);

add_task(
  async function test_getDeviceId_with_no_device_id_invokes_device_registration() {
    const credentials = getTestUser("foo");
    credentials.verified = true;
    const fxa = await MockFxAccounts(credentials);
    await updateUserAccountData(fxa, { uid: credentials.uid, device: null });

    const spy = { count: 0, args: [] };
    fxa._internal.currentAccountState.getUserAccountData = () =>
      Promise.resolve({
        email: credentials.email,
        registrationVersion: DEVICE_REGISTRATION_VERSION,
      });
    fxa._internal._registerOrUpdateDevice = function() {
      spy.count += 1;
      spy.args.push(arguments);
      return Promise.resolve("bar");
    };

    const result = await fxa.device.getLocalId();

    Assert.equal(spy.count, 1);
    Assert.equal(spy.args[0].length, 1);
    Assert.equal(spy.args[0][0].email, credentials.email);
    Assert.equal(null, spy.args[0][0].device);
    Assert.equal(result, "bar");
  }
);

add_task(
  async function test_getDeviceId_with_registration_version_outdated_invokes_device_registration() {
    const credentials = getTestUser("foo");
    credentials.verified = true;
    const fxa = await MockFxAccounts(credentials);

    const spy = { count: 0, args: [] };
    fxa._internal.currentAccountState.getUserAccountData = () =>
      Promise.resolve({
        device: {
          id: "my id",
          registrationVersion: 0,
          registeredCommandsKeys: [],
        },
      });
    fxa._internal._registerOrUpdateDevice = function() {
      spy.count += 1;
      spy.args.push(arguments);
      return Promise.resolve("wibble");
    };

    const result = await fxa.device.getLocalId();

    Assert.equal(spy.count, 1);
    Assert.equal(spy.args[0].length, 1);
    Assert.equal(spy.args[0][0].device.id, "my id");
    Assert.equal(result, "wibble");
  }
);

add_task(
  async function test_getDeviceId_with_device_id_and_uptodate_registration_version_doesnt_invoke_device_registration() {
    const credentials = getTestUser("foo");
    credentials.verified = true;
    const fxa = await MockFxAccounts(credentials);

    const spy = { count: 0 };
    fxa._internal.currentAccountState.getUserAccountData = async () => ({
      device: {
        id: "foo's device id",
        registrationVersion: DEVICE_REGISTRATION_VERSION,
        registeredCommandsKeys: [],
      },
    });
    fxa._internal._registerOrUpdateDevice = function() {
      spy.count += 1;
      return Promise.resolve("bar");
    };

    const result = await fxa.device.getLocalId();

    Assert.equal(spy.count, 0);
    Assert.equal(result, "foo's device id");
  }
);

add_task(
  async function test_getDeviceId_with_device_id_and_with_no_registration_version_invokes_device_registration() {
    const credentials = getTestUser("foo");
    credentials.verified = true;
    const fxa = await MockFxAccounts(credentials);

    const spy = { count: 0, args: [] };
    fxa._internal.currentAccountState.getUserAccountData = () =>
      Promise.resolve({ device: { id: "wibble" } });
    fxa._internal._registerOrUpdateDevice = function() {
      spy.count += 1;
      spy.args.push(arguments);
      return Promise.resolve("wibble");
    };

    const result = await fxa.device.getLocalId();

    Assert.equal(spy.count, 1);
    Assert.equal(spy.args[0].length, 1);
    Assert.equal(spy.args[0][0].device.id, "wibble");
    Assert.equal(result, "wibble");
  }
);

add_task(async function test_devicelist_pushendpointexpired() {
  const deviceId = "mydeviceid";
  const credentials = getTestUser("baz");
  credentials.verified = true;
  const fxa = await MockFxAccounts(credentials);
  await updateUserAccountData(fxa, {
    uid: credentials.uid,
    device: {
      id: deviceId,
      registeredCommandsKeys: [],
      registrationVersion: 1, // < 42
    },
  });

  const spy = {
    updateDevice: { count: 0, args: [] },
    getDeviceList: { count: 0, args: [] },
  };
  const client = fxa._internal.fxAccountsClient;
  client.updateDevice = function() {
    spy.updateDevice.count += 1;
    spy.updateDevice.args.push(arguments);
    return Promise.resolve({});
  };
  client.getDeviceList = function() {
    spy.getDeviceList.count += 1;
    spy.getDeviceList.args.push(arguments);
    return Promise.resolve([
      {
        id: "mydeviceid",
        name: "foo",
        type: "desktop",
        isCurrentDevice: true,
        pushEndpointExpired: true,
      },
    ]);
  };

  await fxa.getDeviceList();

  Assert.equal(spy.getDeviceList.count, 1);
  Assert.equal(spy.updateDevice.count, 1);
});

function expandHex(two_hex) {
  // Return a 64-character hex string, encoding 32 identical bytes.
  let eight_hex = two_hex + two_hex + two_hex + two_hex;
  let thirtytwo_hex = eight_hex + eight_hex + eight_hex + eight_hex;
  return thirtytwo_hex + thirtytwo_hex;
}

function expandBytes(two_hex) {
  return CommonUtils.hexToBytes(expandHex(two_hex));
}

function getTestUser(name) {
  return {
    email: name + "@example.com",
    uid: "1ad7f502-4cc7-4ec1-a209-071fd2fae348",
    sessionToken: name + "'s session token",
    keyFetchToken: name + "'s keyfetch token",
    unwrapBKey: expandHex("44"),
    verified: false,
  };
}
