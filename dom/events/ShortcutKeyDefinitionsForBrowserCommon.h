/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

{u"keypress", nullptr, u" ", u"shift", u"cmd_scrollPageUp"},
//    {u"keypress", nullptr, u" ", nullptr, u"cmd_scrollPageDown"},
//    {u"keypress", nullptr, u"VK_BACK", nullptr, u"cmd_scrollPageUp"},
    {u"keypress", u"VK_UP", nullptr, nullptr, u"cmd_moveUp"},
    {u"keypress", u"VK_DOWN", nullptr, nullptr, u"cmd_moveDown"},
    {u"keypress", u"VK_LEFT", nullptr, nullptr, u"cmd_moveLeft"},
    {u"keypress", u"VK_RIGHT", nullptr, nullptr, u"cmd_moveRight"},
    {u"keypress", u"VK_PAGE_UP", nullptr, nullptr, u"cmd_movePageUp"},
    {u"keypress", u"VK_PAGE_DOWN", nullptr, nullptr, u"cmd_movePageDown"},
    {u"keypress", u"VK_PAGE_UP", nullptr, u"shift", u"cmd_selectPageUp"},
    {u"keypress", u"VK_PAGE_DOWN", nullptr, u"shift", u"cmd_selectPageDown"},
    {u"keypress", u"VK_HOME", nullptr, nullptr, u"cmd_beginLine"},
    {u"keypress", u"VK_END", nullptr, nullptr, u"cmd_endLine"},
    {u"keypress", u"VK_HOME", nullptr, u"control", u"cmd_moveTop"},
    {u"keypress", u"VK_END", nullptr, u"control", u"cmd_moveBottom"},
    {u"keypress", u"VK_HOME", nullptr, u"shift,control", u"cmd_selectTop"},
    {u"keypress", u"VK_END", nullptr, u"shift,control", u"cmd_selectBottom"},
    {u"keypress", u"VK_LEFT", nullptr, u"control", u"cmd_wordPrevious"},
    {u"keypress", u"VK_RIGHT", nullptr, u"control", u"cmd_wordNext"},
    {u"keypress", u"VK_LEFT", nullptr, u"control,shift", u"cmd_selectWordPrevious"},
    {u"keypress", u"VK_RIGHT", nullptr, u"control,shift", u"cmd_selectWordNext"},
    {u"keypress", u"VK_LEFT", nullptr, u"shift", u"cmd_selectCharPrevious"},
    {u"keypress", u"VK_RIGHT", nullptr, u"shift", u"cmd_selectCharNext"},
    {u"keypress", u"VK_HOME", nullptr, u"shift", u"cmd_selectBeginLine"},
    {u"keypress", u"VK_END", nullptr, u"shift", u"cmd_selectEndLine"},
    {u"keypress", u"VK_UP", nullptr, u"shift", u"cmd_selectLinePrevious"},
    {u"keypress", u"VK_DOWN", nullptr, u"shift", u"cmd_selectLineNext"},
    {u"keypress", nullptr, u"d", u"control", u"cmd_cut"},
    {u"keypress", nullptr, u"d", u"control,shift", u"cmd_copy"},
    {u"keypress", nullptr, u"y", u"control", u"cmd_paste"},
    {u"keypress", nullptr, u"_", u"control", u"cmd_undo"},
    {u"keypress", nullptr, u"_", u"control,shift", u"cmd_redo"},
    {u"keypress", nullptr, u"a", u"accel", u"cmd_selectAll"},
