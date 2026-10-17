import { Card } from "components/ui/card";
import { AdSpot } from "components/ui/AdSpot";
import MapAnalyzeAttributes from "components/maps/MapAnalyzeAttributes.tsx";
import MapSessionList from "components/maps/MapSessionList.tsx";
import MapTopPlayerList from "components/maps/MapTopPlayerList.tsx";
import MapAverageSessionDistribution from "components/maps/MapAverageSessionDistribution.tsx";
import MapPlayerType from "components/maps/MapPlayerType.tsx";
import GlobalMapHeader from "components/maps/global/GlobalMapHeader";
import MapServerBreakdown from "components/maps/global/MapServerBreakdown";

export default function Loading(){
    return (
        <div className="grid grid-cols-12 gap-5 mx-10 max-sm:mx-2 my-2">
            <div className="col-span-12 xl:col-span-8 lg:col-span-9">
                <GlobalMapHeader loggedIn={false} />
            </div>
            <div className="col-span-12 xl:col-span-4 lg:col-span-3">
                <MapAnalyzeAttributes />
            </div>
            <div className="col-span-12" />
            <div className="col-span-12">
                <AdSpot />
            </div>
            <div className="col-span-12">
                <Card>
                    <MapServerBreakdown />
                </Card>
            </div>
            <div className="col-span-12 xl:col-span-4 lg:col-span-7 md:col-span-6">
                <MapSessionList />
            </div>
            <div className="col-span-12 xl:col-span-4 lg:col-span-5 md:col-span-6">
                <MapTopPlayerList />
            </div>
            <div className="col-span-12 xl:col-span-4 lg:col-span-12">
                <div className="grid grid-cols-2 lg:grid-cols-1 gap-4">
                    <div className="xl:col-span-6 lg:col-span-6 md:col-span-12 col-span-12">
                        <MapAverageSessionDistribution />
                    </div>
                    <div className="xl:col-span-6 lg:col-span-6 md:col-span-12 col-span-12">
                        <MapPlayerType />
                    </div>
                </div>
            </div>
        </div>
    );
}
