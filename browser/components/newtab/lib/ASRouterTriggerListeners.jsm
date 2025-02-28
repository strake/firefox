/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  PrivateBrowsingUtils: "resource://gre/modules/PrivateBrowsingUtils.jsm",
  EveryWindow: "resource:///modules/EveryWindow.jsm",
});

const FEW_MINUTES = 15 * 60 * 1000; // 15 mins
const MATCH_PATTERN_OPTIONS = { ignorePath: true };

function isPrivateWindow(win) {
  return (
    !(win instanceof Ci.nsIDOMWindow) ||
    win.closed ||
    PrivateBrowsingUtils.isWindowPrivate(win)
  );
}

/**
 * Check current location against the list of whitelisted hosts
 * Additionally verify for redirects and check original request URL against
 * the whitelist.
 *
 * @returns {object} - {host, url} pair that matched the whitelist
 */
function checkURLMatch(aLocationURI, { hosts, matchPatternSet }, aRequest) {
  // If checks pass we return a match
  let match;
  try {
    match = { host: aLocationURI.host, url: aLocationURI.spec };
  } catch (e) {
    // nsIURI.host can throw for non-nsStandardURL nsIURIs
    return false;
  }

  // Check current location against whitelisted hosts
  if (hosts.has(match.host)) {
    return match;
  }

  if (matchPatternSet) {
    if (matchPatternSet.matches(match.url)) {
      return match;
    }
  }

  // Nothing else to check, return early
  if (!aRequest) {
    return false;
  }

  // The original URL at the start of the request
  const originalLocation = aRequest.QueryInterface(Ci.nsIChannel).originalURI;
  // We have been redirected
  if (originalLocation.spec !== aLocationURI.spec) {
    return (
      hosts.has(originalLocation.host) && {
        host: originalLocation.host,
        url: originalLocation.spec,
      }
    );
  }

  return false;
}

/**
 * A Map from trigger IDs to singleton trigger listeners. Each listener must
 * have idempotent `init` and `uninit` methods.
 */
this.ASRouterTriggerListeners = new Map([
  [
    "openBookmarkedURL",
    {
      id: "openBookmarkedURL",
      _initialized: false,
      _triggerHandler: null,
      _hosts: new Set(),
      bookmarkEvent: "bookmark-icon-updated",

      init(triggerHandler) {
        if (!this._initialized) {
          Services.obs.addObserver(this, this.bookmarkEvent);
          this._triggerHandler = triggerHandler;
          this._initialized = true;
        }
      },

      observe(subject, topic, data) {
        if (topic === this.bookmarkEvent && data === "starred") {
          const browser = Services.wm.getMostRecentBrowserWindow();
          if (browser) {
            this._triggerHandler(browser.gBrowser.selectedBrowser, {
              id: this.id,
            });
          }
        }
      },

      uninit() {
        if (this._initialized) {
          Services.obs.removeObserver(this, this.bookmarkEvent);
          this._initialized = false;
          this._triggerHandler = null;
          this._hosts = new Set();
        }
      },
    },
  ],
  [
    "frequentVisits",
    {
      id: "frequentVisits",
      _initialized: false,
      _triggerHandler: null,
      _hosts: null,
      _matchPatternSet: null,
      _visits: null,

      init(triggerHandler, hosts = [], patterns) {
        if (!this._initialized) {
          this.onTabSwitch = this.onTabSwitch.bind(this);
          EveryWindow.registerCallback(
            this.id,
            win => {
              if (!isPrivateWindow(win)) {
                win.addEventListener("TabSelect", this.onTabSwitch);
                win.gBrowser.addTabsProgressListener(this);
              }
            },
            win => {
              if (!isPrivateWindow(win)) {
                win.removeEventListener("TabSelect", this.onTabSwitch);
                win.gBrowser.removeTabsProgressListener(this);
              }
            }
          );
          this._visits = new Map();
          this._initialized = true;
        }
        this._triggerHandler = triggerHandler;
        if (patterns) {
          if (this._matchPatternSet) {
            this._matchPatternSet = new MatchPatternSet(
              new Set([...this._matchPatternSet.patterns, ...patterns]),
              MATCH_PATTERN_OPTIONS
            );
          } else {
            this._matchPatternSet = new MatchPatternSet(
              patterns,
              MATCH_PATTERN_OPTIONS
            );
          }
        }
        if (this._hosts) {
          hosts.forEach(h => this._hosts.add(h));
        } else {
          this._hosts = new Set(hosts); // Clone the hosts to avoid unexpected behaviour
        }
      },

      /* _updateVisits - Record visit timestamps for websites that match `this._hosts` and only
       * if it's been more than FEW_MINUTES since the last visit.
       * @param {string} host - Location host of current selected tab
       * @returns {boolean} - If the new visit has been recorded
       */
      _updateVisits(host) {
        const visits = this._visits.get(host);

        if (visits && Date.now() - visits[0] > FEW_MINUTES) {
          this._visits.set(host, [Date.now(), ...visits]);
          return true;
        }
        if (!visits) {
          this._visits.set(host, [Date.now()]);
          return true;
        }

        return false;
      },

      onTabSwitch(event) {
        if (!event.target.ownerGlobal.gBrowser) {
          return;
        }

        const { gBrowser } = event.target.ownerGlobal;
        const match = checkURLMatch(gBrowser.currentURI, {
          hosts: this._hosts,
          matchPatternSet: this._matchPatternSet,
        });
        if (match) {
          this.triggerHandler(gBrowser.selectedBrowser, match);
        }
      },

      triggerHandler(aBrowser, match) {
        const updated = this._updateVisits(match.host);

        // If the previous visit happend less than FEW_MINUTES ago
        // no updates were made, no need to trigger the handler
        if (!updated) {
          return;
        }

        this._triggerHandler(aBrowser, {
          id: this.id,
          param: match,
          context: {
            // Remapped to {host, timestamp} because JEXL operators can only
            // filter over collections (arrays of objects)
            recentVisits: this._visits
              .get(match.host)
              .map(timestamp => ({ host: match.host, timestamp })),
          },
        });
      },

      onLocationChange(aBrowser, aWebProgress, aRequest, aLocationURI, aFlags) {
        // Some websites trigger redirect events after they finish loading even
        // though the location remains the same. This results in onLocationChange
        // events to be fired twice.
        const isSameDocument = !!(
          aFlags & Ci.nsIWebProgressListener.LOCATION_CHANGE_SAME_DOCUMENT
        );
        if (aWebProgress.isTopLevel && !isSameDocument) {
          const match = checkURLMatch(
            aLocationURI,
            { hosts: this._hosts, matchPatternSet: this._matchPatternSet },
            aRequest
          );
          if (match) {
            this.triggerHandler(aBrowser, match);
          }
        }
      },

      uninit() {
        if (this._initialized) {
          EveryWindow.unregisterCallback(this.id);

          this._initialized = false;
          this._triggerHandler = null;
          this._hosts = null;
          this._matchPatternSet = null;
          this._visits = null;
        }
      },
    },
  ],

  /**
   * Attach listeners to every browser window to detect location changes, and
   * notify the trigger handler whenever we navigate to a URL with a hostname
   * we're looking for.
   */
  [
    "openURL",
    {
      id: "openURL",
      _initialized: false,
      _triggerHandler: null,
      _hosts: null,
      _matchPatternSet: null,

      /*
       * If the listener is already initialised, `init` will replace the trigger
       * handler and add any new hosts to `this._hosts`.
       */
      init(triggerHandler, hosts = [], patterns) {
        if (!this._initialized) {
          this.onLocationChange = this.onLocationChange.bind(this);
          EveryWindow.registerCallback(
            this.id,
            win => {
              if (!isPrivateWindow(win)) {
                win.addEventListener("TabSelect", this.onTabSwitch);
                win.gBrowser.addTabsProgressListener(this);
              }
            },
            win => {
              if (!isPrivateWindow(win)) {
                win.removeEventListener("TabSelect", this.onTabSwitch);
                win.gBrowser.removeTabsProgressListener(this);
              }
            }
          );

          this._initialized = true;
        }
        this._triggerHandler = triggerHandler;
        if (patterns) {
          if (this._matchPatternSet) {
            this._matchPatternSet = new MatchPatternSet(
              new Set([...this._matchPatternSet.patterns, ...patterns]),
              MATCH_PATTERN_OPTIONS
            );
          } else {
            this._matchPatternSet = new MatchPatternSet(
              patterns,
              MATCH_PATTERN_OPTIONS
            );
          }
        }
        if (this._hosts) {
          hosts.forEach(h => this._hosts.add(h));
        } else {
          this._hosts = new Set(hosts); // Clone the hosts to avoid unexpected behaviour
        }
      },

      uninit() {
        if (this._initialized) {
          EveryWindow.unregisterCallback(this.id);

          this._initialized = false;
          this._triggerHandler = null;
          this._hosts = null;
        }
      },

      onLocationChange(aBrowser, aWebProgress, aRequest, aLocationURI, aFlags) {
        // Some websites trigger redirect events after they finish loading even
        // though the location remains the same. This results in onLocationChange
        // events to be fired twice.
        const isSameDocument = !!(
          aFlags & Ci.nsIWebProgressListener.LOCATION_CHANGE_SAME_DOCUMENT
        );
        if (aWebProgress.isTopLevel && !isSameDocument) {
          const match = checkURLMatch(
            aLocationURI,
            { hosts: this._hosts, matchPatternSet: this._matchPatternSet },
            aRequest
          );
          if (match) {
            this._triggerHandler(aBrowser, { id: this.id, param: match });
          }
        }
      },
    },
  ],

  /**
   * Add an observer notification to notify the trigger handler whenever the user saves a new login
   * via the login capture doorhanger.
   */
  [
    "newSavedLogin",
    {
      _initialized: false,
      _triggerHandler: null,

      /**
       * If the listener is already initialised, `init` will replace the trigger
       * handler.
       */
      init(triggerHandler) {
        if (!this._initialized) {
          Services.obs.addObserver(this, "LoginStats:NewSavedPassword");
          this._initialized = true;
        }
        this._triggerHandler = triggerHandler;
      },

      uninit() {
        if (this._initialized) {
          Services.obs.removeObserver(this, "LoginStats:NewSavedPassword");

          this._initialized = false;
          this._triggerHandler = null;
        }
      },

      observe(aSubject, aTopic, aData) {
        if (aSubject.currentURI.asciiHost === "accounts.firefox.com") {
          // Don't notify about saved logins on the FxA login origin since this
          // trigger is used to promote login Sync and getting a recommendation
          // to enable Sync during the sign up process is a bad UX.
          return;
        }
        this._triggerHandler(aSubject, { id: "newSavedLogin" });
      },
    },
  ],

  /**
   * Attach listener to count location changes and notify the trigger handler
   * on content blocked event
   */
  [
    "trackingProtection",
    {
      _initialized: false,
      _triggerHandler: null,
      _events: [],
      _sessionPageLoad: 0,
      onLocationChange: null,

      init(triggerHandler, params, patterns) {
        params.forEach(p => this._events.push(p));

        if (!this._initialized) {
          Services.obs.addObserver(this, "SiteProtection:ContentBlockingEvent");
          this.onLocationChange = this._onLocationChange.bind(this);
          EveryWindow.registerCallback(
            this.id,
            win => {
              if (!isPrivateWindow(win)) {
                win.gBrowser.addTabsProgressListener(this);
              }
            },
            win => {
              if (!isPrivateWindow(win)) {
                win.gBrowser.removeTabsProgressListener(this);
              }
            }
          );

          this._initialized = true;
        }
        this._triggerHandler = triggerHandler;
      },

      uninit() {
        if (this._initialized) {
          Services.obs.removeObserver(
            this,
            "SiteProtection:ContentBlockingEvent"
          );

          for (let win of Services.wm.getEnumerator("navigator:browser")) {
            if (isPrivateWindow(win)) {
              continue;
            }
            win.gBrowser.removeTabsProgressListener(this);
          }

          this.onLocationChange = null;
          this._initialized = false;
        }
        this._triggerHandler = null;
        this._events = [];
        this._sessionPageLoad = 0;
      },

      observe(aSubject, aTopic, aData) {
        switch (aTopic) {
          case "SiteProtection:ContentBlockingEvent":
            const { browser, host, event } = aSubject.wrappedJSObject;
            if (this._events.includes(event)) {
              this._triggerHandler(browser, {
                id: "trackingProtection",
                param: {
                  host,
                  type: event,
                },
                context: {
                  pageLoad: this._sessionPageLoad,
                },
              });
            }
            break;
        }
      },

      _onLocationChange(
        aBrowser,
        aWebProgress,
        aRequest,
        aLocationURI,
        aFlags
      ) {
        // Some websites trigger redirect events after they finish loading even
        // though the location remains the same. This results in onLocationChange
        // events to be fired twice.
        const isSameDocument = !!(
          aFlags & Ci.nsIWebProgressListener.LOCATION_CHANGE_SAME_DOCUMENT
        );
        if (
          ["http", "https"].includes(aLocationURI.scheme) &&
          aWebProgress.isTopLevel &&
          !isSameDocument
        ) {
          this._sessionPageLoad += 1;
        }
      },
    },
  ],
]);

const EXPORTED_SYMBOLS = ["ASRouterTriggerListeners"];
