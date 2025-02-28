/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at <http://mozilla.org/MPL/2.0/>. */

// @flow

const { Component } = require("react");
const dom = require("react-dom-factories");

import Services from "devtools-services";
const { appinfo } = Services;
const isMacOS = appinfo.OS === "Darwin";

const classnames = require("classnames");
const { MODE } = require("../../reps/constants");

const Utils = require("../utils");

const {
  getValue,
  nodeHasAccessors,
  nodeHasProperties,
  nodeIsBlock,
  nodeIsDefaultProperties,
  nodeIsFunction,
  nodeIsGetter,
  nodeIsMapEntry,
  nodeIsMissingArguments,
  nodeIsOptimizedOut,
  nodeIsPrimitive,
  nodeIsPrototype,
  nodeIsSetter,
  nodeIsUninitializedBinding,
  nodeIsUnmappedBinding,
  nodeIsUnscopedBinding,
  nodeIsWindow,
  nodeIsLongString,
  nodeHasFullText,
  nodeHasGetter,
  getNonPrototypeParentGripValue,
  getParentGripValue,
} = Utils.node;

type Props = {
  item: Node,
  depth: number,
  expanded: boolean,
  focused: boolean,
  arrow: ReactElement,
  setExpanded: (item: Node, expanded: boolean) => void,
  mode: Mode,
  dimTopLevelWindow: boolean,
  invokeGetter: () => void,
  onDoubleClick: ?(
    item: Node,
    options: {
      depth: number,
      focused: boolean,
      expanded: boolean,
    }
  ) => any,
  onCmdCtrlClick: ?(
    item: Node,
    options: {
      depth: number,
      event: SyntheticEvent,
      focused: boolean,
      expanded: boolean,
    }
  ) => any,
  onLabelClick: ?(
    item: Node,
    options: {
      depth: number,
      focused: boolean,
      expanded: boolean,
      setExpanded: (Node, boolean) => any,
    }
  ) => any,
};

class ObjectInspectorItem extends Component<Props> {
  static get defaultProps() {
    return {
      onContextMenu: () => {},
    };
  }

  // eslint-disable-next-line complexity
  getLabelAndValue(): {
    value?: string | Element,
    label?: string,
  } {
    const { item, depth, expanded, mode } = this.props;

    const label = item.name;
    const isPrimitive = nodeIsPrimitive(item);

    if (nodeIsOptimizedOut(item)) {
      return {
        label,
        value: dom.span({ className: "unavailable" }, "(optimized away)"),
      };
    }

    if (nodeIsUninitializedBinding(item)) {
      return {
        label,
        value: dom.span({ className: "unavailable" }, "(uninitialized)"),
      };
    }

    if (nodeIsUnmappedBinding(item)) {
      return {
        label,
        value: dom.span({ className: "unavailable" }, "(unmapped)"),
      };
    }

    if (nodeIsUnscopedBinding(item)) {
      return {
        label,
        value: dom.span({ className: "unavailable" }, "(unscoped)"),
      };
    }

    const itemValue = getValue(item);
    const unavailable =
      isPrimitive &&
      itemValue &&
      itemValue.hasOwnProperty &&
      itemValue.hasOwnProperty("unavailable");

    if (nodeIsMissingArguments(item) || unavailable) {
      return {
        label,
        value: dom.span({ className: "unavailable" }, "(unavailable)"),
      };
    }

    if (
      nodeIsFunction(item) &&
      !nodeIsGetter(item) &&
      !nodeIsSetter(item) &&
      (mode === MODE.TINY || !mode)
    ) {
      return {
        label: Utils.renderRep(item, {
          ...this.props,
          functionName: label,
        }),
      };
    }

    if (
      nodeHasProperties(item) ||
      nodeHasAccessors(item) ||
      nodeIsMapEntry(item) ||
      nodeIsLongString(item) ||
      isPrimitive
    ) {
      const repProps = { ...this.props };
      if (depth > 0) {
        repProps.mode = mode === MODE.LONG ? MODE.SHORT : MODE.TINY;
      }
      if (expanded) {
        repProps.mode = MODE.TINY;
      }

      if (nodeIsLongString(item)) {
        repProps.member = {
          open: nodeHasFullText(item) && expanded,
        };
      }

      if (nodeHasGetter(item)) {
        const targetGrip = getParentGripValue(item);
        const receiverGrip = getNonPrototypeParentGripValue(item);
        if (targetGrip && receiverGrip) {
          let propertyName = item.name;
          // If we're dealing with a property that can't be accessed
          // with the dot notation, for example: x["hello-world"]
          if (propertyName.startsWith(`"`) && propertyName.endsWith(`"`)) {
            // We remove the quotes wrapping the property name, and we replace any
            // "double" escaped quotes (\\\") by simple escaped ones (\").
            propertyName = propertyName
              .substring(1, propertyName.length - 1)
              .replace(/\\\"/g, `\"`);
          }

          Object.assign(repProps, {
            onInvokeGetterButtonClick: () =>
              this.props.invokeGetter(
                item,
                targetGrip,
                receiverGrip.actor,
                propertyName
              ),
          });
        }
      }

      return {
        label,
        value: Utils.renderRep(item, repProps),
      };
    }

    return {
      label,
    };
  }

  getTreeItemProps(): Object {
    const {
      item,
      depth,
      focused,
      expanded,
      onCmdCtrlClick,
      onDoubleClick,
      dimTopLevelWindow,
      onContextMenu,
    } = this.props;

    const parentElementProps: Object = {
      className: classnames("node object-node", {
        focused,
        lessen:
          !expanded &&
          (nodeIsDefaultProperties(item) ||
            nodeIsPrototype(item) ||
            nodeIsGetter(item) ||
            nodeIsSetter(item) ||
            (dimTopLevelWindow === true && nodeIsWindow(item) && depth === 0)),
        block: nodeIsBlock(item),
      }),
      onClick: e => {
        if (
          onCmdCtrlClick &&
          ((isMacOS && e.metaKey) || (!isMacOS && e.ctrlKey))
        ) {
          onCmdCtrlClick(item, {
            depth,
            event: e,
            focused,
            expanded,
          });
          e.stopPropagation();
          return;
        }

        // If this click happened because the user selected some text, bail out.
        // Note that if the user selected some text before and then clicks here,
        // the previously selected text will be first unselected, unless the
        // user clicked on the arrow itself. Indeed because the arrow is an
        // image, clicking on it does not remove any existing text selection.
        // So we need to also check if the arrow was clicked.
        if (
          e.target &&
          Utils.selection.documentHasSelection(e.target.ownerDocument) &&
          !(e.target.matches && e.target.matches(".arrow"))
        ) {
          e.stopPropagation();
        }
      },
      onContextMenu: e => onContextMenu(e, item),
    };

    if (onDoubleClick) {
      parentElementProps.onDoubleClick = e => {
        e.stopPropagation();
        onDoubleClick(item, {
          depth,
          focused,
          expanded,
        });
      };
    }

    return parentElementProps;
  }

  renderLabel(label: string) {
    if (label === null || typeof label === "undefined") {
      return null;
    }

    const { item, depth, focused, expanded, onLabelClick } = this.props;
    return dom.span(
      {
        className: "object-label",
        onClick: onLabelClick
          ? event => {
              event.stopPropagation();

              // If the user selected text, bail out.
              if (
                Utils.selection.documentHasSelection(event.target.ownerDocument)
              ) {
                return;
              }

              onLabelClick(item, {
                depth,
                focused,
                expanded,
                setExpanded: this.props.setExpanded,
              });
            }
          : undefined,
      },
      label
    );
  }

  renderWatchpointButton() {
    const { item, removeWatchpoint } = this.props;

    if (!item || !item.contents || !item.contents.watchpoint) {
      return;
    }

    const watchpoint = item.contents.watchpoint;
    return dom.button({
      className: `remove-${watchpoint}-watchpoint`,
      title: L10N.getStr("watchpoints.removeWatchpointTooltip"),
      onClick: () => removeWatchpoint(item),
    });
  }

  render() {
    const { arrow } = this.props;

    const { label, value } = this.getLabelAndValue();
    const labelElement = this.renderLabel(label);
    const delimiter =
      value && labelElement
        ? dom.span({ className: "object-delimiter" }, ": ")
        : null;

    return dom.div(
      this.getTreeItemProps(),
      arrow,
      labelElement,
      delimiter,
      value,
      this.renderWatchpointButton()
    );
  }
}

module.exports = ObjectInspectorItem;
