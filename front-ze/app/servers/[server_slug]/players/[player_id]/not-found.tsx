import {StatusPage} from "components/common/StatusPage";

export default function NotFound() {
    return (
        <StatusPage code="404" title="Player Not Found">
            The player you're looking for seems to have despawned or never existed.
            Maybe it’s in another dimension?
        </StatusPage>
    );
}
