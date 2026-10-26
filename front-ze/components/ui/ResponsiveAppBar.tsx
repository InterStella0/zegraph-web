import WebAppBar from "./WebAppBar";
import {withErrorCatch} from "components/common/withErrorCatch";

export default withErrorCatch(WebAppBar, () => "App bar is broken.");
