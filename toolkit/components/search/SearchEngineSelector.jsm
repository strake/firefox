/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var EXPORTED_SYMBOLS = ["SearchEngineSelector"];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyGlobalGetters(this, ["fetch"]);

XPCOMUtils.defineLazyModuleGetters(this, {
  SearchUtils: "resource://gre/modules/SearchUtils.jsm",
  Services: "resource://gre/modules/Services.jsm",
});

const EXT_SEARCH_PREFIX = "resource://search-extensions/";
const ENGINE_CONFIG_URL = `${EXT_SEARCH_PREFIX}engines.json`;
const USER_LOCALE = "$USER_LOCALE";

function log(str) {
  SearchUtils.log("SearchEngineSelector " + str + "\n");
}

/**
 * SearchEngineSelector parses the JSON configuration for
 * search engines and returns the applicable engines depending
 * on their region + locale.
 */
class SearchEngineSelector {
  /**
   * @param {string} url - Location of the configuration.
   */
  async init(url = ENGINE_CONFIG_URL) {
    this.configuration = await this.getEngineConfiguration(url);
  }

  /**
   * @param {string} url - Location of the configuration.
   */
  async getEngineConfiguration(url) {
    const response = await fetch(url);
    return (await response.json()).data;
  }

  /**
   * @param {string} locale - Users locale.
   * @param {string} region - Users region.
   * @returns {object} result - An object with "engines" field, a sorted
   *   list of engines and optionally "privateDefault" indicating the
   *   name of the engine which should be the default in private.
   */
  fetchEngineConfiguration(locale, region = "default") {
    log(`fetchEngineConfiguration ${region}:${locale}`);
    let cohort = Services.prefs.getCharPref("browser.search.cohort", null);
    let engines = [];
    for (let config of this.configuration) {
      const appliesTo = config.appliesTo || [];
      const applies = appliesTo.filter(section => {
        let included =
          "included" in section &&
          this._isInSection(region, locale, section.included);
        let excluded =
          "excluded" in section &&
          this._isInSection(region, locale, section.excluded);
        if ("cohort" in section && cohort != section.cohort) {
          return false;
        }
        return included && !excluded;
      });

      let baseConfig = this._copyObject({}, config);

      // Loop through all the appliedTo sections that apply to
      // this configuration
      if (applies.length) {
        for (let section of applies) {
          this._copyObject(baseConfig, section);
        }

        if ("webExtensionLocales" in baseConfig) {
          baseConfig.webExtensionLocales = baseConfig.webExtensionLocales.map(
            val => (val == USER_LOCALE ? locale : val)
          );
        }

        engines.push(baseConfig);
      }
    }

    engines = this._filterEngines(engines);

    let defaultEngine;
    let privateEngine;

    function shouldPrefer(setting, hasCurrentDefault, currentDefaultSetting) {
      if (
        setting == "yes" &&
        (!hasCurrentDefault || currentDefaultSetting == "yes-if-no-other")
      ) {
        return true;
      }
      return setting == "yes-if-no-other" && !hasCurrentDefault;
    }

    for (const engine of engines) {
      if (
        "default" in engine &&
        shouldPrefer(
          engine.default,
          !!defaultEngine,
          defaultEngine && defaultEngine.default
        )
      ) {
        defaultEngine = engine;
      }
      if (
        "defaultPrivate" in engine &&
        shouldPrefer(
          engine.defaultPrivate,
          !!privateEngine,
          privateEngine && privateEngine.defaultPrivate
        )
      ) {
        privateEngine = engine;
      }
    }

    engines.sort(this._sort.bind(this, defaultEngine, privateEngine));

    let result = { engines };

    if (privateEngine) {
      result.privateDefault = privateEngine.engineName;
    }

    if (SearchUtils.loggingEnabled) {
      log("fetchEngineConfiguration: " + JSON.stringify(result));
    }
    return result;
  }

  _sort(defaultEngine, privateEngine, a, b) {
    return (
      this._sortIndex(b, defaultEngine, privateEngine) -
      this._sortIndex(a, defaultEngine, privateEngine)
    );
  }

  /**
   * Create an index order to ensure default (and backup default)
   * engines are ordered correctly.
   * @param {object} obj
   *   Object representing the engine configation.
   * @param {object} defaultEngine
   *   The default engine, for comparison to obj.
   * @param {object} privateEngine
   *   The private engine, for comparison to obj.
   * @returns {integer}
   *  Number indicating how this engine should be sorted.
   */
  _sortIndex(obj, defaultEngine, privateEngine) {
    if (obj == defaultEngine) {
      return Number.MAX_SAFE_INTEGER;
    }
    if (obj == privateEngine) {
      return Number.MAX_SAFE_INTEGER - 1;
    }
    return obj.orderHint || 0;
  }

  /**
   * Filter any search engines that are preffed to be ignored,
   * the pref is only allowed in partner distributions.
   * @param {Array} engines - The list of engines to be filtered.
   * @returns {Array} - The engine list with filtered removed.
   */
  _filterEngines(engines) {
    let branch = Services.prefs.getDefaultBranch(
      SearchUtils.BROWSER_SEARCH_PREF
    );
    if (
      SearchUtils.isPartnerBuild() &&
      branch.getPrefType("ignoredJAREngines") == branch.PREF_STRING
    ) {
      let ignoredJAREngines = branch
        .getCharPref("ignoredJAREngines")
        .split(",");
      let filteredEngines = engines.filter(engine => {
        let name = engine.webExtensionId.split("@")[0];
        return !ignoredJAREngines.includes(name);
      });
      // Don't allow all engines to be hidden
      if (filteredEngines.length) {
        engines = filteredEngines;
      }
    }
    return engines;
  }

  /**
   * Is the engine marked to be the default search engine.
   * @param {object} obj - Object representing the engine configation.
   * @returns {boolean} - Whether the engine should be default.
   */
  _isDefault(obj) {
    return "default" in obj && obj.default === "yes";
  }

  /**
   * Object.assign but ignore some keys
   * @param {object} target - Object to copy to.
   * @param {object} source - Object top copy from.
   * @returns {object} - The source object.
   */
  _copyObject(target, source) {
    for (let key in source) {
      if (["included", "excluded", "appliesTo"].includes(key)) {
        continue;
      }
      target[key] = source[key];
    }
    return target;
  }

  /**
   * Determines wether the section of the config applies to a user
   * given what region + locale they are using.
   * @param {string} region - The region the user is in.
   * @param {string} locale - The language the user has configured.
   * @param {object} config - Section of configuration.
   * @returns {boolean} - Does the section apply for the region + locale.
   */
  _isInSection(region, locale, config) {
    if (!config) {
      return false;
    }
    if (config.everywhere) {
      return true;
    }
    let locales = config.locales || {};
    let inLocales = locales.matches && locales.matches.includes(locale);
    let inRegions = config.regions && config.regions.includes(region);
    if (
      locales.startsWith &&
      locales.startsWith.some(key => locale.startsWith(key))
    ) {
      inLocales = true;
    }
    if (config.locales && config.regions) {
      return inLocales && inRegions;
    }
    return inLocales || inRegions;
  }
}
