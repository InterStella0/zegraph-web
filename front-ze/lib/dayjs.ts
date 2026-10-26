import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import duration from "dayjs/plugin/duration";
import isoWeek from "dayjs/plugin/isoWeek";
import weekOfYear from "dayjs/plugin/weekOfYear";
import localizedFormat from "dayjs/plugin/localizedFormat";
import relativeTime from "dayjs/plugin/relativeTime";

// Every plugin the app uses, extended once. Import dayjs from here so no file depends on another having extended it;
// only root-layout components import core "dayjs", to keep these plugins out of every page's first load.
for (const plugin of [utc, timezone, duration, isoWeek, weekOfYear, localizedFormat, relativeTime]) dayjs.extend(plugin);

export default dayjs;
export type {Dayjs, ConfigType, ManipulateType} from "dayjs";
