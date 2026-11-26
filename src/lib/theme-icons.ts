/** Semantic names used by Icon, mapped to each library's real export. */
export type IconLibraryName = "lucide" | "phosphor" | "tabler" | "hugeicons" | "remixicon";

export class ThemeIcons {
  static readonly names = ["Activity","AlarmClock","ArrowRight","BookOpen","Bookmark","Brain","Calendar","CalendarDays","Check","CheckSquare","ChevronDown","Circle","CircleDot","ClipboardList","Clock","Coffee","FileText","Filter","Flame","Folder","Inbox","Info","Leaf","Library","Link","ListTodo","Maximize","Menu","Minus","Moon","Network","Pause","PenLine","Play","Plus","Repeat","RotateCcw","Search","Settings","SkipForward","Sparkles","Sun","Tag","Target","Timer","User","Volume2","VolumeX","X","Zap"] as const;
  static readonly exports: Record<string, Record<IconLibraryName, string>> = {
  "Activity": {
    "lucide": "Activity",
    "phosphor": "ActivityIcon",
    "tabler": "IconActivity",
    "hugeicons": "ActivityIcon",
    "remixicon": "RiPulseLine"
  },
  "AlarmClock": {
    "lucide": "AlarmClock",
    "phosphor": "Alarm",
    "tabler": "IconAlarm",
    "hugeicons": "AlarmClockIcon",
    "remixicon": "RiAlarmLine"
  },
  "ArrowRight": {
    "lucide": "ArrowRight",
    "phosphor": "ArrowRight",
    "tabler": "IconArrowRight",
    "hugeicons": "ArrowRightIcon",
    "remixicon": "RiArrowRightLine"
  },
  "BookOpen": {
    "lucide": "BookOpen",
    "phosphor": "BookOpen",
    "tabler": "IconBook",
    "hugeicons": "BookOpenIcon",
    "remixicon": "RiBookOpenLine"
  },
  "Bookmark": {
    "lucide": "Bookmark",
    "phosphor": "Bookmark",
    "tabler": "IconBookmark",
    "hugeicons": "BookmarkIcon",
    "remixicon": "RiBookmarkLine"
  },
  "Brain": {
    "lucide": "Brain",
    "phosphor": "Brain",
    "tabler": "IconBrain",
    "hugeicons": "BrainIcon",
    "remixicon": "RiBrainLine"
  },
  "Calendar": {
    "lucide": "Calendar",
    "phosphor": "Calendar",
    "tabler": "IconCalendar",
    "hugeicons": "CalendarIcon",
    "remixicon": "RiCalendarLine"
  },
  "CalendarDays": {
    "lucide": "CalendarDays",
    "phosphor": "CalendarDots",
    "tabler": "IconCalendarEvent",
    "hugeicons": "Calendar03Icon",
    "remixicon": "RiCalendarEventLine"
  },
  "Check": {
    "lucide": "Check",
    "phosphor": "Check",
    "tabler": "IconCheck",
    "hugeicons": "Tick02Icon",
    "remixicon": "RiCheckLine"
  },
  "ChevronDown": {
    "lucide": "ChevronDown",
    "phosphor": "CaretDown",
    "tabler": "IconChevronDown",
    "hugeicons": "ArrowDown01Icon",
    "remixicon": "RiArrowDownSLine"
  },
  "CheckSquare": {
    "lucide": "CheckSquare",
    "phosphor": "CheckSquare",
    "tabler": "IconSquareCheck",
    "hugeicons": "CheckmarkSquareIcon",
    "remixicon": "RiCheckboxLine"
  },
  "Circle": {
    "lucide": "Circle",
    "phosphor": "Circle",
    "tabler": "IconCircle",
    "hugeicons": "CircleIcon",
    "remixicon": "RiCircleLine"
  },
  "CircleDot": {
    "lucide": "CircleDot",
    "phosphor": "Circle",
    "tabler": "IconCircleDot",
    "hugeicons": "RecordIcon",
    "remixicon": "RiCheckboxBlankCircleLine"
  },
  "ClipboardList": {
    "lucide": "ClipboardList",
    "phosphor": "ClipboardText",
    "tabler": "IconClipboardList",
    "hugeicons": "ClipboardIcon",
    "remixicon": "RiClipboardLine"
  },
  "Clock": {
    "lucide": "Clock",
    "phosphor": "Clock",
    "tabler": "IconClock",
    "hugeicons": "ClockIcon",
    "remixicon": "RiTimeLine"
  },
  "Coffee": {
    "lucide": "Coffee",
    "phosphor": "Coffee",
    "tabler": "IconCoffee",
    "hugeicons": "CoffeeIcon",
    "remixicon": "RiCupLine"
  },
  "FileText": {
    "lucide": "FileText",
    "phosphor": "FileText",
    "tabler": "IconFileText",
    "hugeicons": "FileIcon",
    "remixicon": "RiFileTextLine"
  },
  "Filter": {
    "lucide": "Filter",
    "phosphor": "Funnel",
    "tabler": "IconFilter",
    "hugeicons": "FilterIcon",
    "remixicon": "RiFilterLine"
  },
  "Flame": {
    "lucide": "Flame",
    "phosphor": "Flame",
    "tabler": "IconFlame",
    "hugeicons": "FireIcon",
    "remixicon": "RiFireLine"
  },
  "Folder": {
    "lucide": "Folder",
    "phosphor": "Folder",
    "tabler": "IconFolder",
    "hugeicons": "FolderIcon",
    "remixicon": "RiFolderLine"
  },
  "Inbox": {
    "lucide": "Inbox",
    "phosphor": "Tray",
    "tabler": "IconInbox",
    "hugeicons": "InboxIcon",
    "remixicon": "RiInboxLine"
  },
  "Info": {
    "lucide": "Info",
    "phosphor": "Info",
    "tabler": "IconInfoCircle",
    "hugeicons": "InformationCircleIcon",
    "remixicon": "RiInformationLine"
  },
  "Leaf": {
    "lucide": "Leaf",
    "phosphor": "Leaf",
    "tabler": "IconLeaf",
    "hugeicons": "LeafIcon",
    "remixicon": "RiLeafLine"
  },
  "Library": {
    "lucide": "Library",
    "phosphor": "Books",
    "tabler": "IconLibrary",
    "hugeicons": "LibraryIcon",
    "remixicon": "RiBookShelfLine"
  },
  "Link": {
    "lucide": "Link",
    "phosphor": "Link",
    "tabler": "IconLink",
    "hugeicons": "LinkIcon",
    "remixicon": "RiLink"
  },
  "ListTodo": {
    "lucide": "ListTodo",
    "phosphor": "ListChecks",
    "tabler": "IconListCheck",
    "hugeicons": "CheckListIcon",
    "remixicon": "RiListCheck2"
  },
  "Maximize": {
    "lucide": "Maximize",
    "phosphor": "ArrowsOut",
    "tabler": "IconMaximize",
    "hugeicons": "MaximizeScreenIcon",
    "remixicon": "RiFullscreenLine"
  },
  "Menu": {
    "lucide": "Menu",
    "phosphor": "List",
    "tabler": "IconMenu2",
    "hugeicons": "MenuIcon",
    "remixicon": "RiMenuLine"
  },
  "Minus": {
    "lucide": "Minus",
    "phosphor": "Minus",
    "tabler": "IconMinus",
    "hugeicons": "MinusSignIcon",
    "remixicon": "RiSubtractLine"
  },
  "Moon": {
    "lucide": "Moon",
    "phosphor": "Moon",
    "tabler": "IconMoon",
    "hugeicons": "MoonIcon",
    "remixicon": "RiMoonLine"
  },
  "Network": {
    "lucide": "Network",
    "phosphor": "Network",
    "tabler": "IconTopologyRing",
    "hugeicons": "ShareIcon",
    "remixicon": "RiShareLine"
  },
  "Pause": {
    "lucide": "Pause",
    "phosphor": "Pause",
    "tabler": "IconPlayerPause",
    "hugeicons": "PauseIcon",
    "remixicon": "RiPauseLine"
  },
  "PenLine": {
    "lucide": "PenLine",
    "phosphor": "Pen",
    "tabler": "IconPencil",
    "hugeicons": "PencilEditIcon",
    "remixicon": "RiPencilLine"
  },
  "Play": {
    "lucide": "Play",
    "phosphor": "Play",
    "tabler": "IconPlayerPlay",
    "hugeicons": "PlayIcon",
    "remixicon": "RiPlayLine"
  },
  "Plus": {
    "lucide": "Plus",
    "phosphor": "Plus",
    "tabler": "IconPlus",
    "hugeicons": "PlusSignIcon",
    "remixicon": "RiAddLine"
  },
  "Repeat": {
    "lucide": "Repeat",
    "phosphor": "Repeat",
    "tabler": "IconRepeat",
    "hugeicons": "RepeatIcon",
    "remixicon": "RiRepeatLine"
  },
  "RotateCcw": {
    "lucide": "RotateCcw",
    "phosphor": "ArrowCounterClockwise",
    "tabler": "IconRotate",
    "hugeicons": "RotateClockwiseIcon",
    "remixicon": "RiRestartLine"
  },
  "Search": {
    "lucide": "Search",
    "phosphor": "MagnifyingGlass",
    "tabler": "IconSearch",
    "hugeicons": "SearchIcon",
    "remixicon": "RiSearchLine"
  },
  "Settings": {
    "lucide": "Settings",
    "phosphor": "Gear",
    "tabler": "IconSettings",
    "hugeicons": "SettingsIcon",
    "remixicon": "RiSettings3Line"
  },
  "SkipForward": {
    "lucide": "SkipForward",
    "phosphor": "SkipForward",
    "tabler": "IconPlayerSkipForward",
    "hugeicons": "NextIcon",
    "remixicon": "RiSkipForwardLine"
  },
  "Sparkles": {
    "lucide": "Sparkles",
    "phosphor": "Sparkle",
    "tabler": "IconSparkles",
    "hugeicons": "SparklesIcon",
    "remixicon": "RiSparklingLine"
  },
  "Sun": {
    "lucide": "Sun",
    "phosphor": "Sun",
    "tabler": "IconSun",
    "hugeicons": "SunIcon",
    "remixicon": "RiSunLine"
  },
  "Tag": {
    "lucide": "Tag",
    "phosphor": "Tag",
    "tabler": "IconTag",
    "hugeicons": "TagIcon",
    "remixicon": "RiPriceTag3Line"
  },
  "Target": {
    "lucide": "Target",
    "phosphor": "Target",
    "tabler": "IconTarget",
    "hugeicons": "TargetIcon",
    "remixicon": "RiFocus2Line"
  },
  "Timer": {
    "lucide": "Timer",
    "phosphor": "Timer",
    "tabler": "IconHourglass",
    "hugeicons": "TimerIcon",
    "remixicon": "RiTimerLine"
  },
  "User": {
    "lucide": "User",
    "phosphor": "User",
    "tabler": "IconUser",
    "hugeicons": "UserIcon",
    "remixicon": "RiUserLine"
  },
  "Volume2": {
    "lucide": "Volume2",
    "phosphor": "SpeakerHigh",
    "tabler": "IconVolume",
    "hugeicons": "VolumeHighIcon",
    "remixicon": "RiVolumeUpLine"
  },
  "VolumeX": {
    "lucide": "VolumeX",
    "phosphor": "SpeakerSlash",
    "tabler": "IconVolumeOff",
    "hugeicons": "VolumeOffIcon",
    "remixicon": "RiVolumeMuteLine"
  },
  "X": {
    "lucide": "X",
    "phosphor": "X",
    "tabler": "IconX",
    "hugeicons": "Cancel01Icon",
    "remixicon": "RiCloseLine"
  },
  "Zap": {
    "lucide": "Zap",
    "phosphor": "Lightning",
    "tabler": "IconBolt",
    "hugeicons": "ZapIcon",
    "remixicon": "RiFlashlightLine"
  }
};

  static resolve(library: string, name: string): string | undefined {
    const row = ThemeIcons.exports[name];
    if (!row || !(library in row)) return undefined;
    return row[library as IconLibraryName];
  }
}
