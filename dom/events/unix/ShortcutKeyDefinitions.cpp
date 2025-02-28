/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "../ShortcutKeys.h"

namespace mozilla {

ShortcutKeyData ShortcutKeys::sInputHandlers[] = {
#include "../ShortcutKeyDefinitionsForInputCommon.h"

    {nullptr, nullptr, nullptr, nullptr, nullptr}};

ShortcutKeyData ShortcutKeys::sTextAreaHandlers[] = {
#include "../ShortcutKeyDefinitionsForTextAreaCommon.h"

    {nullptr, nullptr, nullptr, nullptr, nullptr}};

ShortcutKeyData ShortcutKeys::sBrowserHandlers[] = {
#include "../ShortcutKeyDefinitionsForBrowserCommon.h"

    {u"keypress", u"VK_PAGE_UP", nullptr, nullptr, u"cmd_movePageUp"},
    {u"keypress", u"VK_PAGE_DOWN", nullptr, nullptr, u"cmd_movePageDown"},
    {u"keypress", u"VK_PAGE_UP", nullptr, u"shift", u"cmd_selectPageUp"},
    {u"keypress", u"VK_PAGE_DOWN", nullptr, u"shift", u"cmd_selectPageDown"},
    {u"keypress", u"VK_HOME", nullptr, nullptr, u"cmd_beginLine"},
    {u"keypress", u"VK_END", nullptr, nullptr, u"cmd_endLine"},
    {u"keypress", u"VK_HOME", nullptr, u"control", u"cmd_selectBeginLine"},
    {u"keypress", u"VK_END", nullptr, u"control", u"cmd_selectEndLine"},
    {u"keypress", u"VK_HOME", nullptr, u"shift", u"cmd_moveTop"},
    {u"keypress", u"VK_END", nullptr, u"shift", u"cmd_moveBottom"},
    {u"keypress", u"VK_HOME", nullptr, u"shift,control", u"cmd_selectTop"},
    {u"keypress", u"VK_END", nullptr, u"shift,control", u"cmd_selectBottom"},
    {u"keypress", u"VK_LEFT", nullptr, u"control", u"cmd_selectLeft"},
    {u"keypress", u"VK_RIGHT", nullptr, u"control", u"cmd_selectRight"},
    {u"keypress", u"VK_LEFT", nullptr, u"shift", u"cmd_moveLeft2"},
    {u"keypress", u"VK_RIGHT", nullptr, u"shift", u"cmd_moveRight2"},
    {u"keypress", u"VK_LEFT", nullptr, u"control,shift", u"cmd_selectLeft2"},
    {u"keypress", u"VK_RIGHT", nullptr, u"control,shift", u"cmd_selectRight2"},
    {u"keypress", u"VK_UP", nullptr, u"control", u"cmd_selectUp"},
    {u"keypress", u"VK_DOWN", nullptr, u"control", u"cmd_selectDown"},
    {u"keypress", u"VK_UP", nullptr, u"shift", u"cmd_moveUp2"},
    {u"keypress", u"VK_DOWN", nullptr, u"shift", u"cmd_moveDown2"},
    {u"keypress", u"VK_UP", nullptr, u"control,shift", u"cmd_selectUp2"},
    {u"keypress", u"VK_DOWN", nullptr, u"control,shift", u"cmd_selectDown2"},

    {nullptr, nullptr, nullptr, nullptr, nullptr}};

ShortcutKeyData ShortcutKeys::sEditorHandlers[] = {
#include "../ShortcutKeyDefinitionsForEditorCommon.h"


    {nullptr, nullptr, nullptr, nullptr, nullptr}};

}  // namespace mozilla
