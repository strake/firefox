/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const Services = require("Services");
const {
  Component,
  createFactory,
} = require("devtools/client/shared/vendor/react");
const {
  connect,
} = require("devtools/client/shared/redux/visibility-handler-connect");
const { div } = require("devtools/client/shared/vendor/react-dom-factories");
const { L10N } = require("../utils/l10n");
const Actions = require("../actions/index");
const { PANELS } = require("../constants");

const PropTypes = require("devtools/client/shared/vendor/react-prop-types");

const Tabbar = createFactory(
  require("devtools/client/shared/components/tabs/TabBar")
);
const TabPanel = createFactory(
  require("devtools/client/shared/components/tabs/Tabs").TabPanel
);

loader.lazyGetter(this, "SearchPanel", function() {
  return createFactory(require("./search/SearchPanel"));
});

loader.lazyGetter(this, "RequestBlockingPanel", function() {
  return createFactory(require("./request-blocking/RequestBlockingPanel"));
});

class NetworkActionBar extends Component {
  static get propTypes() {
    return {
      connector: PropTypes.object.isRequired,
      selectedActionBarTabId: PropTypes.string,
      selectActionBarTab: PropTypes.func.isRequired,
    };
  }

  render() {
    const {
      connector,
      selectedActionBarTabId,
      selectActionBarTab,
    } = this.props;

    // The request blocking and search panels are available behind a pref
    const showBlockingPanel = Services.prefs.getBoolPref(
      "devtools.netmonitor.features.requestBlocking"
    );
    const showSearchPanel = Services.prefs.getBoolPref(
      "devtools.netmonitor.features.search"
    );

    return div(
      { className: "network-action-bar" },
      Tabbar(
        {
          activeTabId: selectedActionBarTabId,
          onSelect: id => selectActionBarTab(id),
        },
        showSearchPanel &&
          TabPanel(
            {
              id: "network-action-bar-search",
              title: L10N.getStr("netmonitor.actionbar.search"),
              className: "network-action-bar-search",
            },
            SearchPanel({ connector })
          ),
        showBlockingPanel &&
          TabPanel(
            {
              id: PANELS.BLOCKING,
              title: L10N.getStr("netmonitor.actionbar.requestBlocking"),
              className: "network-action-bar-blocked",
            },
            RequestBlockingPanel()
          )
      )
    );
  }
}

module.exports = connect(
  state => ({
    selectedActionBarTabId: state.ui.selectedActionBarTabId,
  }),
  dispatch => ({
    selectActionBarTab: id => dispatch(Actions.selectActionBarTab(id)),
  })
)(NetworkActionBar);
